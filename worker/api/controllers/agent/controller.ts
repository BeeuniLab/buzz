import { WebSocketMessageResponses } from '../../../agents/constants';
import { BaseController } from '../baseController';
import { generateId } from '../../../utils/idGenerator';
import { ProjectType } from '../../../agents/core/types';
import { getAgentStub } from '../../../agents';
import {
    AgentConnectionData,
    AgentPreviewResponse,
    CodeGenArgs,
    MAX_AGENT_QUERY_LENGTH,
} from './types';
import { SecurityError, SecurityErrorType } from 'shared/types/errors';
import { ApiResponse, ControllerResponse } from '../types';
import { RouteContext } from '../../types/route-context';
import { AppService, ModelConfigService } from '../../../database';
import { ModelConfig, credentialsToRuntimeOverrides } from '../../../agents/inferutils/config.types';
import { RateLimitService } from '../../../services/rate-limit/rateLimits';
import { validateWebSocketOrigin } from '../../../middleware/security/websocket';
import { createLogger } from '../../../logger';
import { getPreviewDomain } from 'worker/utils/urls';
import { uploadImageAsAgentAsset } from 'worker/utils/images';
import { uniqueAgentAssetRelativePath } from 'worker/utils/agentAssets';
import { ProcessedImageAttachment } from 'worker/types/image-attachment';
import { hasTicketParam } from '../../../middleware/auth/ticketAuth';
import type { CodeGenerationWorkflowParams } from '../../../agents/workflows/codeGenerationWorkflow';
import {
    UserTaskConcurrencyLimitError,
    UserTaskConcurrencyService,
} from '../../../services/tasks/UserTaskConcurrencyService';

const defaultCodeGenArgs: Partial<CodeGenArgs> = {
    language: 'typescript',
    frameworks: ['react', 'vite'],
    selectedTemplate: 'auto',
};

const resolveProjectType = (body: CodeGenArgs): ProjectType | 'auto' => {
    return body.projectType || 'auto';
};

const normalizeProjectType = (projectType: ProjectType | 'auto'): ProjectType =>
    projectType === 'auto' ? 'app' : projectType;

const buildPendingAppTitle = (query: string): string => {
    const normalized = query.replace(/\s+/g, ' ').trim();
    if (!normalized) return 'New App';
    return normalized.length > 100 ? `${normalized.slice(0, 97)}...` : normalized;
};

const stripBase64ForWorkflow = (attachment: ProcessedImageAttachment): ProcessedImageAttachment => {
    const { base64Data: _base64Data, ...workflowAttachment } = attachment;
    return workflowAttachment;
};


/**
 * CodingAgentController to handle all code generation related endpoints
 */
