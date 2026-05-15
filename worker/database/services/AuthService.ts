/**
 * Main Authentication Service
 * Orchestrates auth operations including local email auth and Clerk identity sync
 */

import * as schema from '../schema';
import { eq, and, sql, isNull, or } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { JWTUtils } from '../../utils/jwtUtils';
import { SessionService } from './SessionService';
import { PasswordService } from '../../utils/passwordService';
import { 
    SecurityError, 
    SecurityErrorType 
} from 'shared/types/errors';
import { AuthResult, AuthUserSession } from '../../types/auth-types';
import { generateId } from '../../utils/idGenerator';
import { AuthUser } from '../../types/auth-types';
import {
    getDefaultBuzzDisplayName,
    isGenericBuzzDisplayName,
    isPhoneNumberLike,
    mapUserResponse
} from '../../utils/authUtils';
import { createLogger } from '../../logger';
import { validateEmail, validatePassword } from '../../utils/validationUtils';
import { extractRequestMetadata } from '../../utils/authUtils';
import { BaseService } from './BaseService';

const logger = createLogger('AuthService');

const DICEBEAR_AVATAR_STYLES = [
    'avataaars',
    'adventurer',
    'big-ears',
    'lorelei',
    'micah',
    'notionists',
    'open-peeps',
    'personas',
    'thumbs',
] as const;

const LEGACY_PROVIDER_AVATAR_PREFIXES = [
    'https://avatars.githubusercontent.com/',
    'https://lh3.googleusercontent.com/',
];

const clerkJwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

interface ClerkEmailAddress {
    id: string;
    email_address?: string;
    verification?: {
        status?: string;
    };
}

interface ClerkPhoneNumber {
    id: string;
    phone_number?: string;
    verification?: {
        status?: string;
    };
}

interface ClerkApiUser {
    id: string;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
    primary_email_address_id?: string | null;
    email_addresses?: ClerkEmailAddress[];
    primary_phone_number_id?: string | null;
    phone_numbers?: ClerkPhoneNumber[];
}

interface ClerkUserProfile {
    clerkUserId: string;
    email: string;
    displayName: string;
    emailVerified: boolean;
    identifier: string;
    hasEmailAddress: boolean;
    hasPhoneNumber: boolean;
    isPhoneOnly: boolean;
}

const CLERK_PHONE_EMAIL_DOMAIN = 'clerk-phone.buzzplay.internal';
const DELETED_USER_EMAIL_DOMAIN = 'deleted.buzzplay.internal';

function getRandomDiceBearStyle(): typeof DICEBEAR_AVATAR_STYLES[number] {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return DICEBEAR_AVATAR_STYLES[values[0] % DICEBEAR_AVATAR_STYLES.length];
}

function getDiceBearAvatarUrl(seed: string): string {
    const style = getRandomDiceBearStyle();
    return `https://api.dicebear.com/10.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

function shouldAssignDiceBearAvatar(avatarUrl?: string | null): boolean {
    if (!avatarUrl) {
        return true;
    }

    if (avatarUrl.includes('api.dicebear.com/9.x/')) {
        return true;
    }

    return LEGACY_PROVIDER_AVATAR_PREFIXES.some((prefix) => avatarUrl.startsWith(prefix));
}

function getClerkFallbackEmail(clerkUserId: string): string {
    const safeId = clerkUserId
        .toLowerCase()
        .replace(/[^a-z0-9.!#$%&'*+/=?^_`{|}~-]/g, '-');

    return `${safeId}@${CLERK_PHONE_EMAIL_DOMAIN}`;
}

function getDefaultBuzzUsername(userId: string): string {
    return `buzz_${userId.replace(/-/g, '').toLowerCase().slice(0, 10)}`;
}

function getCachedClerkJwks(jwksUrl: string) {
    let jwks = clerkJwksCache.get(jwksUrl);
    if (!jwks) {
        jwks = createRemoteJWKSet(new URL(jwksUrl));
        clerkJwksCache.set(jwksUrl, jwks);
    }
    return jwks;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
    email: string;
    password: string;
}

