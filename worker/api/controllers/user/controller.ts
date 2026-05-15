import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { UserService } from '../../../database/services/UserService';
import { AppService } from '../../../database/services/AppService';
import { Visibility, AppSortOption, SortOrder, TimePeriod } from '../../../database/types';
import { UserAppsData, ProfileUpdateData, UserFollowData, FollowerInboxData, PublicUserProfileData } from './types';
import { createLogger } from '../../../logger';
import { getAgentStubLightweight } from '../../../agents';
import { getMappedDisplayName } from '../../../utils/authUtils';

const logger = createLogger('UserController');
const MAX_RECONCILE_APPS_PER_LIST_REQUEST = 5;

/**
 * User Management Controller for Orange
 * Handles user dashboard, profile management, and app history
 */
export class UserController extends BaseController {
    static logger = logger;

    private static shouldReconcileGeneratingApp(app: { status: string }): boolean {
        return app.status === 'generating';
    }

    private static async reconcileStaleGeneratingApps(
        env: Env,
        apps: UserAppsData['apps'],
    ): Promise<UserAppsData['apps']> {
        const staleApps = apps
            .filter(app => UserController.shouldReconcileGeneratingApp(app))
            .slice(0, MAX_RECONCILE_APPS_PER_LIST_REQUEST);

        if (staleApps.length === 0) {
            return apps;
        }

        const appService = new AppService(env);
        const completedIds = new Set<string>();

        await Promise.all(staleApps.map(async app => {
            try {
                const agent = await getAgentStubLightweight(env, app.id);
                const desiredStatus = await agent.getDesiredAppStatus();
                if (desiredStatus !== 'completed') {
                    return;
                }

                const updated = await appService.updateApp(app.id, { status: 'completed' });
                if (updated) {
                    completedIds.add(app.id);
                }
            } catch (error) {
                UserController.logger.warn('Failed to reconcile stale generating app', {
                    appId: app.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }));

        if (completedIds.size === 0) {
            return apps;
        }

        const now = new Date();
        return apps.map(app =>
            completedIds.has(app.id)
                ? { ...app, status: 'completed' as const, updatedAt: now }
                : app
        );
    }
    
    /**
     * Get user's apps with pagination and filtering
     */
    static async getApps(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UserAppsData>>> {
        try {
            const user = context.user!;

            const url = new URL(request.url);
            const page = parseInt(url.searchParams.get('page') || '1');
            const limit = parseInt(url.searchParams.get('limit') || '20');
            const status = url.searchParams.get('status') as 'generating' | 'completed' | undefined;
            const visibility = url.searchParams.get('visibility') as Visibility | undefined;
            const framework = url.searchParams.get('framework') || undefined;
            const search = url.searchParams.get('search') || undefined;
            const sort = (url.searchParams.get('sort') || 'recent') as AppSortOption;
            const order = (url.searchParams.get('order') || 'desc') as SortOrder;
            const period = (url.searchParams.get('period') || 'all') as TimePeriod;
            const offset = (page - 1) * limit;
            
            const queryOptions = {
                limit,
                offset,
                status,
                visibility,
                framework,
                search,
                sort,
                order,
                period
            };

            const appService = new AppService(env);
            
            // Get user apps with analytics and proper total count
            const [rawApps, totalCount] = await Promise.all([
                appService.getUserAppsWithAnalytics(user.id, queryOptions),
                appService.getUserAppsCount(user.id, queryOptions)
            ]);
            const apps = await UserController.reconcileStaleGeneratingApps(env, rawApps);

            const responseData: UserAppsData = {
                apps,
                pagination: {
                    limit,
                    offset,
                    total: totalCount,
                    hasMore: offset + limit < totalCount
                }
            };

            return UserController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error getting user apps:', error);
            return UserController.createErrorResponse<UserAppsData>('Failed to get user apps', 500);
        }
    }

    /**
     * Get recent follower events for inbox
     */
    static async getFollowerInbox(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<FollowerInboxData>>> {
        try {
            const user = context.user!;
            const url = new URL(request.url);
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

            const userService = new UserService(env);
            const items = await userService.getFollowerInbox(user.id, limit);

            return UserController.createSuccessResponse({ items });
        } catch (error) {
            this.logger.error('Error getting follower inbox:', error);
            return UserController.createErrorResponse<FollowerInboxData>('Failed to get inbox', 500);
        }
    }

    static async getPublicProfile(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<PublicUserProfileData>>> {
        try {
            const targetUserId = context.pathParams.userId;
            if (!targetUserId) {
                return UserController.createErrorResponse<PublicUserProfileData>('User ID is required', 400);
            }

            const userService = new UserService(env);
            const [targetUser, followCounts, isFollowing] = await Promise.all([
                userService.findUser({ id: targetUserId }),
                userService.getFollowCounts(targetUserId),
                context.user && context.user.id !== targetUserId
                    ? userService.isFollowing(context.user.id, targetUserId)
                    : Promise.resolve(false),
            ]);

            if (!targetUser) {
                return UserController.createErrorResponse<PublicUserProfileData>('User not found', 404);
            }

            return UserController.createSuccessResponse({
                id: targetUser.id,
                displayName: getMappedDisplayName(targetUser) ?? targetUser.displayName,
                username: targetUser.username,
                avatarUrl: targetUser.avatarUrl,
                bio: targetUser.bio,
                followersCount: followCounts.followersCount,
                followingCount: followCounts.followingCount,
                isFollowing,
            });
        } catch (error) {
            this.logger.error('Error getting public profile:', error);
            return UserController.createErrorResponse<PublicUserProfileData>('Failed to get user profile', 500);
        }
    }

    /**
     * Update user profile
     */
    static async updateProfile(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<ProfileUpdateData>>> {
        try {
            const user = context.user!;

            const bodyResult = await UserController.parseJsonBody<{
                username?: string;
                displayName?: string;
                bio?: string;
                theme?: 'light' | 'dark' | 'system';
            }>(request);

            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<ProfileUpdateData>>;
            }

            const userService = new UserService(env);
            const result = await userService.updateUserProfileWithValidation(user.id, bodyResult.data!);

            if (!result.success) {
                return UserController.createErrorResponse<ProfileUpdateData>(result.message, 400);
            }

            const responseData: ProfileUpdateData = result;
            return UserController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error updating user profile:', error);
            return UserController.createErrorResponse<ProfileUpdateData>('Failed to update profile', 500);
        }
    }

    static async followUser(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UserFollowData>>> {
        try {
            const user = context.user!;
            const targetUserId = context.pathParams.userId;
            if (!targetUserId) {
                return UserController.createErrorResponse<UserFollowData>('User ID is required', 400);
            }

            if (targetUserId === user.id) {
                return UserController.createErrorResponse<UserFollowData>('You cannot follow yourself', 400);
            }

            const userService = new UserService(env);
            const targetUser = await userService.findUser({ id: targetUserId });
            if (!targetUser) {
                return UserController.createErrorResponse<UserFollowData>('User not found', 404);
            }

            const responseData = await userService.followUser(user.id, targetUserId);
            return UserController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error following user:', error);
            return UserController.createErrorResponse<UserFollowData>('Failed to follow user', 500);
        }
    }

    static async unfollowUser(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UserFollowData>>> {
        try {
            const user = context.user!;
            const targetUserId = context.pathParams.userId;
            if (!targetUserId) {
                return UserController.createErrorResponse<UserFollowData>('User ID is required', 400);
            }

            if (targetUserId === user.id) {
                return UserController.createErrorResponse<UserFollowData>('You cannot unfollow yourself', 400);
            }

            const userService = new UserService(env);
            const targetUser = await userService.findUser({ id: targetUserId });
            if (!targetUser) {
                return UserController.createErrorResponse<UserFollowData>('User not found', 404);
            }

            const responseData = await userService.unfollowUser(user.id, targetUserId);
            return UserController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error unfollowing user:', error);
            return UserController.createErrorResponse<UserFollowData>('Failed to unfollow user', 500);
        }
    }
}
