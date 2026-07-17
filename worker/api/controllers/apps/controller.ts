import { AppService } from '../../../database/services/AppService';
import type { AppSortOption, EnhancedAppData, SortOrder, TimePeriod, Visibility } from '../../../database/types';
import { formatRelativeTime } from '../../../utils/timeFormatter';
import { buildUserWorkerUrl } from '../../../utils/urls';
import { BaseController } from '../baseController';
import { ApiResponse, ControllerResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { getAgentStub, getAgentStubLightweight } from '../../../agents';
import { CloudflareAPI } from '../../../services/deployer/api/cloudflare-api';
import { 
    AppsListData,
    PublicAppsData,
    SingleAppData,
    FavoriteToggleData,
    UpdateAppVisibilityData,
    AppDeleteData
} from './types';
// import { withCache } from '../../../services/cache/wrapper';
import { createLogger } from '../../../logger';

export class AppController extends BaseController {
    static logger = createLogger('AppController');

    private static async resolvePublicPlayableUrl(env: Env, app: EnhancedAppData): Promise<string | null> {
        if (app.deploymentId) {
            return buildUserWorkerUrl(env, app.deploymentId);
        }

        try {
            const agentStub = await getAgentStubLightweight(env, app.id);
            const previewUrl = await agentStub.getPreviewUrlCache();
            return previewUrl || null;
        } catch (error) {
            AppController.logger.warn('Could not resolve browser preview URL for public app', {
                appId: app.id,
                error,
            });
            return null;
        }
    }

    private static async deletePublicDeployment(env: Env, deploymentId: string): Promise<void> {
        const accountId = env.CLOUDFLARE_ACCOUNT_ID;
        const apiToken = env.CLOUDFLARE_API_TOKEN;
        const dispatchNamespace = env.DISPATCH_NAMESPACE;

        if (!accountId || !apiToken || !dispatchNamespace) {
            throw new Error('Published playable cleanup is not configured');
        }

        const cloudflare = new CloudflareAPI(accountId, apiToken);
        const result = await cloudflare.deleteWorker(deploymentId, dispatchNamespace);

        if (result.notFound) {
            AppController.logger.warn('Published playable deployment was already missing', {
                deploymentId,
            });
            return;
        }

        AppController.logger.info('Deleted published playable deployment', {
            deploymentId,
        });
    }

    private static async stopAgentBeforeDelete(env: Env, appId: string): Promise<void> {
        try {
            const agentStub = await getAgentStub(env, appId);
            const result = await agentStub.deleteProject('app_deleted');
            AppController.logger.info('Stopped agent tasks before deleting app', {
                appId,
                ...result,
            });
        } catch (error) {
            AppController.logger.warn('Could not stop agent before deleting app; continuing with database deletion', {
                appId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    // Get all apps for the current user
    static async getUserApps(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppsListData>>> {
        try {
            const user = context.user!;
            
            const appService = new AppService(env);
            const userApps = await appService.getUserAppsWithFavorites(user.id);

            const responseData: AppsListData = {
                apps: userApps
            };

            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching user apps:', error);
            return AppController.createErrorResponse<AppsListData>('Failed to fetch apps', 500);
        }
    }

    // Get recent apps (last 10)
    static async getRecentApps(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppsListData>>> {
        try {
            const user = context.user!;

            const appService = new AppService(env);
            const recentApps = await appService.getRecentAppsWithFavorites(user.id, 10);

            const responseData: AppsListData = {
                apps: recentApps
            };

            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching recent apps:', error);
            return AppController.createErrorResponse<AppsListData>('Failed to fetch recent apps', 500);
        }
    }

    // Get favorite apps - NO CACHE (user-specific, real-time)
    static async getFavoriteApps(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppsListData>>> {
        try {
            const user = context.user!;

            const appService = new AppService(env);
            const favoriteApps = await appService.getFavoriteAppsOnly(user.id);

            const responseData: AppsListData = {
                apps: favoriteApps
            };

            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching favorite apps:', error);
            return AppController.createErrorResponse<AppsListData>('Failed to fetch favorite apps', 500);
        }
    }

    // Get public apps the user has played/viewed, excluding their own apps
    static async getPlayedApps(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<PublicAppsData>>> {
        try {
            const user = context.user!;
            const appService = new AppService(env);
            const playedApps = await appService.getPlayedAppsForUser(user.id, 50);

            const playableApps = (await Promise.all(playedApps.map(async app => {
                const playableUrl = await AppController.resolvePublicPlayableUrl(env, app);
                if (!playableUrl) return null;

                return {
                    ...app,
                    cloudflareUrl: app.deploymentId ? playableUrl : null,
                    previewUrl: playableUrl,
                    userName: app.userName || 'Anonymous User',
                    userAvatar: app.userAvatar || null,
                    updatedAtFormatted: formatRelativeTime(app.updatedAt),
                    createdAtFormatted: app.createdAt ? formatRelativeTime(app.createdAt) : ''
                };
            }))).filter((app): app is NonNullable<typeof app> => Boolean(app));

            const responseData: PublicAppsData = {
                apps: playableApps,
                pagination: {
                    limit: 50,
                    offset: 0,
                    total: playableApps.length,
                    hasMore: false,
                }
            };

            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching played apps:', error);
            return AppController.createErrorResponse<PublicAppsData>('Failed to fetch played apps', 500);
        }
    }


    // Toggle favorite status
    static async toggleFavorite(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<FavoriteToggleData>>> {
        try {
            const user = context.user!;

            const appService = new AppService(env);
            const appId = context.pathParams.id;
            if (!appId) {
                return AppController.createErrorResponse<FavoriteToggleData>('App ID is required', 400);
            }

            // Check if app exists and get ownership/visibility info
            const ownershipResult = await appService.checkAppOwnership(appId, user.id);

            if (!ownershipResult.exists) {
                return AppController.createErrorResponse<FavoriteToggleData>('App not found', 404);
            }

            // Authorization: only allow favorite if user owns the app OR app is public
            if (!ownershipResult.isOwner && ownershipResult.visibility !== 'public') {
                return AppController.createErrorResponse<FavoriteToggleData>('App not found', 404);
            }

            const result = await appService.toggleAppFavorite(user.id, appId);
            const responseData: FavoriteToggleData = result;
                
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error toggling favorite:', error);
            return AppController.createErrorResponse<FavoriteToggleData>('Failed to toggle favorite', 500);
        }
    }

    // Get public apps feed (like a global board)
   static getPublicApps = async function(this: AppController, request: Request, env: Env, _ctx: ExecutionContext, _context: RouteContext): Promise<ControllerResponse<ApiResponse<PublicAppsData>>> {
        try {
            const url = new URL(request.url);
            
            // Parse query parameters with type safety
            const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
            const page = parseInt(url.searchParams.get('page') || '1');
            const offset = (page - 1) * limit;
            const sort = (url.searchParams.get('sort') || 'recent') as AppSortOption;
            const order = (url.searchParams.get('order') || 'desc') as SortOrder;
            const period = (url.searchParams.get('period') || 'all') as TimePeriod;
            const framework = url.searchParams.get('framework') || undefined;
            const search = url.searchParams.get('search') || undefined;
            const authorId = url.searchParams.get('authorId') || undefined;
            const seedParam = url.searchParams.get('seed');
            const seed = seedParam ? parseInt(seedParam, 10) : undefined;
            const sessionToken = url.searchParams.get('sessionToken')?.slice(0, 128) || undefined;
            const excludeParam = url.searchParams.get('excludeIds');
            const excludeIds = excludeParam ? excludeParam.split(',').filter(Boolean) : undefined;
            const includeHiddenFromBrowse = url.searchParams.get('includeHiddenFromBrowse') === 'true' && Boolean(search?.trim());

            const user = await AppController.getOptionalUser(request, env);
            const userId = user?.id;

            // Get apps
            const appService = new AppService(env);
            const queryLimit = Math.min(limit * 4, 100);
            const result = await appService.getPublicApps({
                limit: queryLimit,
                offset,
                sort,
                order,
                period,
                framework,
                search,
                userId,
                sessionToken,
                authorId,
                seed,
                excludeIds,
                includeHiddenFromBrowse
            });

            const playableApps = (await Promise.all(result.data.map(async app => {
                const playableUrl = await AppController.resolvePublicPlayableUrl(env, app);
                if (!playableUrl) return null;

                return {
                    ...app,
                    cloudflareUrl: app.deploymentId ? playableUrl : null,
                    previewUrl: playableUrl,
                    userName: app.userName || 'Anonymous User',
                    userAvatar: app.userAvatar || null,
                    updatedAtFormatted: formatRelativeTime(app.updatedAt),
                    createdAtFormatted: app.createdAt ? formatRelativeTime(app.createdAt) : ''
                };
            }))).filter((app): app is NonNullable<typeof app> => Boolean(app)).slice(0, limit);

            // Format response with relative timestamps
            const responseData: PublicAppsData = {
                apps: playableApps,
                pagination: {
                    ...result.pagination,
                    limit,
                    hasMore: playableApps.length >= limit || result.pagination.hasMore,
                }
            };
            
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            AppController.logger.error('Error fetching public apps:', error);
            return AppController.createErrorResponse<PublicAppsData>('Failed to fetch public apps', 500);
        }
    }

    // Get single app
    static async getApp(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<SingleAppData>>> {
        try {
            const user = context.user!;

            const appId = context.pathParams.id;
            if (!appId) {
                return AppController.createErrorResponse<SingleAppData>('App ID is required', 400);
            }
            
            const appService = new AppService(env);
            const app = await appService.getSingleAppWithFavoriteStatus(appId, user.id);

            if (!app) {
                return AppController.createErrorResponse<SingleAppData>('App not found', 404);
            }

            const responseData: SingleAppData = { app };
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error fetching app:', error);
            return AppController.createErrorResponse<SingleAppData>('Failed to fetch app', 500);
        }
    }

    // Update app visibility
    static async updateAppVisibility(request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<UpdateAppVisibilityData>>> {
        try {
            const user = context.user!;

            const appId = context.pathParams.id;
            if (!appId) {
                return AppController.createErrorResponse<UpdateAppVisibilityData>('App ID is required', 400);
            }

            const bodyResult = await AppController.parseJsonBody(request);
            if (!bodyResult.success) {
                return bodyResult.response! as ControllerResponse<ApiResponse<UpdateAppVisibilityData>>;
            }
            
            const visibility = (bodyResult.data as { visibility?: string })?.visibility;

            // Validate visibility value
            if (!visibility || !['private', 'public'].includes(visibility)) {
                return AppController.createErrorResponse<UpdateAppVisibilityData>('Visibility must be either "private" or "public"', 400);
            }

            const validVisibility = visibility as Visibility;
            
            const appService = new AppService(env);
            const appDetails = await appService.getAppDetails(appId, user.id);
            if (!appDetails) {
                return AppController.createErrorResponse<UpdateAppVisibilityData>('App not found', 404);
            }

            if (appDetails.userId !== user.id) {
                return AppController.createErrorResponse<UpdateAppVisibilityData>('You can only change visibility of your own apps', 403);
            }

            if (validVisibility === 'public' && appDetails.visibility !== 'public') {
                const playableUrl = await AppController.resolvePublicPlayableUrl(env, appDetails);
                if (!playableUrl) {
                    return AppController.createErrorResponse<UpdateAppVisibilityData>(
                        'Prepare playable first.',
                        409,
                    );
                }
            }

            const result = await appService.updateAppVisibility(appId, user.id, validVisibility);

            if (!result.success) {
                const statusCode = result.error === 'App not found' ? 404 : 
                                 result.error?.includes('only change visibility of your own apps') ? 403 : 500;
                return AppController.createErrorResponse<UpdateAppVisibilityData>(result.error || 'Failed to update app visibility', statusCode);
            }

            const responseData: UpdateAppVisibilityData = { 
                app: {
                    ...result.app!,
                    visibility: result.app!.visibility
                },
                message: `App visibility updated to ${validVisibility}`
            };
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error updating app visibility:', error);
            return AppController.createErrorResponse<UpdateAppVisibilityData>('Failed to update app visibility', 500);
        }
    }

    // Delete app
    static async deleteApp(_request: Request, env: Env, _ctx: ExecutionContext, context: RouteContext): Promise<ControllerResponse<ApiResponse<AppDeleteData>>> {
        try {
            const user = context.user!;

            const appId = context.pathParams.id;
            if (!appId) {
                return AppController.createErrorResponse<AppDeleteData>('App ID is required', 400);
            }
        
            const appService = new AppService(env);
            const appInfo = await appService.getAppDeletionInfo(appId);
            if (!appInfo) {
                return AppController.createErrorResponse<AppDeleteData>('App not found', 404);
            }

            if (appInfo.userId !== user.id) {
                return AppController.createErrorResponse<AppDeleteData>('You can only delete your own apps', 403);
            }

            if (appInfo.deploymentId) {
                try {
                    await AppController.deletePublicDeployment(env, appInfo.deploymentId);
                } catch (deploymentError) {
                    AppController.logger.error('Failed to delete published playable deployment:', {
                        appId,
                        deploymentId: appInfo.deploymentId,
                        error: deploymentError,
                    });
                    return AppController.createErrorResponse<AppDeleteData>(
                        'Failed to remove published playable. Please try again.',
                        502,
                    );
                }
            }

            await AppController.stopAgentBeforeDelete(env, appId);

            const result = await appService.deleteApp(appId, user.id);

            if (!result.success) {
                const statusCode = result.error === 'App not found' ? 404 : 
                                 result.error?.includes('only delete your own apps') ? 403 : 500;
                return AppController.createErrorResponse<AppDeleteData>(result.error || 'Failed to delete app', statusCode);
            }

            const responseData: AppDeleteData = {
                success: true,
                message: 'App deleted successfully'
            };
            return AppController.createSuccessResponse(responseData);
        } catch (error) {
            this.logger.error('Error deleting app:', error);
            return AppController.createErrorResponse<AppDeleteData>('Failed to delete app', 500);
        }
    }
}