/**
 * Registration data
 */
export interface RegistrationData {
    email: string;
    password: string;
    name?: string;
}


/**
 * Main Authentication Service
 */
export class AuthService extends BaseService {
    private readonly sessionService: SessionService;
    private readonly passwordService: PasswordService;
    
    constructor(
        env: Env,
    ) {
        super(env);
        this.sessionService = new SessionService(env);
        this.passwordService = new PasswordService();
    }
    
    /**
     * Register a new user
     */
    async register(data: RegistrationData, request: Request): Promise<AuthResult> {
        try {
            // Validate email format using centralized utility
            const emailValidation = validateEmail(data.email);
            if (!emailValidation.valid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    emailValidation.error || 'Invalid email format',
                    400
                );
            }
            
            // Validate password using centralized utility
            const passwordValidation = validatePassword(data.password, undefined, {
                email: data.email,
                name: data.name
            });
            if (!passwordValidation.valid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    passwordValidation.errors!.join(', '),
                    400
                );
            }
            
            // Check if user already exists
            const existingUser = await this.database
                .select()
                .from(schema.users)
                .where(and(
                    eq(schema.users.email, data.email.toLowerCase()),
                    isNull(schema.users.deletedAt)
                ))
                .get();
            
            if (existingUser) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Email already registered',
                    400
                );
            }
            
            // Hash password
            const passwordHash = await this.passwordService.hash(data.password);
            
            // Create user
            const userId = generateId();
            const now = new Date();
            const email = data.email.toLowerCase();
            const avatarUrl = getDiceBearAvatarUrl(`${userId}:${email}`);
            
            // Store user as verified immediately (no OTP verification required)
            await this.database.insert(schema.users).values({
                id: userId,
                email,
                passwordHash,
                displayName: data.name || data.email.split('@')[0],
                avatarUrl,
                emailVerified: true, // Set as verified immediately
                provider: 'email',
                providerId: userId,
                createdAt: now,
                updatedAt: now
            });
            
            // Get the created user
            const newUser = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .get();
            
            if (!newUser) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Failed to retrieve created user',
                    500
                );
            }
            
            // Log successful registration
            await this.logAuthAttempt(data.email, 'register', true, request);
            logger.info('User registered and logged in directly', { userId, email: data.email });
            
            // Create session and tokens immediately (log user in after registration)
            const { accessToken, session } = await this.sessionService.createSession(
                userId,
                request
            );
            
            return {
                user: mapUserResponse(newUser),
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
                accessToken,
            };
        } catch (error) {
            await this.logAuthAttempt(data.email, 'register', false, request);
            
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('Registration error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Registration failed',
                500
            );
        }
    }
    
    /**
     * Login with email and password
     */
    async login(credentials: LoginCredentials, request: Request): Promise<AuthResult> {
        try {
            // Find user
            let user = await this.database
                .select()
                .from(schema.users)
                .where(
                    and(
                        eq(schema.users.email, credentials.email.toLowerCase()),
                        sql`${schema.users.deletedAt} IS NULL`
                    )
                )
                .get();
            
            if (!user || !user.passwordHash) {
                await this.logAuthAttempt(credentials.email, 'login', false, request);
                throw new SecurityError(
                    SecurityErrorType.UNAUTHORIZED,
                    'Invalid email or password',
                    401
                );
            }
            
            // Verify password
            const passwordValid = await this.passwordService.verify(
                credentials.password,
                user.passwordHash
            );
            
            if (!passwordValid) {
                await this.logAuthAttempt(credentials.email, 'login', false, request);
                throw new SecurityError(
                    SecurityErrorType.UNAUTHORIZED,
                    'Invalid email or password',
                    401
                );
            }
            
            if (shouldAssignDiceBearAvatar(user.avatarUrl)) {
                const avatarUrl = getDiceBearAvatarUrl(`${user.id}:${user.email}`);
                const updatedAt = new Date();
                await this.database
                    .update(schema.users)
                    .set({
                        avatarUrl,
                        updatedAt,
                    })
                    .where(eq(schema.users.id, user.id));
                user = { ...user, avatarUrl, updatedAt };
            }
            
            // Create session
            const { accessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );
            
            // Log successful attempt
            await this.logAuthAttempt(credentials.email, 'login', true, request);
            
            logger.info('User logged in', { userId: user.id, email: user.email });
            
            return {
                user: mapUserResponse(user),
                accessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('Login error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Login failed',
                500
            );
        }
    }
    
    /**
     * Logout
     */
    async logout(sessionId: string): Promise<void> {
        try {
            await this.sessionService.revokeSessionId(sessionId);
            logger.info('User logged out', { sessionId });
        } catch (error) {
            logger.error('Logout error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Logout failed',
                500
            );
        }
    }

    /**
     * Verify a Clerk session token, map it to a local user, and create the
     * existing Buzz session so downstream APIs keep using local user IDs.
     */
    async loginWithClerk(clerkToken: string, request: Request): Promise<AuthResult> {
        let profile: ClerkUserProfile | null = null;

        try {
            profile = await this.getClerkUserProfile(clerkToken);
            const user = await this.findOrCreateClerkUser(profile);

            const { accessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );

            await this.logAuthAttempt(profile.identifier, 'clerk', true, request);
            logger.info('Clerk login successful', {
                userId: user.id,
                clerkUserId: profile.clerkUserId,
            });

            return {
                user: mapUserResponse(user),
                accessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            await this.logAuthAttempt(profile?.identifier || '', 'clerk', false, request);

            if (error instanceof SecurityError) {
                throw error;
            }

            logger.error('Clerk login error', error);
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Clerk authentication failed',
                500
            );
        }
    }

    /**
     * Remove account identity while keeping project records hidden for recovery/audit.
     *
     * The user row is retained because apps reference it, but all reusable identity
     * fields are freed so the same email / Clerk account can create a fresh local user later.
     */
    async deleteAccount(userId: string): Promise<{
        user: schema.User;
        hiddenAppCount: number;
    }> {
        const user = await this.database
            .select()
            .from(schema.users)
            .where(and(
                eq(schema.users.id, userId),
                isNull(schema.users.deletedAt)
            ))
            .get();

        if (!user) {
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Account not found',
                404
            );
        }

        const now = new Date();
        const deletedEmail = `deleted+${user.id}@${DELETED_USER_EMAIL_DOMAIN}`;
        const deletedProviderId = `deleted:${user.id}`;

        // Hide projects without deleting project data.
        const hiddenApps = await this.database
            .update(schema.apps)
            .set({
                visibility: 'private',
                isArchived: true,
                hiddenFromBrowse: true,
                updatedAt: now,
            })
            .where(eq(schema.apps.userId, user.id))
            .returning({ id: schema.apps.id });

        // Remove account-owned auth, preference, and social graph data.
        await this.database.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
        await this.database.delete(schema.apiKeys).where(eq(schema.apiKeys.userId, user.id));
        await this.database.delete(schema.passwordResetTokens).where(eq(schema.passwordResetTokens.userId, user.id));
        await this.database.delete(schema.emailVerificationTokens).where(eq(schema.emailVerificationTokens.userId, user.id));
        await this.database.delete(schema.verificationOtps).where(eq(schema.verificationOtps.email, user.email));
        await this.database.delete(schema.oauthStates).where(eq(schema.oauthStates.userId, user.id));
        await this.database.delete(schema.favorites).where(eq(schema.favorites.userId, user.id));
        await this.database.delete(schema.stars).where(eq(schema.stars.userId, user.id));
        await this.database.delete(schema.appLikes).where(eq(schema.appLikes.userId, user.id));
        await this.database.delete(schema.commentLikes).where(eq(schema.commentLikes.userId, user.id));
        await this.database.delete(schema.appViews).where(eq(schema.appViews.userId, user.id));
        await this.database.delete(schema.userModelConfigs).where(eq(schema.userModelConfigs.userId, user.id));
        await this.database.delete(schema.userModelProviders).where(eq(schema.userModelProviders.userId, user.id));
        await this.database.delete(schema.userFollows).where(or(
            eq(schema.userFollows.followerId, user.id),
            eq(schema.userFollows.followingId, user.id)
        ));

        await this.database
            .update(schema.appComments)
            .set({
                content: '',
                isDeleted: true,
                updatedAt: now,
            })
            .where(eq(schema.appComments.userId, user.id));

        await this.database
            .update(schema.auditLogs)
            .set({ userId: null })
            .where(eq(schema.auditLogs.userId, user.id));

        await this.database
            .update(schema.systemSettings)
            .set({ updatedBy: null, updatedAt: now })
            .where(eq(schema.systemSettings.updatedBy, user.id));

        await this.database
            .update(schema.users)
            .set({
                email: deletedEmail,
                username: null,
                displayName: 'Deleted user',
                avatarUrl: null,
                bio: null,
                provider: 'deleted',
                providerId: deletedProviderId,
                clerkUserId: null,
                emailVerified: false,
                passwordHash: null,
                failedLoginAttempts: 0,
                lockedUntil: null,
                passwordChangedAt: null,
                preferences: '{}',
                timezone: 'UTC',
                isActive: false,
                isSuspended: false,
                updatedAt: now,
                lastActiveAt: null,
                deletedAt: now,
            })
            .where(eq(schema.users.id, user.id));

        logger.info('Account deleted locally', {
            userId: user.id,
            hiddenAppCount: hiddenApps.length,
        });

        return {
            user,
            hiddenAppCount: hiddenApps.length,
        };
    }

    private async getClerkUserProfile(clerkToken: string): Promise<ClerkUserProfile> {
        if (!this.env.CLERK_SECRET_KEY) {
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Clerk is not configured',
                503
            );
        }

        const payload = await this.verifyClerkToken(clerkToken);
        const clerkUserId = typeof payload.sub === 'string' ? payload.sub : '';
        if (!clerkUserId) {
            throw new SecurityError(
                SecurityErrorType.INVALID_TOKEN,
                'Invalid Clerk session',
                401
            );
        }

        const response = await fetch(
            `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
            {
                headers: {
                    Authorization: `Bearer ${this.env.CLERK_SECRET_KEY}`,
                    Accept: 'application/json',
                },
            }
        );

        if (!response.ok) {
            logger.warn('Failed to fetch Clerk user', {
                clerkUserId,
                status: response.status,
            });
            throw new SecurityError(
                SecurityErrorType.UNAUTHORIZED,
                'Unable to verify Clerk user',
                401
            );
        }

        const clerkUser = await response.json() as ClerkApiUser;
        const primaryEmail =
            clerkUser.email_addresses?.find((email) => email.id === clerkUser.primary_email_address_id) ||
            clerkUser.email_addresses?.[0];
        const primaryPhone =
            clerkUser.phone_numbers?.find((phone) => phone.id === clerkUser.primary_phone_number_id) ||
            clerkUser.phone_numbers?.[0];
        const realEmail = primaryEmail?.email_address?.trim().toLowerCase() || '';
        const phoneNumber = primaryPhone?.phone_number?.trim() || '';

        if (!realEmail && !phoneNumber) {
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Clerk account has no email address or phone number',
                400
            );
        }

        const email = realEmail || getClerkFallbackEmail(clerkUserId);
        const nameParts = [clerkUser.first_name, clerkUser.last_name]
            .map((part) => part?.trim())
            .filter(Boolean);
        const displayName =
            nameParts.join(' ') ||
            clerkUser.username?.trim() ||
            realEmail.split('@')[0] ||
            'Buzz user';

        return {
            clerkUserId,
            email,
            displayName,
            emailVerified:
                primaryEmail?.verification?.status === 'verified' ||
                primaryPhone?.verification?.status === 'verified',
            identifier: realEmail || phoneNumber || clerkUserId,
            hasEmailAddress: !!realEmail,
            hasPhoneNumber: !!phoneNumber,
            isPhoneOnly: !realEmail && !!phoneNumber,
        };
    }

    private async verifyClerkToken(clerkToken: string) {
        const issuer = this.env.CLERK_JWT_ISSUER?.trim();
        const jwksUrl =
            this.env.CLERK_JWKS_URL?.trim() ||
            (issuer ? `${issuer.replace(/\/$/, '')}/.well-known/jwks.json` : '');

        if (!jwksUrl) {
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Clerk JWKS URL is not configured',
                503
            );
        }

        try {
            const { payload } = await jwtVerify(clerkToken, getCachedClerkJwks(jwksUrl), {
                issuer: issuer || undefined,
            });
            return payload;
        } catch (error) {
            logger.warn('Invalid Clerk session token', {
                errorMessage: error instanceof Error ? error.message : String(error),
            });
            throw new SecurityError(
                SecurityErrorType.INVALID_TOKEN,
                'Invalid Clerk session',
                401
            );
        }
    }

    private async findOrCreateClerkUser(profile: ClerkUserProfile): Promise<schema.User> {
        let user = await this.database
            .select()
            .from(schema.users)
            .where(and(
                eq(schema.users.clerkUserId, profile.clerkUserId),
                isNull(schema.users.deletedAt)
            ))
            .get();

        if (!user && profile.hasEmailAddress) {
            user = await this.database
                .select()
                .from(schema.users)
                .where(and(
                    eq(schema.users.email, profile.email),
                    isNull(schema.users.deletedAt)
                ))
                .get();
        }

        if (!user) {
            const userId = generateId();
            const now = new Date();
            const username = profile.isPhoneOnly ? getDefaultBuzzUsername(userId) : undefined;
            const displayName =
                profile.isPhoneOnly && isGenericBuzzDisplayName(profile.displayName)
                    ? getDefaultBuzzDisplayName(userId)
                    : profile.displayName;

            await this.database.insert(schema.users).values({
                id: userId,
                email: profile.email,
                displayName,
                username,
                avatarUrl: getDiceBearAvatarUrl(`${userId}:${profile.email}`),
                emailVerified: profile.emailVerified,
                provider: 'clerk',
                providerId: profile.clerkUserId,
                clerkUserId: profile.clerkUserId,
                createdAt: now,
                updatedAt: now,
            });

            user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, userId))
                .get();
        } else {
            let nextEmail = user.email;
            if (profile.hasEmailAddress && user.email !== profile.email) {
                const emailOwner = await this.database
                    .select()
                    .from(schema.users)
                    .where(and(
                        eq(schema.users.email, profile.email),
                        isNull(schema.users.deletedAt)
                    ))
                    .get();

                if (!emailOwner || emailOwner.id === user.id) {
                    nextEmail = profile.email;
                } else {
                    logger.warn('Skipping Clerk email update because email is already linked to another user', {
                        userId: user.id,
                        clerkUserId: profile.clerkUserId,
                    });
                }
            }

            const avatarUrl = shouldAssignDiceBearAvatar(user.avatarUrl)
                ? getDiceBearAvatarUrl(`${user.id}:${nextEmail}`)
                : user.avatarUrl;
            const shouldUseDefaultBuzzIdentity =
                profile.isPhoneOnly && (
                    !user.username ||
                    isPhoneNumberLike(user.displayName) ||
                    isGenericBuzzDisplayName(user.displayName)
                );
            const shouldKeepExistingDisplayName =
                profile.isPhoneOnly && (
                    isPhoneNumberLike(profile.displayName) ||
                    isGenericBuzzDisplayName(profile.displayName)
                );
            const nextDisplayName = shouldUseDefaultBuzzIdentity
                ? getDefaultBuzzDisplayName(user.id)
                : shouldKeepExistingDisplayName
                    ? user.displayName
                    : profile.displayName || user.displayName;
            const nextUsername = shouldUseDefaultBuzzIdentity && !user.username
                ? getDefaultBuzzUsername(user.id)
                : user.username;

            await this.database
                .update(schema.users)
                .set({
                    email: nextEmail,
                    displayName: nextDisplayName,
                    username: nextUsername,
                    avatarUrl,
                    provider: 'clerk',
                    providerId: profile.clerkUserId,
                    clerkUserId: profile.clerkUserId,
                    emailVerified: profile.emailVerified || user.emailVerified,
                    updatedAt: new Date(),
                })
                .where(eq(schema.users.id, user.id));

            user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, user.id))
                .get();
        }

        return user!;
    }
    
    /**
     * Log authentication attempt
     */
    private async logAuthAttempt(
        identifier: string,
        attemptType: string,
        success: boolean,
        request: Request
    ): Promise<void> {
        try {
            const requestMetadata = extractRequestMetadata(request);
            
            await this.database.insert(schema.authAttempts).values({
                identifier: identifier.toLowerCase(),
                attemptType: attemptType as 'login' | 'register' | 'clerk' | 'oauth_google' | 'oauth_github' | 'refresh' | 'reset_password',
                success: success,
                ipAddress: requestMetadata.ipAddress
            });
        } catch (error) {
            logger.error('Failed to log auth attempt', error);
        }
    }
    
    /**
     * Generate and store verification OTP for email
     */
    private async generateAndStoreVerificationOtp(email: string): Promise<void> {
        const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

        // Store OTP in database (you may need to create a verification_otps table)
        await this.database.insert(schema.verificationOtps).values({
            id: generateId(),
            email: email.toLowerCase(),
            otp: await this.passwordService.hash(otp), // Hash the OTP for security
            expiresAt,
            createdAt: new Date()
        });

        // TODO: Send email with OTP (integrate with email service)
        logger.info('Verification OTP generated', { email, otp: otp.slice(0, 2) + '****' });
    }

    /**
     * Verify email with OTP
     */
    async verifyEmailWithOtp(email: string, otp: string, request: Request): Promise<AuthResult> {
        try {
            // Find valid OTP
            const storedOtp = await this.database
                .select()
                .from(schema.verificationOtps)
                .where(
                    and(
                        eq(schema.verificationOtps.email, email.toLowerCase()),
                        eq(schema.verificationOtps.used, false),
                        sql`${schema.verificationOtps.expiresAt} > ${new Date()}`
                    )
                )
                .orderBy(sql`${schema.verificationOtps.createdAt} DESC`)
                .get();

            if (!storedOtp) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Invalid or expired verification code',
                    400
                );
            }

            // Verify OTP
            const otpValid = await this.passwordService.verify(otp, storedOtp.otp);
            if (!otpValid) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Invalid verification code',
                    400
                );
            }

            // Mark OTP as used
            await this.database
                .update(schema.verificationOtps)
                .set({ used: true, usedAt: new Date() })
                .where(eq(schema.verificationOtps.id, storedOtp.id));

            // Find and verify the user
            const user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email.toLowerCase()))
                .get();

            if (!user) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'User not found',
                    404
                );
            }

            // Update user as verified
            await this.database
                .update(schema.users)
                .set({ emailVerified: true, updatedAt: new Date() })
                .where(eq(schema.users.id, user.id));

            // Create session for verified user
            const { accessToken, session } = await this.sessionService.createSession(
                user.id,
                request
            );

            // Log successful verification
            await this.logAuthAttempt(email, 'email_verification', true, request);
            logger.info('Email verified successfully', { email, userId: user.id });

            return {
                user: mapUserResponse({ ...user, emailVerified: true }),
                accessToken,
                sessionId: session.sessionId,
                expiresAt: session.expiresAt,
            };
        } catch (error) {
            await this.logAuthAttempt(email, 'email_verification', false, request);
            
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('Email verification error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Email verification failed',
                500
            );
        }
    }

    /**
     * Get user for authentication (for middleware)
     */
    async getUserForAuth(userId: string): Promise<AuthUser | null> {
        try {
            const user = await this.database
                .select({
                    id: schema.users.id,
                    email: schema.users.email,
                    displayName: schema.users.displayName,
                    username: schema.users.username,
                    avatarUrl: schema.users.avatarUrl,
                    bio: schema.users.bio,
                    timezone: schema.users.timezone,
                    provider: schema.users.provider,
                    emailVerified: schema.users.emailVerified,
                    preferences: schema.users.preferences,
                    createdAt: schema.users.createdAt,
                })
                .from(schema.users)
                .where(
                    and(
                        eq(schema.users.id, userId),
                        isNull(schema.users.deletedAt)
                    )
                )
                .get()
                .catch((error: unknown) => {
                    logger.error('getUserForAuth query failed', {
                        errorMessage: error instanceof Error ? error.message : String(error),
                        errorName: error instanceof Error ? error.name : 'UnknownError',
                        errorCause: (error as any)?.cause,
                        errorStack: error instanceof Error ? error.stack?.split('\n').slice(0, 5).join('\n') : undefined,
                        userId
                    });
                    throw error;
                });
            
            if (!user) {
                logger.debug('User not found for auth', { userId });
                return null;
            }
            
            return mapUserResponse(user);
        } catch (error: unknown) {
            logger.error('Error getting user for auth', {
                errorMessage: error instanceof Error ? error.message : String(error),
                errorName: error instanceof Error ? error.name : 'UnknownError',
                errorCause: (error as any)?.cause,
                userId
            });
            return null;
        }
    }
    
    /**
     * Validate token and return user (for middleware)
     */
    async validateTokenAndGetUser(token: string, env: Env): Promise<AuthUserSession | null> {
        try {
            const jwtUtils = JWTUtils.getInstance(env);
            const payload = await jwtUtils.verifyToken(token);
            
            if (!payload || payload.type !== 'access') {
                return null;
            }
            
            // Check if token is expired
            if (payload.exp * 1000 < Date.now()) {
                logger.debug('Token expired', { exp: payload.exp });
                return null;
            }
            
            // Get user from database
            const user = await this.getUserForAuth(payload.sub);
            if (!user) {
                return null;
            }
            
            return {
                user,
                sessionId: payload.sessionId,
            };
        } catch (error) {
            logger.error('Token validation error', error);
            return null;
        }
    }
    
    /**
     * Resend verification OTP
     */
    async resendVerificationOtp(email: string): Promise<void> {
        try {
            // Check if user exists and is unverified
            const user = await this.database
                .select()
                .from(schema.users)
                .where(eq(schema.users.email, email.toLowerCase()))
                .get();

            if (!user) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'No account found with this email',
                    404
                );
            }

            if (user.emailVerified) {
                throw new SecurityError(
                    SecurityErrorType.INVALID_INPUT,
                    'Email is already verified',
                    400
                );
            }

            // Invalidate existing OTPs
            await this.database
                .update(schema.verificationOtps)
                .set({ used: true, usedAt: new Date() })
                .where(
                    and(
                        eq(schema.verificationOtps.email, email.toLowerCase()),
                        eq(schema.verificationOtps.used, false)
                    )
                );

            // Generate new OTP
            await this.generateAndStoreVerificationOtp(email.toLowerCase());
            
            logger.info('Verification OTP resent', { email });
        } catch (error) {
            if (error instanceof SecurityError) {
                throw error;
            }
            
            logger.error('Resend verification OTP error', error);
            throw new SecurityError(
                SecurityErrorType.INVALID_INPUT,
                'Failed to resend verification code',
                500
            );
        }
    }
}
