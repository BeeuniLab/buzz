/**
 * Authentication Routes
 */
import { AuthController } from '../controllers/auth/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

/**
 * Setup authentication routes
 */
export function setupAuthRoutes(app: Hono<AppEnv>): void {
    // Create a sub-router for auth routes
    const authRouter = new Hono<AppEnv>();
    
    // Public authentication routes
    authRouter.get('/csrf-token', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.getCsrfToken));
    authRouter.get('/providers', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.getAuthProviders));
    authRouter.post('/register', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.register));
    authRouter.post('/login', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.login));
    authRouter.post('/verify-email', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.verifyEmail));
    authRouter.post('/resend-verification', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.resendVerificationOtp));
    authRouter.post('/clerk/sync', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.syncClerkUser));
    authRouter.get('/check', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.checkAuth));
    
    // Protected routes
    authRouter.get('/profile', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.getProfile));
    authRouter.put('/profile', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.updateProfile));
    authRouter.post('/logout', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.logout));
    authRouter.delete('/account', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.deleteAccount));
    authRouter.post('/invite-code/verify', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.verifyInviteCode));

    // Session management routes
    authRouter.get('/sessions', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.getActiveSessions));
    authRouter.delete('/sessions/:sessionId', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.revokeSession));
    
    // API Keys management routes
    authRouter.get('/api-keys', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.getApiKeys));
    authRouter.post('/api-keys', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.createApiKey));
    authRouter.delete('/api-keys/:keyId', setAuthLevel(AuthConfig.authenticated), adaptController(AuthController, AuthController.revokeApiKey));

    // SDK: exchange API key for short-lived access token
    authRouter.post('/exchange-api-key', setAuthLevel(AuthConfig.public), adaptController(AuthController, AuthController.exchangeApiKey));
    
    // Mount the auth router under /api/auth
    app.route('/api/auth', authRouter);
}