export class CodingAgentController extends BaseController {
    static logger = createLogger('CodingAgentController');
    /**
     * Start the incremental code generation process
     */
    static async startCodeGeneration(request: Request, env: Env, _: ExecutionContext, context: RouteContext): Promise<Response> {
        let pendingAppForCleanup: { agentId: string; userId: string } | null = null;
        let pendingTaskSlot: { userId: string; taskId: string } | null = null;

        try {
            this.logger.info('Starting code generation process');

            const url = new URL(request.url);
            const hostname = url.hostname === 'localhost' ? `localhost:${url.port}`: getPreviewDomain(env);
            // Parse the query from the request body
            let body: CodeGenArgs;
            try {
                body = await request.json() as CodeGenArgs;
            } catch (error) {
                return CodingAgentController.createErrorResponse(`Invalid JSON in request body: ${JSON.stringify(error, null, 2)}`, 400);
            }

            const query = body.query;
            if (typeof query !== 'string' || query.trim().length === 0) {
                return CodingAgentController.createErrorResponse('Missing "query" field in request body', 400);
            }
            if (query.length > MAX_AGENT_QUERY_LENGTH) {
                return CodingAgentController.createErrorResponse(
                    new SecurityError(
                        SecurityErrorType.INVALID_INPUT,
                        `Prompt too large (${query.length} characters). Maximum allowed is ${MAX_AGENT_QUERY_LENGTH} characters.`,
                        413,
                    ),
                    413,
                );
            }
            // Check if user is authenticated (required for app creation)
            const user = context.user!;
            try {
                await RateLimitService.enforceAppCreationRateLimit(env, context.config.security.rateLimit, user, request);
            } catch (error) {
                if (error instanceof Error) {
                    return CodingAgentController.createErrorResponse(error, 429);
                } else {
                    this.logger.error('Unknown error in enforceAppCreationRateLimit', error);
                    return CodingAgentController.createErrorResponse(JSON.stringify(error), 429);
                }
            }

            const agentId = generateId();
            const workflowId = `create-${agentId}`;
            const modelConfigService = new ModelConfigService(env);
            const projectType = resolveProjectType(body);
            const generationBackend = 'codex' as const;
            const appService = new AppService(env);
            const appTitle = buildPendingAppTitle(query);

            try {
                await UserTaskConcurrencyService.acquire(env, {
                    userId: user.id,
                    taskId: workflowId,
                    agentId,
                    kind: 'create_project',
                });
                pendingTaskSlot = { userId: user.id, taskId: workflowId };
            } catch (error) {
                if (error instanceof UserTaskConcurrencyLimitError) {
                    return CodingAgentController.createErrorResponse(error.message, 429);
                }
                throw error;
            }

            await appService.createOrUpdateApp({
                id: agentId,
                userId: user.id,
                sessionToken: null,
                title: appTitle,
                description: query,
                originalPrompt: query,
                finalPrompt: query,
                framework: (body.frameworks || defaultCodeGenArgs.frameworks || []).join(','),
                visibility: 'private',
                status: 'generating',
                createdAt: new Date(),
                updatedAt: new Date(),
            });
            pendingAppForCleanup = { agentId, userId: user.id };

            this.logger.info(`Resolved projectType: ${projectType}, generationBackend: ${generationBackend} for agent ${agentId}`);
                                
            // Fetch all user model configs, api keys and agent instance at once
            const userConfigsRecord = await modelConfigService.getUserModelConfigs(user.id);
                                
            // Extract only user-overridden configs, stripping metadata fields
            const userModelConfigs: Record<string, ModelConfig> = {};
            for (const [actionKey, mergedConfig] of Object.entries(userConfigsRecord)) {
                if (mergedConfig.isUserOverride) {
                    const { isUserOverride, userConfigId, ...modelConfig } = mergedConfig;
                    userModelConfigs[actionKey] = modelConfig;
                }
            }

            const runtimeOverrides = credentialsToRuntimeOverrides(body.credentials);

            const inferenceContext = {
                metadata: {
                    agentId: agentId,
                    userId: user.id,
                },
                userModelConfigs,
                runtimeOverrides,
                enableRealtimeCodeFix: false, // This costs us too much, so disabled it for now
                enableFastSmartCodeFix: false,
            }
                                
            this.logger.info(`Initialized inference context for user ${user.id}`, {
                modelConfigsCount: Object.keys(userModelConfigs).length,
            });
            this.logger.info(`Creating project of type: ${projectType}`);

            const websocketUrl = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/api/agent/${agentId}/ws`;
            const httpStatusUrl = `${url.origin}/api/agent/${agentId}`;

            let uploadedImages: ProcessedImageAttachment[] = [];
            if (body.images && body.images.length > 0) {
                const usedPaths = new Set<string>();
                uploadedImages = await Promise.all(
                    body.images.map(async (image, index) => {
                        const relativePath = uniqueAgentAssetRelativePath(image, index, usedPaths);
                        return uploadImageAsAgentAsset(env, agentId, image, relativePath);
                    }),
                );
            }
            const workflowImages = uploadedImages.map(stripBase64ForWorkflow);

            const workflowProjectType = normalizeProjectType(projectType);
            const agentInstance = await getAgentStub(env, agentId, {
                projectType: workflowProjectType,
            });

            await agentInstance.prepareWorkflowProject({
                agentId,
                userId: user.id,
                query,
                hostname,
                projectType: workflowProjectType,
                workflowId,
                workflowKind: 'create_project',
            });

            const workflow = (env as Env & {
                CODE_GENERATION_WORKFLOW?: Workflow<CodeGenerationWorkflowParams>;
            }).CODE_GENERATION_WORKFLOW;
            if (!workflow) {
                throw new Error('CODE_GENERATION_WORKFLOW binding is not configured');
            }

            await workflow.create({
                id: workflowId,
                params: {
                    kind: 'create_project',
                    agentId,
                    projectType: workflowProjectType,
                    requestedProjectType: projectType,
                    query,
                    language: body.language || defaultCodeGenArgs.language,
                    frameworks: body.frameworks || defaultCodeGenArgs.frameworks,
                    hostname,
                    inferenceContext,
                    images: workflowImages,
                    selectedTemplate: body.selectedTemplate,
                },
            });

            const acknowledgement = {
                message: 'Code generation queued',
                agentId,
                websocketUrl,
                httpStatusUrl,
                projectType: workflowProjectType,
                workflowStarted: true,
                workflowId,
                generationBackend,
            };

            this.logger.info(`Agent ${agentId} workflow launched successfully`, { workflowId });
            pendingAppForCleanup = null;
            pendingTaskSlot = null;
            
            return new Response(`${JSON.stringify(acknowledgement)}\n`, {
                status: 200,
                headers: {
                    // Use SSE content-type to ensure Cloudflare disables buffering,
                    // while the payload remains NDJSON lines consumed by the client.
                    'Content-Type': 'text/event-stream; charset=utf-8',
                    // Prevent intermediary caches/proxies from buffering or transforming
                    'Cache-Control': 'no-cache, no-store, must-revalidate, no-transform',
                    'Pragma': 'no-cache',
                    'Connection': 'keep-alive'
                }
            });
        } catch (error) {
            if (pendingAppForCleanup) {
                try {
                    await new AppService(env).deleteApp(pendingAppForCleanup.agentId, pendingAppForCleanup.userId);
                } catch (cleanupError) {
                    this.logger.warn('Failed to cleanup pending app after start failure', cleanupError);
                }
            }
            if (pendingTaskSlot) {
                await UserTaskConcurrencyService.release(env, pendingTaskSlot.userId, pendingTaskSlot.taskId);
            }
            this.logger.error('Error starting code generation', error);
            return CodingAgentController.handleError(error, 'start code generation');
        }
    }

    /**
     * Handle WebSocket connections for code generation
     * This routes the WebSocket connection directly to the Agent
     * 
     * Supports two authentication methods:
     * 1. Ticket-based auth (SDK): ?ticket=tk_xxx in URL
     * 2. JWT-based auth (Browser): Cookie/Header with origin validation
     */
    static async handleWebSocketConnection(
        request: Request,
        env: Env,
        _: ExecutionContext,
        context: RouteContext
    ): Promise<Response> {
        try {
            const agentId = context.pathParams.agentId;
            if (!agentId) {
                return CodingAgentController.createErrorResponse('Missing agent ID parameter', 400);
            }

            // Ensure the request is a WebSocket upgrade request
            if (request.headers.get('Upgrade') !== 'websocket') {
                return new Response('Expected WebSocket upgrade', { status: 426 });
            }

            // User already authenticated via ticket OR JWT by middleware
            const user = context.user;
            if (!user) {
                return CodingAgentController.createErrorResponse('Authentication required', 401);
            }

            // Origin validation only for non-ticket auth (ticket auth is origin-agnostic)
            const isTicketAuth = hasTicketParam(request);
            if (!isTicketAuth && !validateWebSocketOrigin(request, env)) {
                return new Response('Forbidden: Invalid origin', { status: 403 });
            }

            this.logger.info('WebSocket connection authorized', {
                agentId,
                userId: user.id,
                authMethod: isTicketAuth ? 'ticket' : 'jwt',
            });

            try {
                // Get the agent instance to handle the WebSocket connection
                const agentInstance = await getAgentStub(env, agentId);

                // Let the agent handle the WebSocket connection directly
                return agentInstance.fetch(request);
            } catch (error) {
                this.logger.error(`Failed to get agent instance with ID ${agentId}:`, error);
                // Return an appropriate WebSocket error response
                const { 0: client, 1: server } = new WebSocketPair();

                server.accept();
                server.send(JSON.stringify({
                    type: WebSocketMessageResponses.ERROR,
                    error: `Failed to get agent instance: ${error instanceof Error ? error.message : String(error)}`
                }));

                server.close(1011, 'Agent instance not found');

                return new Response(null, {
                    status: 101,
                    webSocket: client
                });
            }
        } catch (error) {
            this.logger.error('Error handling WebSocket connection', error);
            return CodingAgentController.handleError(error, 'handle WebSocket connection');
        }
    }

    /**
     * Connect to an existing agent instance
     * Returns connection information for an already created agent
     */
    static async connectToExistingAgent(
        request: Request,
        env: Env,
        _: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<AgentConnectionData>>> {
        try {
            const agentId = context.pathParams.agentId;
            if (!agentId) {
                return CodingAgentController.createErrorResponse<AgentConnectionData>('Missing agent ID parameter', 400);
            }

            this.logger.info(`Connecting to existing agent: ${agentId}`);

            try {
                // Verify the agent instance exists
                const agentInstance = await getAgentStub(env, agentId);
                if (!agentInstance || !(await agentInstance.isInitialized())) {
                    return CodingAgentController.createErrorResponse<AgentConnectionData>('Agent instance not found or not initialized', 404);
                }

                const appService = new AppService(env);
                const [appDetails, desiredStatus] = await Promise.all([
                    appService.getAppDetails(agentId, context.user?.id),
                    agentInstance.getDesiredAppStatus(),
                ]);

                if (appDetails && appDetails.status !== desiredStatus) {
                    await appService.updateApp(agentId, { status: desiredStatus });
                    this.logger.info(`Reconciled persisted app status for existing agent ${agentId}`, {
                        from: appDetails.status,
                        to: desiredStatus,
                    });
                }

                this.logger.info(`Successfully connected to existing agent: ${agentId}`);

                // Construct WebSocket URL
                const url = new URL(request.url);
                const websocketUrl = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}/api/agent/${agentId}/ws`;

                const responseData: AgentConnectionData = {
                    websocketUrl,
                    agentId,
                };

                return CodingAgentController.createSuccessResponse(responseData);
            } catch (error) {
                this.logger.error(`Failed to connect to agent ${agentId}:`, error);
                return CodingAgentController.createErrorResponse<AgentConnectionData>(`Agent instance not found or unavailable: ${error instanceof Error ? error.message : String(error)}`, 404);
            }
        } catch (error) {
            this.logger.error('Error connecting to existing agent', error);
            return CodingAgentController.handleError(error, 'connect to existing agent') as ControllerResponse<ApiResponse<AgentConnectionData>>;
        }
    }

    static async deployPreview(
        _request: Request,
        env: Env,
        _: ExecutionContext,
        context: RouteContext
    ): Promise<ControllerResponse<ApiResponse<AgentPreviewResponse>>> {
        try {
            const agentId = context.pathParams.agentId;
            if (!agentId) {
                return CodingAgentController.createErrorResponse<AgentPreviewResponse>('Missing agent ID parameter', 400);
            }

            const appService = new AppService(env);
            const appResult = await appService.getAppDetails(agentId);

            if (!appResult) {
                return CodingAgentController.createErrorResponse<AgentPreviewResponse>('App not found', 404);
            }

            // Check if app is public
            if(appResult.visibility !== 'public') {
                // If user is logged in and is the owner, allow preview deployment
                const user = context.user;
                if (!user || user.id !== appResult.userId) {
                    return CodingAgentController.createErrorResponse<AgentPreviewResponse>('App is not public. Preview deployment is only available for public apps.', 403);
                }
            }
            this.logger.info(`Deploying preview for agent: ${agentId}`);

            try {
                // Get the agent instance
                const agentInstance = await getAgentStub(env, agentId);
                
                // Deploy the preview
                const previewResult = await agentInstance.deployPreview();
                if (!previewResult) {
                    return CodingAgentController.createErrorResponse<AgentPreviewResponse>('Failed to deploy preview', 500);
                }
                const preview: AgentPreviewResponse = { previewURL: previewResult };
                this.logger.info('Preview deployed successfully', {
                    agentId,
                    previewUrl: preview.previewURL
                });

                return CodingAgentController.createSuccessResponse(preview);
            } catch (error) {
                this.logger.error('Failed to deploy preview', { agentId, error });
                return CodingAgentController.createErrorResponse<AgentPreviewResponse>('Failed to deploy preview', 500);
            }
        } catch (error) {
            this.logger.error('Error deploying preview', error);
            const appError = CodingAgentController.handleError(error, 'deploy preview') as ControllerResponse<ApiResponse<AgentPreviewResponse>>;
            return appError;
        }
    }
}
