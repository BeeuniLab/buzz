import { Agent, AgentContext, ConnectionContext, getAgentByName } from "agents";
import { AgentInitArgs, AgentSummary, AllIssues, DeployOptions, DeployResult, ExportOptions, ExportResult, BehaviorType, normalizePlayableAspectRatio } from "./types";
import {
    AgentState,
    BaseProjectState,
    CurrentDevState,
    FileState,
    MAX_PHASES,
    type ActiveWorkflowTask,
    type LastFailedWorkflow,
    type RetryableWorkflowIntent,
    type RetryableWorkflowKind,
} from "./state";
import { Blueprint, PhasicBlueprint } from "../schemas";
import { createObjectLogger, StructuredLogger } from '../../logger';
import { AgentActionKey, InferenceContext, InferenceMetadata, ModelConfig } from "../inferutils/config.types";
import { getMimeType } from 'hono/utils/mime';
import { normalizePath, isPathSafe } from '../../utils/pathUtils';
import { FileManager } from '../services/implementations/FileManager';
import { DeploymentManager } from '../services/implementations/DeploymentManager';
import { CodexGenerationManager } from '../services/implementations/CodexGenerationManager';
import { GitVersionControl } from '../git';
import { StateManager } from '../services/implementations/StateManager';
import { SqlExecutor } from '../git';
import { AgentInfrastructure } from "./AgentCore";
import { ProjectType } from './types';
import { Connection } from 'agents';
import { handleWebSocketMessage, handleWebSocketClose, broadcastToConnections, sendToConnection } from './websocket';
import { WebSocketMessageData, WebSocketMessageType } from "worker/api/websocketTypes";
import { PreviewType, RuntimeError, StaticAnalysisResponse, TemplateDetails, TemplateFile } from "worker/types/project-types";
import { WebSocketMessageResponses } from "../constants";
import { AppService, ModelConfigService } from "worker/database";
import {
    ConversationMessage,
    ConversationState,
    createAssistantMessage,
    createMultiModalUserMessage,
    createUserMessage,
} from "../inferutils/common";
import { ImageAttachment, type ProcessedImageAttachment } from "worker/types/image-attachment";
import { RateLimitExceededError } from "shared/types/errors";
import { ProjectObjective } from "./objectives/base";
import { SecretsClient, type UserSecretsStoreStub } from '../../services/secrets/SecretsClient';
import { StateMigration } from './stateMigration';
import { PendingWsTicket, TicketConsumptionResult } from '../../types/auth-types';
import { WsTicketManager } from '../../utils/wsTicketManager';
import { computeAgentAssetMapJson, parseAssetMapJson, uniqueAgentAssetRelativePath } from '../../utils/agentAssets';
import { uploadImageAsAgentAsset } from '../../utils/images';
import { generatePortToken } from '../../utils/cryptoUtils';
import { isDev } from '../../utils/envs';
import { getPreviewDomain, getProtocolForHost } from '../../utils/urls';
import { getTemplateDetails as fetchTemplateDetails, listTemplates } from '../../services/templates/templateCatalog';
import { getTemplateImportantFiles } from '../../services/templates/utils';
import { InMemoryAnalyzer } from '../../services/static-analysis';
import { createScratchTemplateDetails } from '../utils/templates';
import { customizeTemplateFiles, generateProjectName } from '../utils/templateCustomizer';
import { toInitialUserAttachment } from '../../types/image-attachment';
import { generateNanoId } from '../../utils/idGenerator';
import { updatePackageJson } from '../utils/packageSyncer';
import type { BaseSandboxService } from '../../services/sandbox/BaseSandboxService';
import { generateCoverImage } from '../assistants/coverGenerator';
import {
    UserTaskConcurrencyLimitError,
    UserTaskConcurrencyService,
} from '../../services/tasks/UserTaskConcurrencyService';
import { UserActivePreviewService } from '../../services/tasks/UserActivePreviewService';
import { GlobalSandboxCapacityService } from '../../services/tasks/GlobalSandboxCapacityService';
import type { ActiveTaskLease } from '../../services/rate-limit/DORateLimitStore';
import type {
    CodeGenerationWorkflowParams,
    CreateProjectWorkflowParams,
    DeployPreviewWorkflowParams,
    DeployProjectWorkflowParams,
    ExistingProjectWorkflowParams,
    UserInputWorkflowParams,
} from '../workflows/codeGenerationWorkflow';

const DEFAULT_CONVERSATION_SESSION_ID = 'default';
const LEGACY_STATE_BEHAVIOR_TYPE: BehaviorType = 'phasic';
const POST_VALIDATION_CONTEXT_LIMIT = 6000;

interface AgentBootstrapProps {
    projectType?: ProjectType;
}

type WorkflowBindingEnv = Env & {
    CODE_GENERATION_WORKFLOW?: Workflow<CodeGenerationWorkflowParams>;
};

type WorkflowInitArgs = Omit<AgentInitArgs<AgentState>, 'onBlueprintChunk'>;

const stripBase64FromProcessedAttachment = (attachment: ProcessedImageAttachment): ProcessedImageAttachment => {
    const { base64Data: _base64Data, ...workflowAttachment } = attachment;
    return workflowAttachment;
};

const isProcessedWorkflowAttachment = (
    attachment: ImageAttachment | ProcessedImageAttachment,
): attachment is ProcessedImageAttachment =>
    'r2Key' in attachment && typeof attachment.r2Key === 'string';

const isWorkflowTerminalStatus = (status: string | undefined): boolean =>
    status === 'complete' || status === 'errored' || status === 'terminated';

const isProjectType = (value: unknown): value is ProjectType =>
    value === 'app' || value === 'workflow' || value === 'presentation' || value === 'general';

const isRetryableWorkflowKind = (kind: ActiveWorkflowTask['kind']): kind is RetryableWorkflowKind =>
    kind === 'create_project'
    || kind === 'generate_all'
    || kind === 'resume_generation'
    || kind === 'user_input';

const truncatePostValidationContext = (context: string): string =>
    context.length > POST_VALIDATION_CONTEXT_LIMIT
        ? `${context.slice(0, POST_VALIDATION_CONTEXT_LIMIT)}\n... truncated`
        : context;

const ACTIVE_WORKFLOW_STALE_MS = 30 * 60 * 1000;
const OFFLINE_PREVIEW_RELEASE_GRACE_SECONDS = 120;
const USER_UPLOADED_MEDIA_HISTORY_MARKER = '[User-uploaded media - also listed in project assets / src/asset_map]';

function getCoverExtension(contentType: string): 'webp' | 'png' | 'jpg' {
    switch (contentType.toLowerCase()) {
        case 'image/png':
            return 'png';
        case 'image/jpeg':
        case 'image/jpg':
            return 'jpg';
        case 'image/webp':
        default:
            return 'webp';
    }
}

interface OfflinePreviewReleasePayload {
    instanceId?: string;
    scheduledAt: number;
    reason: string;
}

function mergeFrameworks(...groups: Array<string[] | undefined>): string[] {
    return Array.from(new Set(groups.flatMap((group) => group ?? []).filter(Boolean)));
}

function buildCodexBlueprint(args: {
    query: string;
    projectName: string;
    frameworks?: string[];
    templateFrameworks?: string[];
}): PhasicBlueprint {
    const normalizedQuery = args.query.replace(/\s+/g, ' ').trim();
    const title = normalizedQuery.length > 0 ? normalizedQuery : args.projectName;
    const description = normalizedQuery || 'Build the requested project from the selected template.';

    return {
        title: title.length > 100 ? `${title.slice(0, 97)}...` : title,
        projectName: args.projectName,
        description,
        colorPalette: [],
        frameworks: mergeFrameworks(args.frameworks, args.templateFrameworks),
        detailedDescription: description,
        views: [],
        userFlow: {
            uiLayout: '',
            uiDesign: '',
            userJourney: '',
        },
        dataFlow: '',
        architecture: {
            dataFlow: '',
        },
        pitfalls: [],
        implementationRoadmap: [],
        initialPhase: {
            name: 'implementation',
            description: 'Implemented directly from the selected template and latest request.',
            files: [],
            lastPhase: false,
        },
    };
}

export class CodeGeneratorAgent extends Agent<Env, AgentState> implements AgentInfrastructure<AgentState> {
    public _logger: StructuredLogger | undefined;
    private objective!: ProjectObjective<BaseProjectState>;
    private secretsClient: SecretsClient | null = null;
    private templateDetailsCache: TemplateDetails | null = null;
    private staticAnalysisCache: StaticAnalysisResponse | null = null;
    private sandboxReadyPromise: Promise<void>;
    private resolveSandboxReady!: () => void;
    private userModelConfigs?: Record<AgentActionKey, ModelConfig>;
    protected static readonly PROJECT_NAME_PREFIX_MAX_LENGTH = 20;
    
    /** Ticket manager for WebSocket authentication */
    private ticketManager = new WsTicketManager();
    
    // Services
    readonly fileManager: FileManager;
    readonly deploymentManager: DeploymentManager;
    readonly codexGenerationManager: CodexGenerationManager<AgentState>;
    readonly git: GitVersionControl;
    
    // Redeclare as public to satisfy AgentInfrastructure interface
    declare public readonly env: Env;
    declare public readonly sql: SqlExecutor;
    
    // ==========================================
    // Initialization
    // ==========================================
    
    initialState = {
        behaviorType: 'unknown' as BehaviorType,
        projectType: 'unknown' as ProjectType,
        projectName: "",
        query: "",
        initialUserAttachments: [],
        sessionId: '',
        hostname: '',
        blueprint: {} as unknown as Blueprint,
        templateName: '',
        generatedFilesMap: {},
        generatedFilesRevision: 0,
        conversationMessages: [],
        metadata: {} as InferenceMetadata,
        shouldBeGenerating: false,
        activeWorkflow: undefined,
        sandboxInstanceId: undefined,
        commandsHistory: [],
        lastPackageJson: '',
        pendingUserInputs: [],
        projectUpdatesAccumulator: [],
        lastDeepDebugTranscript: null,
        mvpGenerated: false,
        reviewingInitiated: false,
        generatedPhases: [],
        currentDevState: CurrentDevState.IDLE,
        phasesCounter: MAX_PHASES,
    } as unknown as AgentState;

    constructor(ctx: AgentContext, env: Env) {
        super(ctx, env);
        this.sandboxReadyPromise = new Promise(resolve => { this.resolveSandboxReady = resolve; });
        if (this.state.sandboxInstanceId) {
            this.resolveSandboxReady();
        }
                
        void this.sql`CREATE TABLE IF NOT EXISTS full_conversations (id TEXT PRIMARY KEY, messages TEXT)`;
        void this.sql`CREATE TABLE IF NOT EXISTS compact_conversations (id TEXT PRIMARY KEY, messages TEXT)`;

        // Create StateManager
        const stateManager = new StateManager(
            () => this.state,
            (s) => this.setState(s)
        );
        
        this.git = new GitVersionControl(this.sql.bind(this));
        this.fileManager = new FileManager(
            stateManager,
            () => this.getTemplateDetails(),
            this.git
        );
        this.deploymentManager = new DeploymentManager(
            {
                stateManager,
                fileManager: this.fileManager,
                getLogger: () => this.logger(),
                env: this.env
            },
            10, // MAX_COMMANDS_HISTORY
            (progress) => this.reportSandboxCapacityWaiting(progress.position),
        );
        this.codexGenerationManager = new CodexGenerationManager(
            {
                stateManager,
                fileManager: this.fileManager,
                getLogger: () => this.logger(),
                env: this.env,
            },
            this.deploymentManager,
        );
    }
    private createObjective(projectType: ProjectType): ProjectObjective<BaseProjectState> {
        return new ProjectObjective(this as AgentInfrastructure<BaseProjectState>, projectType);
    }

    /**
     * Initialize the agent with project blueprint and template
     * Only called once in an app's lifecycle
     */
    async initialize(
        initArgs: AgentInitArgs<AgentState>,
        ..._args: unknown[]
    ): Promise<AgentState> {
        const { inferenceContext } = initArgs;
        const sessionId = DeploymentManager.generateNewSessionId();
        this.initLogger(inferenceContext.metadata.agentId, inferenceContext.metadata.userId, sessionId);

        // Infrastructure setup
        await this.gitInit();

        await this.initializeCodexProjectState({
            ...initArgs,
            sessionId
        });
        
        await this.saveToDatabase();

        this.trackBackgroundTask('cover_generation', this.generateProjectCover());
        
        return this.state;
    }

    private async initializeCodexProjectState(initArgs: AgentInitArgs<AgentState>): Promise<void> {
        const templateDetails = initArgs.templateInfo?.templateDetails;
        if (!templateDetails) {
            throw new Error('Project initialization requires templateInfo.templateDetails');
        }

        this.templateDetailsCache = templateDetails;

        const { query, frameworks, hostname, inferenceContext, sessionId } = initArgs;
        const playableAspectRatio = normalizePlayableAspectRatio(initArgs.playableAspectRatio);
        const projectName = generateProjectName(
            query || templateDetails.name || 'project',
            generateNanoId(),
            CodeGeneratorAgent.PROJECT_NAME_PREFIX_MAX_LENGTH,
        );
        const blueprint = buildCodexBlueprint({
            query,
            projectName,
            frameworks,
            templateFrameworks: templateDetails.frameworks,
        });

        this.setState({
            ...this.state,
            behaviorType: LEGACY_STATE_BEHAVIOR_TYPE,
            projectType: templateDetails.projectType ?? this.state.projectType,
            projectName,
            query,
            playableAspectRatio,
            initialUserAttachments: (initArgs.images ?? []).map(toInitialUserAttachment),
            templateName: templateDetails.name,
            sandboxInstanceId: undefined,
            commandsHistory: [],
            lastPackageJson: templateDetails.allFiles['package.json'],
            sessionId: sessionId!,
            hostname,
            metadata: inferenceContext.metadata,
            blueprint,
            generatedPhases: [],
            currentDevState: CurrentDevState.IDLE,
            phasesCounter: MAX_PHASES,
        } as AgentState);

        const customizedFiles = customizeTemplateFiles(
            templateDetails.allFiles,
            {
                projectName,
                commandsHistory: [],
            },
        );

        const filesToSave = Object.entries(customizedFiles).map(([filePath, content]) => ({
            filePath,
            fileContents: content,
            filePurpose: 'Project configuration file',
        }));

        await this.fileManager.saveGeneratedFiles(
            filesToSave,
            'Initialize project configuration files',
            true,
        );

        this.logger().info('Initialized Codex project state', {
            projectName,
            templateName: templateDetails.name,
            projectType: this.state.projectType,
        });
    }
    
    async isInitialized() {
        return this.getAgentId() ? true : false
    }

    /**
     * Called evertime when agent is started or re-started
     * @param props - Optional props
     */
    async onStart(props?: Record<string, unknown> | undefined): Promise<void> {
        // Run common migration FIRST, before any state access
        const migratedState = StateMigration.migrateCommon(this.state);
        if (migratedState) {
            this.setState(migratedState);
        }

        this.logger().info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} onStart`, { props });

        this.logger().info('Bootstrapping CodeGeneratorAgent', { props });
        const agentProps = props as AgentBootstrapProps;
        const projectTypeCandidate = agentProps?.projectType ?? this.state.projectType;
        const projectType = isProjectType(projectTypeCandidate) ? projectTypeCandidate : 'app';

        const stateWithoutGenerationBackend = { ...this.state };
        delete stateWithoutGenerationBackend.generationBackend;
        this.setState({
            ...stateWithoutGenerationBackend,
            behaviorType: LEGACY_STATE_BEHAVIOR_TYPE,
            projectType,
            playableAspectRatio: normalizePlayableAspectRatio(this.state.playableAspectRatio),
        } as AgentState);
        
        // Create objective based on project type
        this.objective = this.createObjective(projectType);

        // Ignore if agent not initialized
        if (!this.state.query) {
            this.logger().warn(`Agent ${this.getAgentId()} session: ${this.state.sessionId} onStart ignored, agent not initialized`);
            return;
        }

        // Check if this is a read-only operation
        const readOnlyMode = props?.readOnlyMode === true;
        
        if (readOnlyMode) {
            this.logger().info(`Agent ${this.getAgentId()} starting in READ-ONLY mode - skipping expensive initialization`);
            return;
        }
        
        if (!this.state.templateName) {
            this.logger().info(`Agent ${this.getAgentId()} is pending workflow initialization; skipping template bootstrap`);
            return;
        }

        // Just in case
        await this.gitInit();
        
        await this.ensureTemplateDetails();
        this.logger().info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} onStart processed successfully`);

        // Load the latest user configs
        const modelConfigService = new ModelConfigService(this.env);
        const userConfigsRecord = await modelConfigService.getUserModelConfigs(this.state.metadata.userId);
        this.userModelConfigs = userConfigsRecord;
        this.logger().info(`Agent ${this.getAgentId()} session: ${this.state.sessionId} onStart: User configs loaded successfully`, {userConfigsRecord});
    }
    
    onConnect(connection: Connection, ctx: ConnectionContext) {
        this.logger().info(`Agent connected for agent ${this.getAgentId()}`, { connection, ctx });
        let previewUrl = '';
        let templateDetails: TemplateDetails | null = null;
        try {
            templateDetails = this.getTemplateDetails();
            if (templateDetails.renderMode === 'browser') {
                previewUrl = this.getBrowserPreviewURL();
            }
        } catch (error) {
            this.logger().info('Template details not ready during websocket connect', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
        sendToConnection(connection, WebSocketMessageResponses.AGENT_CONNECTED, {
            state: this.state,
            templateDetails,
            previewUrl: previewUrl
        });
    }

    private initLogger(agentId: string, userId: string, sessionId?: string) {
        this._logger = createObjectLogger(this, 'CodeGeneratorAgent');
        this._logger.setObjectId(agentId);
        this._logger.setFields({
            agentId,
            userId,
            projectType: this.state.projectType,
        });
        if (sessionId) {
            this._logger.setField('sessionId', sessionId);
        }
        return this._logger;
    }
    
    // ==========================================
    // Utilities
    // ==========================================

    logger(): StructuredLogger {
        if (!this._logger) {
            this._logger = this.initLogger(this.getAgentId(), this.state.metadata.userId, this.state.sessionId);
        }
        return this._logger;
    }

    getAgentId() {
        return this.state.metadata.agentId;
    }
    
    getWebSockets(): WebSocket[] {
        return this.ctx.getWebSockets();
    }

    getSandboxServiceClient(): BaseSandboxService {
        return this.deploymentManager.getClient();
    }

    private getInferenceContext(): InferenceContext {
        return {
            metadata: this.state.metadata,
            enableFastSmartCodeFix: false,
            enableRealtimeCodeFix: false,
            userModelConfigs: this.userModelConfigs,
        };
    }

    async ensureTemplateDetails(): Promise<TemplateDetails | null> {
        if (!this.templateDetailsCache) {
            if (this.state.templateName === 'scratch') {
                this.logger().info('Using scratch template details');
                this.templateDetailsCache = createScratchTemplateDetails();
                return this.templateDetailsCache;
            }

            if (!this.state.templateName) {
                return null;
            }

            this.logger().info(`Loading template details for: ${this.state.templateName}`);
            const results = await fetchTemplateDetails(this.env.TEMPLATES_BUCKET, this.state.templateName);
            if (!results.success || !results.templateDetails) {
                throw new Error(`Failed to get template details for: ${this.state.templateName}`);
            }

            const templateDetails = results.templateDetails;
            const customizedFiles = customizeTemplateFiles(
                templateDetails.allFiles,
                {
                    projectName: this.state.projectName,
                    commandsHistory: this.state.commandsHistory ?? [],
                },
            );

            this.templateDetailsCache = {
                ...templateDetails,
                allFiles: {
                    ...templateDetails.allFiles,
                    ...customizedFiles,
                },
            };
            this.logger().info('Template details loaded and customized');

            if (templateDetails.renderMode === 'browser') {
                await this.deployToSandbox();
            }
        }

        return this.templateDetailsCache;
    }

    getTemplateDetails(): TemplateDetails {
        if (!this.templateDetailsCache) {
            if (this.state.templateName === 'scratch') {
                this.templateDetailsCache = createScratchTemplateDetails();
                return this.templateDetailsCache;
            }
            void this.ensureTemplateDetails();
            throw new Error('Template details not loaded. Call ensureTemplateDetails() first.');
        }
        return this.templateDetailsCache;
    }

    private isPreviewable(): boolean {
        return this.fileManager.fileExists('package.json')
            && (this.fileManager.fileExists('wrangler.jsonc') || this.fileManager.fileExists('wrangler.toml'));
    }

    private async waitForSandboxReady(timeoutMs: number = 5000): Promise<boolean> {
        const ready = await Promise.race([
            this.sandboxReadyPromise.then(() => true),
            new Promise<false>(resolve => setTimeout(() => resolve(false), timeoutMs)),
        ]);
        if (!ready) {
            this.logger().warn(`Sandbox not ready after ${timeoutMs}ms`);
        }
        return ready;
    }

    private emptyStaticAnalysisResponse(error?: string): StaticAnalysisResponse {
        return {
            success: false,
            lint: { issues: [] },
            typecheck: { issues: [] },
            ...(error ? { error } : {}),
        };
    }

    private async ensureSandboxForStaticAnalysis(): Promise<boolean> {
        if (this.state.sandboxInstanceId) return true;
        if (!this.isPreviewable()) {
            this.logger().warn('Skipping sandbox static analysis because project is not previewable');
            return false;
        }

        this.logger().info('No sandbox instance available for static analysis; deploying preview first');
        const preview = await this.deployToSandbox(
            [],
            false,
            'chore: prepare sandbox for static analysis',
            false,
        );

        return Boolean(this.state.sandboxInstanceId || preview?.runId);
    }

    private getOrCreateFileServingToken(): string {
        const existing = this.state.fileServingToken?.token;
        if (!existing || /[^a-z0-9]/.test(existing)) {
            const token = generatePortToken();
            this.setState({
                ...this.state,
                fileServingToken: {
                    token,
                    createdAt: Date.now(),
                },
            } as AgentState);
        }
        return this.state.fileServingToken!.token;
    }

    getBrowserPreviewURL(): string {
        const token = this.getOrCreateFileServingToken();
        const agentId = this.getAgentId();
        const previewDomain = isDev(this.env) ? 'localhost:5173' : getPreviewDomain(this.env);
        return `${getProtocolForHost(previewDomain)}://b-${agentId}-${token}.${previewDomain}`;
    }

    async deployToSandbox(
        files: FileState[] = [],
        redeploy = false,
        commitMessage?: string,
        clearLogs = false,
        options?: {
            capacityMode?: 'background' | 'foreground';
            shouldContinueWaiting?: () => boolean;
            onCapacityWaiting?: (position: number) => Promise<void> | void;
        },
    ): Promise<PreviewType | null> {
        if (!this.isPreviewable()) {
            throw new Error('Project is not previewable');
        }

        const templateDetails = this.getTemplateDetails();
        this.logger().info('[AGENT] Deploying to sandbox', {
            files: files.length,
            redeploy,
            commitMessage,
            renderMode: templateDetails.renderMode,
            template: {
                name: templateDetails.name,
                importantFiles: templateDetails.importantFiles?.length ?? 0,
                dontTouchFiles: templateDetails.dontTouchFiles?.length ?? 0,
                redactedFiles: templateDetails.redactedFiles?.length ?? 0,
                allFilesCount: Object.keys(templateDetails.allFiles ?? {}).length,
            },
        });

        if (templateDetails.renderMode === 'browser') {
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, {
                message: 'Preparing preview',
                files: [],
            });
            const result: PreviewType = {
                previewURL: this.getBrowserPreviewURL(),
            };
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, result);
            return result;
        }

        this.staticAnalysisCache = null;
        const result = await this.deploymentManager.deployToSandbox(
            files,
            redeploy,
            commitMessage,
            clearLogs,
            {
                onStarted: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, data);
                },
                onCompleted: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, data);
                },
                onError: (data) => {
                    this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, data);
                },
                onAfterSetupCommands: async () => {
                    await this.syncPackageJsonFromSandbox();
                },
            },
            options ? {
                capacityMode: options.capacityMode,
                shouldContinueWaiting: options.shouldContinueWaiting,
                onCapacityWaiting: options.onCapacityWaiting
                    ? (progress) => options.onCapacityWaiting?.(progress.position)
                    : undefined,
            } : undefined,
        );

        this.resolveSandboxReady();
        return result;
    }

    async fetchRuntimeErrors(clear = true, shouldWait = true): Promise<RuntimeError[]> {
        if (shouldWait) {
            await this.deploymentManager.waitForPreview();
        }

        try {
            const errors = await this.deploymentManager.fetchRuntimeErrors(clear);
            if (errors.length > 0) {
                this.broadcast(WebSocketMessageResponses.RUNTIME_ERROR_FOUND, {
                    errors,
                    message: 'Runtime errors found',
                    count: errors.length,
                });
            }
            return errors;
        } catch (error) {
            this.logger().error('Exception fetching runtime errors:', error);
            void this.deployToSandbox();
            const message = '<runtime errors not available at the moment as preview is not deployed>';
            return [{ message, timestamp: new Date().toISOString(), level: 0, rawOutput: message }];
        }
    }

    async runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse> {
        try {
            if (!files && this.staticAnalysisCache) {
                return this.staticAnalysisCache;
            }

            const templateDetails = this.getTemplateDetails();
            const analysisResponse = templateDetails.renderMode === 'browser'
                ? await this.runInMemoryAnalysis(files)
                : await (async () => {
                    const hasSandbox = await this.ensureSandboxForStaticAnalysis();
                    return hasSandbox
                        ? this.deploymentManager.runStaticAnalysis(files)
                        : this.emptyStaticAnalysisResponse('Sandbox unavailable for static analysis');
                })();

            if (!files) {
                this.staticAnalysisCache = analysisResponse;
            }

            this.broadcast(WebSocketMessageResponses.STATIC_ANALYSIS_RESULTS, {
                lint: { issues: analysisResponse.lint.issues, summary: analysisResponse.lint.summary },
                typecheck: { issues: analysisResponse.typecheck.issues, summary: analysisResponse.typecheck.summary },
            });

            return analysisResponse;
        } catch (error) {
            this.broadcastError('Failed to lint code', error);
            return this.emptyStaticAnalysisResponse(error instanceof Error ? error.message : String(error));
        }
    }

    private async runInMemoryAnalysis(filePaths?: string[]): Promise<StaticAnalysisResponse> {
        const allFiles = this.fileManager.getAllFiles();
        const filePathSet = filePaths ? new Set(filePaths) : null;
        const filesToAnalyze = filePathSet
            ? allFiles.filter((f) => filePathSet.has(f.filePath))
            : allFiles;

        const analyzer = new InMemoryAnalyzer();
        return analyzer.analyze(filesToAnalyze.map((f) => ({
            path: f.filePath,
            content: f.fileContents,
        })));
    }

    async fetchAllIssues(resetIssues = false): Promise<AllIssues> {
        const templateDetails = this.getTemplateDetails();
        if (templateDetails.renderMode === 'browser') {
            const staticAnalysis = await this.runStaticAnalysisCode();
            this.logger().info('Fetched issues for browser-rendered project', { staticAnalysis });
            return { runtimeErrors: [], staticAnalysis };
        }

        if (!await this.waitForSandboxReady()) {
            return {
                runtimeErrors: [],
                staticAnalysis: this.emptyStaticAnalysisResponse('Sandbox not ready'),
            };
        }

        const [runtimeErrors, staticAnalysis] = await Promise.all([
            this.fetchRuntimeErrors(resetIssues),
            this.runStaticAnalysisCode(),
        ]);
        this.logger().info('Fetched all issues', { runtimeErrors, staticAnalysis });
        return { runtimeErrors, staticAnalysis };
    }

    private formatIssuesForPostValidationContext(issues: AllIssues): string {
        const runtimeErrors = issues.runtimeErrors.slice(0, 8).map((error, index) => {
            const message = error.message || error.rawOutput || 'Unknown runtime error';
            return `${index + 1}. ${message.split('\n').slice(0, 8).join('\n')}`;
        });
        const formatStaticIssues = (label: string, issueList: StaticAnalysisResponse['lint']['issues']) => {
            const relevantIssues = issueList
                .filter((issue) => issue.severity === 'error')
                .slice(0, 12);
            if (relevantIssues.length === 0) return '';
            return [
                `${label}:`,
                ...relevantIssues.map((issue, index) =>
                    `${index + 1}. ${issue.filePath}:${issue.line}${issue.column ? `:${issue.column}` : ''} [${issue.severity}] ${issue.message}${issue.ruleId ? ` (${issue.ruleId})` : ''}`
                ),
            ].join('\n');
        };

        const sections = [
            runtimeErrors.length > 0 ? `Runtime errors:\n${runtimeErrors.join('\n\n')}` : '',
            formatStaticIssues('Type errors', issues.staticAnalysis.typecheck.issues),
            formatStaticIssues('Lint errors', issues.staticAnalysis.lint.issues),
            issues.staticAnalysis.error ? `Static analysis error:\n${issues.staticAnalysis.error}` : '',
        ].filter(Boolean);

        return truncatePostValidationContext(sections.join('\n\n'));
    }

    async readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }> {
        const results: { path: string; content: string }[] = [];
        const notFoundInFileManager: string[] = [];

        for (const path of paths) {
            const file = this.fileManager.getFile(path);
            if (file) {
                results.push({ path, content: file.fileContents });
            } else {
                notFoundInFileManager.push(path);
            }
        }

        if (notFoundInFileManager.length > 0 && this.state.sandboxInstanceId) {
            const resp = await this.getSandboxServiceClient().getFiles(
                this.state.sandboxInstanceId,
                notFoundInFileManager,
            );
            if (resp.success) {
                results.push(...resp.files.map(f => ({
                    path: f.filePath,
                    content: f.fileContents,
                })));
            }
        }

        return { files: results };
    }

    private async syncPackageJsonFromSandbox(): Promise<void> {
        try {
            this.logger().info('Fetching current package.json from sandbox');
            const results = await this.readFiles(['package.json']);
            if (!results.files.length) {
                this.logger().warn('Failed to fetch package.json from sandbox', { results });
                return;
            }

            const packageJsonContent = results.files[0].content;
            const { updated, packageJson } = updatePackageJson(this.state.lastPackageJson, packageJsonContent);
            if (!updated) {
                this.logger().info('package.json has not changed, skipping sync');
                return;
            }

            this.setState({
                ...this.state,
                lastPackageJson: packageJson,
            } as AgentState);

            const fileState = await this.fileManager.saveGeneratedFile(
                {
                    filePath: 'package.json',
                    fileContents: packageJson,
                    filePurpose: 'Project dependencies and configuration',
                },
                'chore: sync package.json dependencies from sandbox',
                true,
            );

            this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
                message: 'Synced package.json from sandbox',
                file: fileState,
            });
        } catch (error) {
            this.logger().error('Failed to sync package.json from sandbox', error);
        }
    }

    private getWorkflowBinding(): Workflow<CodeGenerationWorkflowParams> | null {
        return (this.env as WorkflowBindingEnv).CODE_GENERATION_WORKFLOW ?? null;
    }

    private createWorkflowId(kind: CodeGenerationWorkflowParams['kind']): string {
        const suffix = Math.random().toString(36).slice(2, 8);
        return `${this.getAgentId()}-${kind}-${Date.now().toString(36)}-${suffix}`;
    }

    private getWorkflowUserId(): string | undefined {
        return this.state.metadata?.userId;
    }

    private buildCodexWorkflowQuery(kind: ExistingProjectWorkflowParams['kind'] | 'user_input'): string {
        const originalRequest = this.state.query || 'Continue implementing the current project.';
        if (kind === 'resume_generation') {
            return `Resume implementation of this project from the current workspace state.\n\nOriginal request:\n${originalRequest}`;
        }
        return `Continue implementing this project from the current workspace state until the requested MVP is complete.\n\nOriginal request:\n${originalRequest}`;
    }

    private normalizeRetryableWorkflowIntent(intent: RetryableWorkflowIntent): RetryableWorkflowIntent {
        return {
            ...intent,
            query: intent.query || this.state.query || 'Continue the current project.',
            playableAspectRatio: normalizePlayableAspectRatio(intent.playableAspectRatio ?? this.state.playableAspectRatio),
            images: intent.images?.map(stripBase64FromProcessedAttachment),
        };
    }

    private getFailedWorkflowIntent(args: {
        workflowId: string;
        kind: ActiveWorkflowTask['kind'];
        message?: string;
    }): LastFailedWorkflow | undefined {
        if (!isRetryableWorkflowKind(args.kind)) return undefined;

        const existing = this.state.lastRetryableWorkflow;
        const matchingExisting = existing
            && existing.kind === args.kind
            && (!existing.workflowId || existing.workflowId === args.workflowId);

        const fallbackQuery = args.kind === 'create_project'
            ? this.state.query
            : args.kind === 'user_input'
                ? this.state.query
                : this.buildCodexWorkflowQuery(args.kind);

        return {
            ...this.normalizeRetryableWorkflowIntent(matchingExisting ? existing : {
                workflowId: args.workflowId,
                kind: args.kind,
                query: fallbackQuery,
                hostname: this.state.hostname,
                requestedProjectType: this.state.projectType,
                playableAspectRatio: this.state.playableAspectRatio,
            }),
            error: args.message,
            failedAt: Date.now(),
        };
    }

    private async acquireUserTaskSlot(workflowId: string, kind: ActiveWorkflowTask['kind']): Promise<void> {
        const userId = this.getWorkflowUserId();
        if (!userId) return;

        await UserTaskConcurrencyService.acquire(this.env, {
            userId,
            taskId: workflowId,
            agentId: this.getAgentId(),
            kind,
        });
    }

    private async touchUserTaskSlot(workflowId: string | undefined): Promise<void> {
        await UserTaskConcurrencyService.touch(this.env, this.getWorkflowUserId(), workflowId);
    }

    private async releaseUserTaskSlot(workflowId: string | undefined): Promise<void> {
        await UserTaskConcurrencyService.release(this.env, this.getWorkflowUserId(), workflowId);
    }

    private async reserveActivePreviewSlot(): Promise<{ candidates: ActiveTaskLease[]; releasesNeeded: number }> {
        const userId = this.getWorkflowUserId();
        const agentId = this.getAgentId();
        if (!userId || !agentId) return { candidates: [], releasesNeeded: 0 };

        try {
            const reservation = await UserActivePreviewService.reserve(this.env, { userId, agentId });
            return {
                candidates: reservation.evictionCandidates,
                releasesNeeded: reservation.releasesNeeded,
            };
        } catch (error) {
            this.logger().warn('Failed to reserve active preview slot; allowing preview to continue', {
                userId,
                agentId,
                error: error instanceof Error ? error.message : String(error),
            });
            return { candidates: [], releasesNeeded: 0 };
        }
    }

    private async releaseActivePreviewSlot(): Promise<void> {
        await UserActivePreviewService.release(this.env, this.getWorkflowUserId(), this.getAgentId());
    }

    private async releaseGlobalSandboxCapacity(): Promise<void> {
        await GlobalSandboxCapacityService.release(this.env, this.getAgentId());
    }

    private async reportSandboxCapacityWaiting(position: number): Promise<void> {
        const message = `Waiting for an available workspace. You're #${position} in line.`;
        const activeWorkflow = this.state.activeWorkflow;
        this.logger().info('Waiting for global sandbox capacity', {
            agentId: this.getAgentId(),
            workflowId: activeWorkflow?.id,
            kind: activeWorkflow?.kind,
            position,
        });

        if (activeWorkflow?.id) {
            await this.updateWorkflowStatus({
                workflowId: activeWorkflow.id,
                kind: activeWorkflow.kind,
                status: 'running',
                message,
                queuePosition: position,
            });
            return;
        }

        this.broadcast(WebSocketMessageResponses.SERVER_LOG, {
            message,
            level: 'info',
            timestamp: Date.now(),
            source: 'workflow',
            workflowKind: 'sandbox',
            queuePosition: position,
        });
    }

    private reportPreviewCapacityWaiting(position: number): void {
        this.logger().info('Waiting for preview sandbox capacity', {
            agentId: this.getAgentId(),
            position,
        });
        this.broadcast(WebSocketMessageResponses.PREVIEW_QUEUE_WAITING, { position });
    }

    private hasLivePreviewClients(): boolean {
        return this.getWebSockets().length > 0;
    }

    private async scheduleOfflinePreviewRelease(
        reason: string,
        options: { allowLiveClients?: boolean } = {},
    ): Promise<void> {
        if ((!options.allowLiveClients && this.hasLivePreviewClients()) || !this.state.sandboxInstanceId) {
            return;
        }

        const payload: OfflinePreviewReleasePayload = {
            instanceId: this.state.sandboxInstanceId,
            scheduledAt: Date.now(),
            reason,
        };

        try {
            await this.schedule(
                OFFLINE_PREVIEW_RELEASE_GRACE_SECONDS,
                'releaseOfflinePreviewAfterGrace',
                payload,
            );
            this.logger().info('Scheduled offline preview release', {
                ...payload,
                graceSeconds: OFFLINE_PREVIEW_RELEASE_GRACE_SECONDS,
            });
        } catch (error) {
            this.logger().warn('Failed to schedule offline preview release', {
                ...payload,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async releaseOfflinePreviewAfterGrace(payload: OfflinePreviewReleasePayload): Promise<void> {
        if (this.hasLivePreviewClients()) {
            this.logger().info('Keeping preview sandbox because a client reconnected before grace expired', payload);
            return;
        }
        if (this.state.activeWorkflow || this.state.shouldBeGenerating) {
            this.logger().info('Keeping preview sandbox because a workflow is active after grace expired', payload);
            return;
        }
        if (!payload.instanceId || this.state.sandboxInstanceId !== payload.instanceId) {
            this.logger().info('Skipping offline preview release because sandbox instance changed', {
                ...payload,
                currentInstanceId: this.state.sandboxInstanceId,
            });
            return;
        }

        await this.releasePreviewSandbox(payload.reason);
    }

    async schedulePreviewReleaseAfterClientDisconnect(): Promise<void> {
        if (this.state.activeWorkflow || this.state.shouldBeGenerating || !this.state.sandboxInstanceId) {
            return;
        }

        await this.scheduleOfflinePreviewRelease('preview_client_disconnected_offline', {
            allowLiveClients: true,
        });
    }

    private async releaseEvictedPreviewSandboxes(candidates: ActiveTaskLease[], releasesNeeded: number): Promise<void> {
        const currentAgentId = this.getAgentId();
        if (releasesNeeded <= 0) return;

        let releasedCount = 0;
        for (const preview of candidates) {
            const agentId = preview.agentId ?? preview.taskId;
            if (!agentId || agentId === currentAgentId) continue;

            try {
                const agent = await getAgentByName<Env, CodeGeneratorAgent>(this.env.CodeGenObject, agentId, {
                    props: { readOnlyMode: true },
                });
                const released = await agent.releasePreviewSandbox('preview limit exceeded');
                if (released) {
                    releasedCount++;
                }
                if (releasedCount >= releasesNeeded) {
                    return;
                }
            } catch (error) {
                this.logger().warn('Failed to release evicted preview sandbox', {
                    evictedAgentId: agentId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        this.logger().warn('Could not release enough active preview sandboxes', {
            releasesNeeded,
            releasedCount,
            candidates: candidates.map(preview => preview.agentId ?? preview.taskId),
        });
    }

    private async markCurrentPreviewActive(): Promise<void> {
        const previewReservation = await this.reserveActivePreviewSlot();
        await this.releaseEvictedPreviewSandboxes(
            previewReservation.candidates,
            previewReservation.releasesNeeded,
        );
    }

    private isDeleted(): boolean {
        return Boolean(this.state.deletedAt);
    }

    private throwIfDeleted(operation: string): void {
        if (this.isDeleted()) {
            throw new Error(`Cannot ${operation}; project has been deleted`);
        }
    }

    private async uploadWorkflowUserInputAssets(images?: ImageAttachment[]): Promise<ProcessedImageAttachment[] | undefined> {
        if (!images || images.length === 0) return undefined;

        const usedPaths = new Set<string>();
        const uploadedImages = await Promise.all(
            images.map(async (image, index) => {
                const relativePath = uniqueAgentAssetRelativePath(image, index, usedPaths);
                const uploaded = await uploadImageAsAgentAsset(this.env, this.getAgentId(), image, relativePath);
                return stripBase64FromProcessedAttachment(uploaded);
            }),
        );

        return uploadedImages;
    }

    private async normalizeWorkflowAttachments(
        images?: Array<ImageAttachment | ProcessedImageAttachment>,
    ): Promise<ProcessedImageAttachment[] | undefined> {
        if (!images || images.length === 0) return undefined;
        if (images.every(isProcessedWorkflowAttachment)) {
            return images.map(stripBase64FromProcessedAttachment);
        }
        return this.uploadWorkflowUserInputAssets(images as ImageAttachment[]);
    }

    private hasCompletedPlayable(): boolean {
        return Boolean(this.state.mvpGenerated && Object.keys(this.state.generatedFilesMap ?? {}).length > 0);
    }

    private async updateAppStatus(status: 'generating' | 'completed', reason: string): Promise<void> {
        try {
            if (this.isDeleted()) {
                this.logger().info('Skipping app status update for deleted project', { status, reason });
                return;
            }
            const agentId = this.getAgentId();
            if (!agentId) return;
            const appService = new AppService(this.env);
            await appService.updateApp(agentId, { status });
            this.logger().info('Updated app status from agent workflow control', { status, reason });
        } catch (error) {
            this.logger().warn('Failed to update app status from agent workflow control', {
                status,
                reason,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async updateWorkflowStatus(args: {
        workflowId: string;
        kind: ActiveWorkflowTask['kind'];
        status: ActiveWorkflowTask['status'] | 'completed';
        message?: string;
        queuePosition?: number;
    }): Promise<void> {
        const shouldReleaseTaskSlot = args.status === 'failed' || args.status === 'completed';
        if (shouldReleaseTaskSlot) {
            await this.releaseUserTaskSlot(args.workflowId);
            if (!this.state.sandboxInstanceId) {
                await this.releaseGlobalSandboxCapacity();
            }
        } else {
            await this.touchUserTaskSlot(args.workflowId);
        }

        if (this.isDeleted()) {
            this.logger().info('Ignoring workflow status update for deleted project', args);
            return;
        }

        const now = Date.now();
        const existing = this.state.activeWorkflow;
        const shouldClear = args.status === 'completed' || args.status === 'failed';
        const wasStopped = shouldClear && Boolean(this.state.lastUserStopAt);
        const message = wasStopped
            ? `Workflow ${args.kind} stopped`
            : args.message;
        const failedWorkflow = args.status === 'failed'
            ? this.getFailedWorkflowIntent({ workflowId: args.workflowId, kind: args.kind, message })
            : undefined;
        const isCompletedRetryableWorkflow = args.status === 'completed' && isRetryableWorkflowKind(args.kind);

        this.setState({
            ...this.state,
            activeWorkflow: shouldClear ? undefined : {
                id: args.workflowId,
                kind: args.kind,
                status: args.status,
                message,
                queuePosition: args.queuePosition,
                startedAt: existing?.id === args.workflowId ? existing.startedAt : now,
                updatedAt: now,
            },
            shouldBeGenerating: args.status === 'failed' || shouldClear
                ? false
                : this.state.shouldBeGenerating,
            lastFailedWorkflow: failedWorkflow ?? (isCompletedRetryableWorkflow ? undefined : this.state.lastFailedWorkflow),
            lastRetryableWorkflow: isCompletedRetryableWorkflow ? undefined : this.state.lastRetryableWorkflow,
        } as AgentState);

        this.logger().info('Workflow status updated', { ...args, message });
        this.broadcast(WebSocketMessageResponses.SERVER_LOG, {
            message: message || `Workflow ${args.kind} ${args.status}`,
            level: args.status === 'failed' ? 'error' : 'info',
            timestamp: now,
            source: 'workflow',
            workflowKind: args.kind,
        });

        if (args.status === 'failed') {
            await this.updateAppStatus('completed', `workflow_${args.kind}_failed`);
            const failureMessage = failedWorkflow
                ? this.buildGenerationFailureMessage(message)
                : message || `Workflow ${args.kind} failed`;
            if (failedWorkflow) {
                this.recordWorkflowAssistantMessage(
                    args.workflowId,
                    'failed',
                    failureMessage,
                );
                this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                    message: failureMessage,
                    conversationId: this.workflowConversationId(args.workflowId, 'failed'),
                    isStreaming: false,
                    action: {
                        type: 'retry_last_failed_workflow',
                        label: 'Retry',
                    },
                });
            }
            this.broadcast(WebSocketMessageResponses.ERROR, {
                error: failureMessage,
            });
        } else if (args.status === 'queued' || args.status === 'running') {
            await this.updateAppStatus('generating', `workflow_${args.kind}_${args.status}`);
        } else if (args.status === 'completed') {
            await this.updateAppStatus(await this.getDesiredAppStatus(), `workflow_${args.kind}_completed`);
        }
    }

    async stopActiveWorkflow(reason = 'user_stopped_generation'): Promise<boolean> {
        const activeWorkflow = this.state.activeWorkflow;
        if (!activeWorkflow?.id) {
            this.logger().info('No active workflow to stop', { reason });
            return false;
        }

        const workflow = this.getWorkflowBinding();
        let terminated = false;
        let status: string | undefined;

        if (!workflow) {
            this.logger().warn('Workflow binding missing while stopping active workflow', {
                reason,
                activeWorkflow,
            });
        } else {
            try {
                const instance = await workflow.get(activeWorkflow.id);
                try {
                    status = (await instance.status()).status;
                } catch (statusError) {
                    this.logger().warn('Unable to fetch workflow status before terminate', {
                        workflowId: activeWorkflow.id,
                        error: statusError instanceof Error ? statusError.message : String(statusError),
                    });
                }

                if (!isWorkflowTerminalStatus(status)) {
                    await instance.terminate();
                    terminated = true;
                }

                this.logger().info('Stopped active workflow', {
                    reason,
                    workflowId: activeWorkflow.id,
                    kind: activeWorkflow.kind,
                    previousStatus: status,
                    terminated,
                });
            } catch (error) {
                this.logger().warn('Failed to terminate active workflow', {
                    reason,
                    workflowId: activeWorkflow.id,
                    kind: activeWorkflow.kind,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        this.setState({
            ...this.state,
            activeWorkflow: undefined,
            shouldBeGenerating: false,
            lastUserStopAt: Date.now(),
        });
        await this.releaseUserTaskSlot(activeWorkflow.id);
        if (!this.state.sandboxInstanceId) {
            await this.releaseGlobalSandboxCapacity();
        }
        await this.updateAppStatus('completed', reason);
        this.broadcast(WebSocketMessageResponses.SERVER_LOG, {
            message: terminated
                ? `Stopped workflow ${activeWorkflow.kind}`
                : `Cleared workflow ${activeWorkflow.kind}`,
            level: terminated ? 'info' : 'warn',
            timestamp: Date.now(),
            source: 'workflow',
            workflowKind: activeWorkflow.kind,
        });

        return terminated;
    }

    async stopGenerationFromUser(reason = 'user_stopped_generation'): Promise<{ workflowTerminated: boolean; taskStopped: boolean }> {
        const activeWorkflow = this.state.activeWorkflow;
        const hadActiveTask = Boolean(
            this.state.activeAppTask ||
            activeWorkflow ||
            this.state.shouldBeGenerating,
        );
        const stoppedAt = Date.now();

        this.setState({
            ...this.state,
            activeAppTask: undefined,
            activeWorkflow: undefined,
            shouldBeGenerating: false,
            lastUserStopAt: stoppedAt,
        } as AgentState);

        if (activeWorkflow?.id) {
            await this.releaseUserTaskSlot(activeWorkflow.id);
        }
        if (!this.state.sandboxInstanceId) {
            await this.releaseGlobalSandboxCapacity();
        }
        await this.updateAppStatus('completed', reason);

        let workflowTerminated = false;
        let status: string | undefined;
        const workflow = this.getWorkflowBinding();
        if (activeWorkflow?.id && workflow) {
            try {
                const instance = await workflow.get(activeWorkflow.id);
                try {
                    status = (await instance.status()).status;
                } catch (statusError) {
                    this.logger().warn('Unable to fetch workflow status before terminate', {
                        workflowId: activeWorkflow.id,
                        error: statusError instanceof Error ? statusError.message : String(statusError),
                    });
                }

                if (!isWorkflowTerminalStatus(status)) {
                    await instance.terminate();
                    workflowTerminated = true;
                }
            } catch (error) {
                this.logger().warn('Failed to terminate active workflow after stop intent was recorded', {
                    reason,
                    workflowId: activeWorkflow.id,
                    kind: activeWorkflow.kind,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        } else if (activeWorkflow?.id && !workflow) {
            this.logger().warn('Workflow binding missing while stopping generation', {
                reason,
                activeWorkflow,
            });
        }

        this.logger().info('User stop generation handled', {
            reason,
            workflowId: activeWorkflow?.id,
            kind: activeWorkflow?.kind,
            previousStatus: status,
            workflowTerminated,
            taskStopped: hadActiveTask,
        });

        return { workflowTerminated, taskStopped: hadActiveTask };
    }

    async deleteProject(reason = 'app_deleted'): Promise<{ workflowTerminated: boolean; taskStopped: boolean }> {
        const [workflowResult, taskResult] = await Promise.allSettled([
            this.stopActiveWorkflow(reason),
            this.stopCurrentTask(),
        ]);

        const [previewResult, capacityResult] = await Promise.allSettled([
            this.releasePreviewSandbox(reason),
            this.releaseGlobalSandboxCapacity(),
        ]);

        const workflowTerminated = workflowResult.status === 'fulfilled' ? workflowResult.value : false;
        const taskStopped = taskResult.status === 'fulfilled' ? taskResult.value : false;
        const now = Date.now();

        this.setState({
            ...this.state,
            activeAppTask: undefined,
            activeWorkflow: undefined,
            shouldBeGenerating: false,
            lastUserStopAt: now,
            deletedAt: now,
        } as AgentState);

        this.broadcast(WebSocketMessageResponses.GENERATION_STOPPED, {
            message: 'Project deleted; running task stopped',
        });
        this.broadcast(WebSocketMessageResponses.SERVER_LOG, {
            message: 'Project deleted; agent task state cleared',
            level: 'info',
            timestamp: now,
            source: 'workflow',
        });

        if (workflowResult.status === 'rejected') {
            this.logger().warn('Failed to terminate workflow during project deletion', {
                reason,
                error: workflowResult.reason instanceof Error ? workflowResult.reason.message : String(workflowResult.reason),
            });
        }
        if (taskResult.status === 'rejected') {
            this.logger().warn('Failed to stop active task during project deletion', {
                reason,
                error: taskResult.reason instanceof Error ? taskResult.reason.message : String(taskResult.reason),
            });
        }
        if (previewResult.status === 'rejected') {
            this.logger().warn('Failed to release preview sandbox during project deletion', {
                reason,
                error: previewResult.reason instanceof Error ? previewResult.reason.message : String(previewResult.reason),
            });
        }
        if (capacityResult.status === 'rejected') {
            this.logger().warn('Failed to release sandbox capacity during project deletion', {
                reason,
                error: capacityResult.reason instanceof Error ? capacityResult.reason.message : String(capacityResult.reason),
            });
        }

        return { workflowTerminated, taskStopped };
    }

    async prepareWorkflowProject(args: {
        agentId: string;
        userId: string;
        query: string;
        hostname: string;
        projectType: ProjectType;
        playableAspectRatio?: ReturnType<typeof normalizePlayableAspectRatio>;
        workflowId?: string;
        workflowKind?: ActiveWorkflowTask['kind'];
        language?: string;
        frameworks?: string[];
        selectedTemplate?: string;
        requestedProjectType?: ProjectType | 'auto';
        images?: ProcessedImageAttachment[];
    }): Promise<void> {
        this.throwIfDeleted('prepare workflow project');
        const sessionId = DeploymentManager.generateNewSessionId();
        const playableAspectRatio = normalizePlayableAspectRatio(args.playableAspectRatio);
        this.initLogger(args.agentId, args.userId, sessionId);
        this.setState({
            ...this.state,
            behaviorType: LEGACY_STATE_BEHAVIOR_TYPE,
            projectType: args.projectType,
            projectName: '',
            query: args.query,
            playableAspectRatio,
            sessionId,
            hostname: args.hostname,
            metadata: {
                agentId: args.agentId,
                userId: args.userId,
            } as InferenceMetadata,
            shouldBeGenerating: true,
            lastUserStopAt: undefined,
            lastFailedWorkflow: undefined,
            lastRetryableWorkflow: args.workflowId && args.workflowKind && isRetryableWorkflowKind(args.workflowKind) ? {
                workflowId: args.workflowId,
                kind: args.workflowKind,
                query: args.query,
                hostname: args.hostname,
                language: args.language,
                frameworks: args.frameworks,
                selectedTemplate: args.selectedTemplate,
                requestedProjectType: args.requestedProjectType,
                playableAspectRatio,
                images: args.images,
            } : this.state.lastRetryableWorkflow,
            activeWorkflow: args.workflowId && args.workflowKind ? {
                id: args.workflowId,
                kind: args.workflowKind,
                status: 'queued',
                message: 'Create project workflow queued',
                startedAt: Date.now(),
                updatedAt: Date.now(),
            } : this.state.activeWorkflow,
        } as AgentState);
        await this.updateAppStatus('generating', 'workflow_project_prepared');
    }

    async initializeFromWorkflow(initArgs: WorkflowInitArgs): Promise<AgentState> {
        this.throwIfDeleted('initialize project from workflow');
        if (this.state.templateName && Object.keys(this.state.blueprint ?? {}).length > 0) {
            this.logger().info('Workflow initialization skipped; agent already has a blueprint');
            return this.state;
        }

        const templateDetails = initArgs.templateInfo?.templateDetails ?? null;
        if (templateDetails) {
            this.broadcast(WebSocketMessageResponses.TEMPLATE_UPDATED, {
                templateDetails,
            });
        }

        return this.initialize({
            ...initArgs,
            onBlueprintChunk: (chunk: string) => {
                this.broadcast(WebSocketMessageResponses.BLUEPRINT_CHUNK, { chunk });
            },
        } as AgentInitArgs<AgentState>);
    }

    async runGenerationFromWorkflow(
        reason: ExistingProjectWorkflowParams['kind'] | 'create_project' | 'user_input',
        workflowId?: string,
        recoveryWorkflowId?: string,
    ): Promise<void> {
        this.throwIfDeleted('run generation workflow');
        const query = reason === 'create_project'
            ? this.state.query
            : this.buildCodexWorkflowQuery(reason);
        await this.runCodexGenerationFromWorkflow(workflowId, query, reason, {
            recoveryWorkflowId,
            uploadedAssets: reason === 'create_project'
                ? this.state.lastRetryableWorkflow?.images
                : undefined,
        });
    }

    async runCodexGenerationFromWorkflow(
        workflowId: string | undefined,
        query: string,
        kind: ActiveWorkflowTask['kind'] = 'create_project',
        options: { recoveryWorkflowId?: string; uploadedAssets?: ProcessedImageAttachment[] } = {},
    ): Promise<void> {
        this.throwIfDeleted('run generation workflow');
        const effectiveWorkflowId = workflowId || this.createWorkflowId(kind);
        const existingRetryableWorkflow = this.state.lastRetryableWorkflow;
        const retryableWorkflow = isRetryableWorkflowKind(kind)
            ? this.normalizeRetryableWorkflowIntent(
                existingRetryableWorkflow?.workflowId === effectiveWorkflowId && existingRetryableWorkflow.kind === kind
                    ? {
                        ...existingRetryableWorkflow,
                        query,
                        recoveryWorkflowId: options.recoveryWorkflowId ?? existingRetryableWorkflow.recoveryWorkflowId,
                        playableAspectRatio: existingRetryableWorkflow.playableAspectRatio,
                    }
                    : {
                        workflowId: effectiveWorkflowId,
                        recoveryWorkflowId: options.recoveryWorkflowId,
                        kind,
                        query,
                        hostname: this.state.hostname,
                        requestedProjectType: this.state.projectType,
                        playableAspectRatio: this.state.playableAspectRatio,
                    },
            )
            : this.state.lastRetryableWorkflow;
        this.setState({
            ...this.state,
            shouldBeGenerating: true,
            lastUserStopAt: undefined,
            lastFailedWorkflow: undefined,
            lastRetryableWorkflow: retryableWorkflow,
        });
        this.logger().info('Background workflow generation started', { workflowId, kind });
        if (workflowId) {
            await this.updateWorkflowStatus({
                workflowId,
                kind,
                status: 'running',
                message: 'Preparing the workspace',
            });
        }
        await this.updateAppStatus('generating', `workflow_${kind}_generation_started`);

        const responseConversationId = this.workflowConversationId(effectiveWorkflowId, 'complete');
        const result = await this.codexGenerationManager.run({
            workflowId: effectiveWorkflowId,
            kind,
            query,
            recoveryWorkflowId: options.recoveryWorkflowId,
            uploadedAssets: options.uploadedAssets,
            onExecutionStarted: async () => {
                await this.updateWorkflowStatus({
                    workflowId: effectiveWorkflowId,
                    kind,
                    status: 'running',
                    message: 'Making it playable',
                });
                this.broadcast(WebSocketMessageResponses.GENERATION_STARTED, {
                    message: kind === 'user_input'
                        ? 'Updating the playable project'
                        : 'Creating the playable project',
                    totalFiles: 1,
                    workflowKind: kind,
                });
            },
        });
        if (!result.madePlayableChanges && kind === 'create_project') {
            const errorMessage = result.noChangeReason
                ? `The project agent could not finish creating the playable version this time. ${result.noChangeReason}`
                : 'The project agent could not finish creating the playable version this time. No project changes were applied.';
            this.logger().warn('Create project workflow completed with no project changes', {
                workflowId: effectiveWorkflowId,
                kind,
                noChangeReason: result.noChangeReason,
            });
            if (!this.getWorkflowBinding()) {
                await this.updateWorkflowStatus({
                    workflowId: effectiveWorkflowId,
                    kind,
                    status: 'failed',
                    message: errorMessage,
                });
            }
            throw new Error(errorMessage);
        }
        const totalPlayableChangedFiles = result.playableChangedFiles.length;
        const assistantMessage = this.buildGenerationCompleteMessage(kind, totalPlayableChangedFiles);

        this.setState({
            ...this.state,
            shouldBeGenerating: false,
            lastUserStopAt: undefined,
            lastFailedWorkflow: undefined,
            lastRetryableWorkflow: undefined,
            lastPostValidationFailure: undefined,
            ...(result.madePlayableChanges ? {
                mvpGenerated: true,
                lastPlayableDeploymentRevision: this.state.generatedFilesRevision ?? 0,
                lastPlayableDeploymentAt: Date.now(),
                lastPlayableDeploymentId: result.preview?.runId ?? this.state.sandboxInstanceId,
                lastPlayableDeploymentUrl: result.preview?.previewURL,
            } : {}),
        } as AgentState);

        this.recordWorkflowAssistantMessage(
            effectiveWorkflowId,
            'complete',
            assistantMessage,
        );
        this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
            message: assistantMessage,
            conversationId: responseConversationId,
            isStreaming: false,
        });

        if (result.madeChanges && result.preview?.previewURL) {
            await this.markCurrentPreviewActive();
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, {
                message: 'Deployment completed',
                instanceId: result.preview.runId ?? this.state.sandboxInstanceId ?? this.state.sessionId,
                previewURL: result.preview.previewURL,
                tunnelURL: result.preview.tunnelURL ?? '',
            });
        }
        if (result.madePlayableChanges) {
            this.broadcast(WebSocketMessageResponses.GENERATION_COMPLETE, {
                message: `Project update completed with ${totalPlayableChangedFiles} playable file changes.`,
                instanceId: this.state.sessionId,
                previewURL: result.preview?.previewURL,
            });
        }
        if (workflowId) {
            await this.updateWorkflowStatus({
                workflowId,
                kind,
                status: 'completed',
                message: `Workflow ${kind} completed`,
            });
        }
        if (result.madeChanges && result.preview?.previewURL) {
            await this.scheduleOfflinePreviewRelease(`workflow_${kind}_completed_offline`);
        }
    }

    async startGenerationWorkflow(kind: ExistingProjectWorkflowParams['kind'], retryFrom?: LastFailedWorkflow): Promise<string | null> {
        this.throwIfDeleted('start generation workflow');
        if (this.isCodeGenerating() || this.state.shouldBeGenerating || this.state.activeWorkflow) {
            this.logger().info('Generation workflow already active or queued, skipping duplicate', {
                kind,
                isCodeGenerating: this.isCodeGenerating(),
                shouldBeGenerating: this.state.shouldBeGenerating,
                activeWorkflow: this.state.activeWorkflow,
            });
            return null;
        }

        const workflowId = this.createWorkflowId(kind);
        await this.acquireUserTaskSlot(workflowId, kind);
        const retryableWorkflow = this.normalizeRetryableWorkflowIntent({
            ...retryFrom,
            workflowId,
            recoveryWorkflowId: retryFrom?.workflowId ?? retryFrom?.recoveryWorkflowId,
            kind,
            query: retryFrom?.query ?? this.buildCodexWorkflowQuery(kind),
            hostname: this.state.hostname,
            requestedProjectType: this.state.projectType,
            playableAspectRatio: retryFrom?.playableAspectRatio ?? this.state.playableAspectRatio,
        });

        const workflow = this.getWorkflowBinding();
        if (!workflow) {
            this.logger().warn('Workflow binding missing; falling back to waitUntil generation', { kind });
            const task = this.runGenerationFromWorkflow(kind, workflowId, retryableWorkflow.recoveryWorkflowId)
                .finally(() => this.releaseUserTaskSlot(workflowId));
            this.trackBackgroundTask(kind, task);
            return null;
        }

        this.setState({
            ...this.state,
            shouldBeGenerating: true,
            lastUserStopAt: undefined,
            lastFailedWorkflow: undefined,
            lastRetryableWorkflow: retryableWorkflow,
            activeWorkflow: {
                id: workflowId,
                kind,
                status: 'queued',
                message: `Queued ${kind} workflow`,
                startedAt: Date.now(),
                updatedAt: Date.now(),
            },
        });
        await this.updateAppStatus('generating', `workflow_${kind}_queued`);

        try {
            await workflow.create({
                id: workflowId,
                params: {
                    kind,
                    agentId: this.getAgentId(),
                    projectType: this.state.projectType,
                    recoveryWorkflowId: retryableWorkflow.recoveryWorkflowId,
                },
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const failedWorkflow: LastFailedWorkflow = {
                ...retryableWorkflow,
                error: errorMessage,
                failedAt: Date.now(),
            };
            const failureMessage = this.buildGenerationFailureMessage(errorMessage);
            this.setState({
                ...this.state,
                shouldBeGenerating: false,
                activeWorkflow: undefined,
                lastFailedWorkflow: failedWorkflow,
            } as AgentState);
            await this.releaseUserTaskSlot(workflowId);
            await this.updateAppStatus('completed', `workflow_${kind}_queue_failed`);
            this.recordWorkflowAssistantMessage(workflowId, 'failed', failureMessage);
            this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                message: failureMessage,
                conversationId: this.workflowConversationId(workflowId, 'failed'),
                isStreaming: false,
                action: {
                    type: 'retry_last_failed_workflow',
                    label: 'Retry',
                },
            });
            throw error;
        }
        this.logger().info('Generation workflow queued', { kind, workflowId });
        this.broadcast(WebSocketMessageResponses.SERVER_LOG, {
            message: `Queued ${kind} workflow`,
            level: 'info',
            timestamp: Date.now(),
            source: 'workflow',
            workflowKind: kind,
        });
        return workflowId;
    }

    async startUserInputWorkflow(
        userMessage: string,
        images?: Array<ImageAttachment | ProcessedImageAttachment>,
        options: { skipUserMessageRecord?: boolean; recoveryWorkflowId?: string } = {},
    ): Promise<string | null> {
        this.throwIfDeleted('start user input workflow');
        if (this.state.activeWorkflow) {
            this.logger().info('Workflow already active, skipping user input workflow', {
                activeWorkflow: this.state.activeWorkflow,
            });
            return null;
        }

        if (!this.hasCompletedPlayable()) {
            return this.startIncompleteProjectCreateWorkflowFromUserInput(userMessage, images, options);
        }

        const workflowId = this.createWorkflowId('user_input');
        await this.acquireUserTaskSlot(workflowId, 'user_input');
        const retryableWorkflow = this.normalizeRetryableWorkflowIntent({
            workflowId,
            recoveryWorkflowId: options.recoveryWorkflowId,
            kind: 'user_input',
            query: userMessage,
            hostname: this.state.hostname,
            requestedProjectType: this.state.projectType,
        });

        const workflow = this.getWorkflowBinding();
        if (!workflow) {
            this.logger().warn('Workflow binding missing; falling back to direct user input handling');
            const task = this.runUserInputFromWorkflow(userMessage, images, workflowId, {
                skipUserMessageRecord: options.skipUserMessageRecord,
                recoveryWorkflowId: retryableWorkflow.recoveryWorkflowId,
            })
                .finally(() => this.releaseUserTaskSlot(workflowId));
            this.trackBackgroundTask('user_input', task);
            return null;
        }

        this.setState({
            ...this.state,
            shouldBeGenerating: true,
            lastUserStopAt: undefined,
            lastFailedWorkflow: undefined,
            lastRetryableWorkflow: retryableWorkflow,
            activeWorkflow: {
                id: workflowId,
                kind: 'user_input',
                status: 'queued',
                message: 'Queued user input workflow',
                startedAt: Date.now(),
                updatedAt: Date.now(),
            },
        });
        await this.updateAppStatus('generating', 'workflow_user_input_queued');
        this.broadcast(WebSocketMessageResponses.USER_SUGGESTIONS_PROCESSING, {
            message: 'Processing user message',
            status: 'start',
        });

        try {
            if (!options.skipUserMessageRecord) {
                this.recordWorkflowUserMessage(workflowId, userMessage);
            }
            const workflowImages = await this.normalizeWorkflowAttachments(images);
            if (!options.skipUserMessageRecord && workflowImages && workflowImages.length > 0) {
                this.recordWorkflowUserMessage(workflowId, userMessage, workflowImages);
            }
            this.setState({
                ...this.state,
                lastRetryableWorkflow: this.normalizeRetryableWorkflowIntent({
                    ...retryableWorkflow,
                    images: workflowImages,
                }),
            } as AgentState);
            const params: UserInputWorkflowParams = {
                kind: 'user_input',
                agentId: this.getAgentId(),
                projectType: this.state.projectType,
                message: userMessage,
                images: workflowImages,
                recoveryWorkflowId: retryableWorkflow.recoveryWorkflowId,
            };
            await workflow.create({ id: workflowId, params });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const failedWorkflow: LastFailedWorkflow = {
                ...(this.state.lastRetryableWorkflow ?? retryableWorkflow),
                error: errorMessage,
                failedAt: Date.now(),
            };
            const failureMessage = this.buildGenerationFailureMessage(errorMessage);
            this.setState({
                ...this.state,
                shouldBeGenerating: false,
                activeWorkflow: undefined,
                lastFailedWorkflow: failedWorkflow,
            } as AgentState);
            await this.releaseUserTaskSlot(workflowId);
            await this.updateAppStatus('completed', 'workflow_user_input_queue_failed');
            this.recordWorkflowAssistantMessage(
                workflowId,
                'failed',
                failureMessage,
            );
            this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                message: failureMessage,
                conversationId: this.workflowConversationId(workflowId, 'failed'),
                isStreaming: false,
                action: {
                    type: 'retry_last_failed_workflow',
                    label: 'Retry',
                },
            });
            throw error;
        }
        this.logger().info('User input workflow queued', { workflowId });
        return workflowId;
    }

    private async startIncompleteProjectCreateWorkflowFromUserInput(
        userMessage: string,
        images?: Array<ImageAttachment | ProcessedImageAttachment>,
        options: { skipUserMessageRecord?: boolean; recoveryWorkflowId?: string } = {},
    ): Promise<string | null> {
        const workflowImages = await this.normalizeWorkflowAttachments(images);
        const previousIntent = this.state.lastRetryableWorkflow;
        const baseQuery = previousIntent?.kind === 'create_project' && previousIntent.query
            ? previousIntent.query
            : this.state.query;
        const latestMessage = userMessage.trim();
        const query = latestMessage
            ? `${baseQuery || 'Create the playable project.'}\n\nLatest user message after stopping the initial build:\n${latestMessage}`
            : baseQuery || 'Create the playable project from the provided attachments.';
        const intent = this.normalizeRetryableWorkflowIntent({
            workflowId: previousIntent?.kind === 'create_project' ? previousIntent.workflowId : undefined,
            recoveryWorkflowId: options.recoveryWorkflowId
                ?? (previousIntent?.kind === 'create_project'
                    ? previousIntent.workflowId ?? previousIntent.recoveryWorkflowId
                    : undefined),
            kind: 'create_project',
            query,
            hostname: previousIntent?.hostname || this.state.hostname,
            language: previousIntent?.language || 'typescript',
            frameworks: previousIntent?.frameworks,
            selectedTemplate: previousIntent?.selectedTemplate,
            requestedProjectType: previousIntent?.requestedProjectType || this.state.projectType,
            playableAspectRatio: previousIntent?.playableAspectRatio ?? this.state.playableAspectRatio,
            images: workflowImages && workflowImages.length > 0
                ? workflowImages
                : previousIntent?.kind === 'create_project'
                    ? previousIntent.images
                    : undefined,
        });

        this.logger().info('Routing user input to create_project because no playable has completed yet', {
            hasImages: Boolean(intent.images?.length),
            previousWorkflowId: intent.recoveryWorkflowId,
        });

        if (!options.skipUserMessageRecord) {
            this.recordWorkflowUserMessage(undefined, userMessage, workflowImages);
        }

        return this.startCreateProjectRetryWorkflow({
            ...intent,
            failedAt: Date.now(),
        });
    }

    private async startCreateProjectRetryWorkflow(intent: LastFailedWorkflow): Promise<string | null> {
        const workflowId = this.createWorkflowId('create_project');
        await this.acquireUserTaskSlot(workflowId, 'create_project');

        const workflow = this.getWorkflowBinding();
        if (!workflow) {
            await this.releaseUserTaskSlot(workflowId);
            throw new Error('The project agent cannot retry because the background workflow is not configured. Please restart the local dev server with workflow support enabled.');
        }

        const { abortSignal: _abortSignal, ...inferenceContext } = this.getInferenceContext();
        const retryableWorkflow = this.normalizeRetryableWorkflowIntent({
            ...intent,
            workflowId,
            recoveryWorkflowId: intent.workflowId ?? intent.recoveryWorkflowId,
            kind: 'create_project',
            query: intent.query || this.state.query,
            hostname: intent.hostname || this.state.hostname,
            language: intent.language || 'typescript',
            requestedProjectType: intent.requestedProjectType || this.state.projectType,
            playableAspectRatio: intent.playableAspectRatio ?? this.state.playableAspectRatio,
        });
        const params: CreateProjectWorkflowParams = {
            kind: 'create_project',
            agentId: this.getAgentId(),
            projectType: this.state.projectType,
            requestedProjectType: retryableWorkflow.requestedProjectType || this.state.projectType,
            query: retryableWorkflow.query,
            language: retryableWorkflow.language,
            frameworks: retryableWorkflow.frameworks,
            playableAspectRatio: retryableWorkflow.playableAspectRatio,
            hostname: retryableWorkflow.hostname || this.state.hostname,
            inferenceContext,
            images: retryableWorkflow.images,
            selectedTemplate: retryableWorkflow.selectedTemplate,
            recoveryWorkflowId: retryableWorkflow.recoveryWorkflowId,
        };

        this.setState({
            ...this.state,
            shouldBeGenerating: true,
            lastUserStopAt: undefined,
            lastFailedWorkflow: undefined,
            lastRetryableWorkflow: retryableWorkflow,
            activeWorkflow: {
                id: workflowId,
                kind: 'create_project',
                status: 'queued',
                message: 'Queued project retry workflow',
                startedAt: Date.now(),
                updatedAt: Date.now(),
            },
        } as AgentState);
        await this.updateAppStatus('generating', 'workflow_create_project_retry_queued');

        try {
            await workflow.create({ id: workflowId, params });
        } catch (error) {
            this.setState({
                ...this.state,
                shouldBeGenerating: false,
                activeWorkflow: undefined,
                lastFailedWorkflow: intent,
            } as AgentState);
            await this.releaseUserTaskSlot(workflowId);
            await this.updateAppStatus('completed', 'workflow_create_project_retry_queue_failed');
            throw error;
        }

        this.logger().info('Create project retry workflow queued', { workflowId });
        this.broadcast(WebSocketMessageResponses.SERVER_LOG, {
            message: 'Queued project retry workflow',
            level: 'info',
            timestamp: Date.now(),
            source: 'workflow',
            workflowKind: 'create_project',
        });
        return workflowId;
    }

    async retryLastFailedWorkflow(): Promise<string | null> {
        this.throwIfDeleted('retry last failed workflow');
        const failed = this.state.lastFailedWorkflow;
        if (!failed) {
            throw new Error('There is no failed project task to retry.');
        }
        if (this.isBusyForOperationalWorkflow()) {
            throw new Error('A task is still running. Please wait for it to finish before retrying.');
        }

        this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
            message: 'Retrying the last project task...',
            conversationId: `retry-${Date.now()}`,
            isStreaming: false,
        });

        if (failed.kind === 'user_input') {
            return this.startUserInputWorkflow(failed.query, failed.images, {
                skipUserMessageRecord: true,
                recoveryWorkflowId: failed.workflowId ?? failed.recoveryWorkflowId,
            });
        }
        if (failed.kind === 'create_project') {
            return this.startCreateProjectRetryWorkflow(failed);
        }
        return this.startGenerationWorkflow(failed.kind, failed);
    }

    private isBusyForOperationalWorkflow(): boolean {
        const activeWorkflow = this.state.activeWorkflow;
        const workflowUpdatedAt = activeWorkflow?.updatedAt ?? activeWorkflow?.startedAt;
        const hasBlockingWorkflow = Boolean(
            activeWorkflow &&
            activeWorkflow.status !== 'failed' &&
            typeof workflowUpdatedAt === 'number' &&
            Date.now() - workflowUpdatedAt < ACTIVE_WORKFLOW_STALE_MS
        );

        return Boolean(
            hasBlockingWorkflow ||
            this.state.shouldBeGenerating ||
            this.isCodeGenerating() ||
            this.isConversationProcessing() ||
            this.isDeepDebugging()
        );
    }

    private broadcastOperationalWorkflowStartFailure(kind: DeployProjectWorkflowParams['kind'] | DeployPreviewWorkflowParams['kind'], error: string): void {
        if (kind === 'deploy_project') {
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                message: 'Playable update could not start',
                instanceId: this.state.sandboxInstanceId ?? this.state.sessionId ?? '',
                error,
            });
            return;
        }

        this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, { error });
    }

    private async queueOperationalWorkflow(
        params: DeployProjectWorkflowParams | DeployPreviewWorkflowParams,
        queuedMessage: string,
    ): Promise<string | null> {
        this.throwIfDeleted(`queue ${params.kind} workflow`);
        if (this.isBusyForOperationalWorkflow()) {
            const message = 'Another task is still running. Please wait for it to finish before starting this one.';
            this.logger().info('Operational workflow skipped because agent is busy', {
                kind: params.kind,
                activeWorkflow: this.state.activeWorkflow,
                shouldBeGenerating: this.state.shouldBeGenerating,
            });
            this.broadcastOperationalWorkflowStartFailure(params.kind, message);
            this.broadcast(WebSocketMessageResponses.ERROR, { error: message });
            return null;
        }

        const workflowId = this.createWorkflowId(params.kind);
        try {
            await this.acquireUserTaskSlot(workflowId, params.kind);
        } catch (error) {
            if (error instanceof UserTaskConcurrencyLimitError) {
                this.logger().info('Operational workflow skipped because user task limit is reached', {
                    kind: params.kind,
                    activeCount: error.result.activeCount,
                    limit: error.result.limit,
                });
                this.broadcastOperationalWorkflowStartFailure(params.kind, error.message);
                this.broadcast(WebSocketMessageResponses.ERROR, { error: error.message });
                return null;
            }
            throw error;
        }

        const workflow = this.getWorkflowBinding();
        if (!workflow) {
            this.logger().warn('Workflow binding missing; falling back to direct operational task', { kind: params.kind });
            const task = params.kind === 'deploy_project'
                ? this.deployProject(params.options)
                : this.deployPreview(params.clearLogs ?? true, params.forceRedeploy ?? false);
            this.trackBackgroundTask(params.kind, task.finally(() => this.releaseUserTaskSlot(workflowId)));
            return null;
        }

        this.setState({
            ...this.state,
            lastUserStopAt: undefined,
            activeWorkflow: {
                id: workflowId,
                kind: params.kind,
                status: 'queued',
                message: queuedMessage,
                startedAt: Date.now(),
                updatedAt: Date.now(),
            },
        });
        await this.updateAppStatus('generating', `workflow_${params.kind}_queued`);

        try {
            await workflow.create({ id: workflowId, params });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.setState({ ...this.state, activeWorkflow: undefined });
            await this.releaseUserTaskSlot(workflowId);
            await this.updateAppStatus('completed', `workflow_${params.kind}_queue_failed`);
            this.broadcastOperationalWorkflowStartFailure(params.kind, message);
            throw error;
        }

        this.logger().info('Operational workflow queued', { kind: params.kind, workflowId });
        this.broadcast(WebSocketMessageResponses.SERVER_LOG, {
            message: queuedMessage,
            level: 'info',
            timestamp: Date.now(),
            source: 'workflow',
            workflowKind: params.kind,
        });
        return workflowId;
    }

    async startDeployProjectWorkflow(options?: DeployOptions): Promise<string | null> {
        return this.queueOperationalWorkflow(
            {
                kind: 'deploy_project',
                agentId: this.getAgentId(),
                projectType: this.state.projectType,
                options,
            },
            'Queued playable update workflow',
        );
    }

    async startDeployPreviewWorkflow(clearLogs = true, forceRedeploy = false): Promise<string | null> {
        this.throwIfDeleted('start preview deployment');
        if (this.isBusyForOperationalWorkflow()) {
            const message = 'Another task is still running. Please wait for it to finish before starting this one.';
            this.logger().info('Preview deployment skipped because agent is busy', {
                activeWorkflow: this.state.activeWorkflow,
                shouldBeGenerating: this.state.shouldBeGenerating,
            });
            this.broadcastOperationalWorkflowStartFailure('deploy_preview', message);
            this.broadcast(WebSocketMessageResponses.ERROR, { error: message });
            return null;
        }

        const task = this.deployPreview(clearLogs, forceRedeploy, {
            capacityMode: 'foreground',
            shouldContinueWaiting: () => this.getWebSockets().length > 0,
            onCapacityWaiting: (position) => this.reportPreviewCapacityWaiting(position),
        }).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger().warn('Foreground preview deployment failed', { error: message });
            this.broadcast(WebSocketMessageResponses.DEPLOYMENT_FAILED, { error: message });
            return '';
        });
        this.trackBackgroundTask('deploy_preview', task);
        return null;
    }

    trackBackgroundTask(label: string, task: Promise<unknown>): void {
        this.ctx.waitUntil(
            task.catch((error: unknown) => {
                this.logger().error(`Background task failed: ${label}`, error);
            })
        );
    }

    private async generateProjectCover(): Promise<void> {
        if (this.isDeleted()) {
            this.logger().info('Skipping cover generation for deleted project');
            return;
        }

        if (this.state.projectType !== 'app') {
            this.logger().info('Skipping cover generation for non-app project', {
                projectType: this.state.projectType,
            });
            return;
        }

        const blueprint = this.state.blueprint as PhasicBlueprint | undefined;
        if (!blueprint?.title) {
            this.logger().warn('Skipping cover generation: no blueprint title');
            return;
        }

        try {
            this.logger().info('Generating project cover image');
            const result = await generateCoverImage(this.env, blueprint);
            const agentId = this.getAgentId();
            const coverExtension = getCoverExtension(result.contentType);
            const r2Key = `screenshots/${agentId}/latest.${coverExtension}`;

            await this.env.TEMPLATES_BUCKET.put(r2Key, result.imageBytes, {
                httpMetadata: { contentType: result.contentType },
            });

            const screenshotUrl = `/api/${r2Key}`;
            const appService = new AppService(this.env);
            const updated = await appService.updateApp(agentId, {
                screenshotUrl,
                screenshotCapturedAt: new Date(),
            });

            if (!updated) {
                this.logger().warn('Generated project cover but failed to update app record', {
                    agentId,
                    screenshotUrl,
                });
                return;
            }

            this.broadcast(WebSocketMessageResponses.APP_COVER_UPDATED, {
                agentId,
                screenshotUrl,
            });
            this.logger().info('Project cover image generated and stored', {
                r2Key,
                contentType: result.contentType,
            });
        } catch (error) {
            this.logger().warn('Cover generation failed; continuing without generated cover', {
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    handleVaultUnlocked(): void {
        this.secretsClient?.notifyUnlocked();
        this.logger().info('Vault unlocked notification received', {});
    }

    handleVaultLocked(): void {
        this.secretsClient?.notifyUnlockFailed('Vault locked');
        this.secretsClient = null;
        this.logger().info('Vault locked', {});
    }

    private getSecretsClient(): SecretsClient {
        if (!this.secretsClient) {
            const userId = this.state.metadata.userId;
            const stub = this.env.UserSecretsStore.get(
                this.env.UserSecretsStore.idFromName(userId)
            ) as unknown as UserSecretsStoreStub;

            this.secretsClient = new SecretsClient(stub, (type, data) => {
                if (type === 'vault_required') {
                    const vaultData = data as { reason: string; provider?: string; envVarName?: string; secretId?: string };
                    broadcastToConnections(this, 'vault_required', vaultData);
                }
            });
        }

        return this.secretsClient;
    }

    async getDecryptedSecret(query: { provider?: string; envVarName?: string; secretId?: string }): Promise<string | null> {
        try {
            return await this.getSecretsClient().get(query);
        } catch (error) {
            this.logger().info('Secret request failed', { query, error: String(error) });
            return null;
        }
    }

    /**
     * Get the project objective (defines what is being built)
     */
    getObjective(): ProjectObjective<BaseProjectState> {
        return this.objective;
    }

    isCodeGenerating(): boolean {
        const workflow = this.state.activeWorkflow;
        return Boolean(
            this.state.shouldBeGenerating &&
            !this.state.lastUserStopAt &&
            workflow?.status !== 'failed',
        );
    }

    isConversationProcessing(): boolean {
        return this.state.activeWorkflow?.kind === 'user_input' && this.isCodeGenerating();
    }

    isDeepDebugging(): boolean {
        return false;
    }

    getDeepDebugSessionState(): { conversationId: string } | null {
        return null;
    }

    hasActivePersistedAppTask(): boolean {
        const activeTask = this.state.activeAppTask;
        if (!activeTask) return false;
        return Date.now() - activeTask.startedAt < ACTIVE_WORKFLOW_STALE_MS;
    }

    async stopCurrentTask(): Promise<boolean> {
        const hadActiveTask = Boolean(
            this.state.activeAppTask ||
            this.state.activeWorkflow ||
            this.state.shouldBeGenerating,
        );
        this.setState({
            ...this.state,
            activeAppTask: undefined,
            activeWorkflow: undefined,
            shouldBeGenerating: false,
            lastUserStopAt: Date.now(),
        } as AgentState);
        await this.updateAppStatus('completed', 'user_stopped_task');
        return hadActiveTask;
    }

    getModelConfigsInfo() {
        const modelService = new ModelConfigService(this.env);
        return modelService.getModelConfigsInfo(this.state.metadata.userId);
    }

    async syncUploadedAssets(uploaded: ProcessedImageAttachment[]): Promise<void> {
        this.throwIfDeleted('sync uploaded assets');
        if (uploaded.length === 0) return;

        await this.syncProjectAssetMapFromR2();

        const agentId = this.getAgentId();
        const prefix = `assets/${agentId}/`;
        const descriptions: Record<string, string> = {};
        const fallbackDescription = (att: ProcessedImageAttachment, rel: string): string => {
            const filename = att.filename || rel.split('/').pop() || rel;
            const kind = att.mimeType.split('/')[0] || 'media';
            return `User-uploaded ${kind} asset "${filename}" (${att.mimeType}).`;
        };

        for (const att of uploaded) {
            if (!att.r2Key.startsWith(prefix)) continue;
            const rel = att.r2Key.slice(prefix.length);
            const providedDescription = typeof att.description === 'string' ? att.description.trim() : '';
            if (providedDescription) {
                descriptions[rel] = providedDescription;
                continue;
            }
            if (att.mimeType.startsWith('image/')) continue;
            descriptions[rel] = fallbackDescription(att, rel);
        }

        if (Object.keys(descriptions).length > 0) {
            await this.mergeAssetMapDescriptions(descriptions);
        }
    }

    async getFullState(): Promise<AgentState> {
        return this.state;
    }

    async getSummary(): Promise<AgentSummary> {
        return {
            query: this.state.query,
            generatedCode: this.fileManager.getGeneratedFiles(),
        };
    }

    async getDesiredAppStatus(): Promise<'generating' | 'completed'> {
        if (this.state.lastUserStopAt) {
            return 'completed';
        }

        const workflowUpdatedAt = this.state.activeWorkflow?.updatedAt ?? this.state.activeWorkflow?.startedAt;
        const hasFreshActiveWorkflow = Boolean(
            this.state.activeWorkflow &&
            this.state.activeWorkflow.status !== 'failed' &&
            typeof workflowUpdatedAt === 'number' &&
            Date.now() - workflowUpdatedAt < ACTIVE_WORKFLOW_STALE_MS
        );
        const hasGeneratedFiles = Object.keys(this.state.generatedFilesMap ?? {}).length > 0;
        const hasCompletedPlayable = this.state.mvpGenerated && hasGeneratedFiles && this.state.pendingUserInputs.length === 0;
        const hasQueuedGenerationIntent = this.state.shouldBeGenerating && !hasCompletedPlayable;

        if (
            this.isCodeGenerating() ||
            this.isDeepDebugging() ||
            this.isConversationProcessing() ||
            this.hasActivePersistedAppTask() ||
            hasFreshActiveWorkflow ||
            hasQueuedGenerationIntent
        ) {
            return 'generating';
        }

        return 'completed';
    }

    async getPreviewUrlCache(): Promise<string> {
        try {
            await this.ensureTemplateDetails();
            if (this.getTemplateDetails().renderMode === 'browser') {
                return this.getBrowserPreviewURL();
            }
        } catch (error) {
            this.logger().warn('Unable to resolve preview URL cache', error);
        }

        return '';
    }

    async releasePreviewSandbox(reason: string = 'preview released'): Promise<boolean> {
        if (this.isCodeGenerating() || this.state.shouldBeGenerating || this.state.activeWorkflow) {
            this.logger().info('Skipping preview sandbox release while workflow is active', {
                reason,
                activeWorkflow: this.state.activeWorkflow,
                shouldBeGenerating: this.state.shouldBeGenerating,
                activeAppTask: this.state.activeAppTask,
            });
            return false;
        }

        const released = await this.deploymentManager.shutdownPreviewInstance(reason);
        if (released || !this.state.sandboxInstanceId) {
            await this.releaseActivePreviewSlot();
            await this.releaseGlobalSandboxCapacity();
        }
        if (released) {
            this.broadcast(WebSocketMessageResponses.PREVIEW_RELEASED, { reason });
        }
        return released;
    }

    async deployPreview(
        clearLogs: boolean = true,
        forceRedeploy: boolean = false,
        options?: {
            capacityMode?: 'background' | 'foreground';
            shouldContinueWaiting?: () => boolean;
            onCapacityWaiting?: (position: number) => Promise<void> | void;
        },
    ): Promise<string> {
        let reservedPreviewSlot = false;
        try {
            const previewReservation = await this.reserveActivePreviewSlot();
            reservedPreviewSlot = true;
            await this.releaseEvictedPreviewSandboxes(
                previewReservation.candidates,
                previewReservation.releasesNeeded,
            );

            const response = await this.deployToSandbox([], forceRedeploy, undefined, clearLogs, options);
            if (response?.previewURL) {
                this.broadcast(WebSocketMessageResponses.PREVIEW_FORCE_REFRESH, {});
                return response.previewURL;
            }
            if (response?.tunnelURL) {
                this.broadcast(WebSocketMessageResponses.PREVIEW_FORCE_REFRESH, {});
                return response.tunnelURL;
            }
            if (options?.capacityMode === 'foreground') {
                throw new Error('Preview paused while waiting for an available workspace. Try again in a moment.');
            }
            return '';
        } catch (error) {
            if (reservedPreviewSlot) {
                await this.releaseActivePreviewSlot();
            }
            throw error;
        }
    }

    async deployProject(options?: DeployOptions): Promise<DeployResult> {
        const target = options?.target ?? 'platform';
        if (target !== 'platform') {
            return this.objective.deploy(options);
        }

        const generatedFileCount = Object.keys(this.state.generatedFilesMap ?? {}).length;
        const hasPlayableProject = Boolean(
            this.state.mvpGenerated ||
            this.state.lastPlayableDeploymentId ||
            this.state.lastPlayableDeploymentUrl
        );
        if (generatedFileCount === 0 || !hasPlayableProject) {
            const message = 'Create the playable before posting it.';
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                message,
                instanceId: this.state.sandboxInstanceId ?? this.state.sessionId ?? '',
                error: message,
            });
            return { success: false, target, error: message };
        }

        try {
            const templateDetails = this.getTemplateDetails();
            if (templateDetails.renderMode !== 'browser' && !this.state.sandboxInstanceId) {
                this.logger().info('Preparing preview sandbox before playable update quality gate');
                await this.deployPreview(true);
            }

            const issues = await this.fetchAllIssues(true);
            const runtimeErrorCount = issues.runtimeErrors.length;
            const typecheckErrorCount = issues.staticAnalysis.typecheck.issues.length;
            const lintErrorCount = issues.staticAnalysis.lint.issues.filter(
                (issue) => issue.severity === 'error',
            ).length;

            if (
                !issues.staticAnalysis.success ||
                runtimeErrorCount > 0 ||
                typecheckErrorCount > 0 ||
                lintErrorCount > 0
            ) {
                const validationContext = this.formatIssuesForPostValidationContext(issues);
                const issueSummary = [
                    runtimeErrorCount > 0 ? `${runtimeErrorCount} runtime error${runtimeErrorCount === 1 ? '' : 's'}` : '',
                    typecheckErrorCount > 0 ? `${typecheckErrorCount} type error${typecheckErrorCount === 1 ? '' : 's'}` : '',
                    lintErrorCount > 0 ? `${lintErrorCount} lint error${lintErrorCount === 1 ? '' : 's'}` : '',
                ].filter(Boolean).join(', ');
                const message = 'Playable needs fixes before updating';
                const error = issueSummary
                    ? `Found ${issueSummary}. Ask Buzz to fix the playable, then try updating again.`
                    : 'Ask Buzz to fix the playable, then try updating again.';

                this.logger().warn('Playable update blocked by quality gate', {
                    runtimeErrorCount,
                    typecheckErrorCount,
                    lintErrorCount,
                    staticAnalysisSuccess: issues.staticAnalysis.success,
                    staticAnalysisError: issues.staticAnalysis.error,
                });

                this.setState({
                    ...this.state,
                    lastPostValidationFailure: validationContext || error,
                } as AgentState);

                this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                    message,
                    instanceId: this.state.sandboxInstanceId ?? this.state.sessionId ?? '',
                    error,
                });

                return {
                    success: false,
                    target,
                    error,
                    metadata: {
                        qualityGate: {
                            runtimeErrorCount,
                            typecheckErrorCount,
                            lintErrorCount,
                            staticAnalysisSuccess: issues.staticAnalysis.success,
                            staticAnalysisError: issues.staticAnalysis.error,
                        },
                    },
                };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown validation error';
            this.logger().error('Playable update validation failed', error);
            this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
                message: 'Playable update could not be checked.',
                instanceId: this.state.sandboxInstanceId ?? this.state.sessionId ?? '',
                error: message,
            });
            return { success: false, target, error: message };
        }

        if (this.state.lastPostValidationFailure) {
            this.setState({
                ...this.state,
                lastPostValidationFailure: undefined,
            } as AgentState);
        }

        return this.objective.deploy(options);
    }

    async runDeployProjectFromWorkflow(workflowId: string, options?: DeployOptions): Promise<DeployResult> {
        this.throwIfDeleted('run deploy project workflow');
        await this.updateWorkflowStatus({
            workflowId,
            kind: 'deploy_project',
            status: 'running',
            message: 'Playable update workflow is validating and deploying',
        });

        return this.deployProject(options);
    }

    async runDeployPreviewFromWorkflow(
        workflowId: string,
        clearLogs = true,
        forceRedeploy = false,
    ): Promise<void> {
        this.throwIfDeleted('run deploy preview workflow');
        await this.updateWorkflowStatus({
            workflowId,
            kind: 'deploy_preview',
            status: 'running',
            message: 'Preview workflow is deploying the sandbox',
        });

        const previewUrl = await this.deployPreview(clearLogs, forceRedeploy);
        if (!previewUrl) {
            throw new Error('Preview deployment did not return a preview URL');
        }
    }

    exportProject(options: ExportOptions): Promise<ExportResult> {
        return this.objective.export(options);
    }

    async importTemplate(templateName: string): Promise<{ templateName: string; filesImported: number; files: TemplateFile[] }> {
        this.logger().info(`Importing template into project: ${templateName}`);

        if (this.state.templateName !== templateName) {
            const catalogResponse = await listTemplates(this.env.TEMPLATES_BUCKET);
            const catalogInfo = catalogResponse.success
                ? catalogResponse.templates.find(t => t.name === templateName)
                : null;

            this.setState({
                ...this.state,
                templateName,
                ...(catalogInfo?.projectType ? { projectType: catalogInfo.projectType } : {}),
            } as AgentState);
            this.templateDetailsCache = null;
        }

        const templateDetails = await this.ensureTemplateDetails();
        if (!templateDetails) {
            throw new Error(`Failed to get template details for: ${templateName}`);
        }

        this.setState({
            ...this.state,
            lastPackageJson: templateDetails.allFiles['package.json'] || this.state.lastPackageJson,
        } as AgentState);

        const importantFiles = getTemplateImportantFiles(templateDetails);
        await this.deployToSandbox();

        this.broadcast(WebSocketMessageResponses.TEMPLATE_UPDATED, {
            templateDetails,
        });

        return {
            templateName: templateDetails.name,
            filesImported: Object.keys(templateDetails.allFiles).length,
            files: importantFiles,
        };
    }
    
    protected async saveToDatabase() {
        this.logger().info(`Saving agent ${this.getAgentId()} to database`);
        // Save the app to database (authenticated users only)
        const appService = new AppService(this.env);
        const app = await appService.createOrUpdateApp({
            id: this.state.metadata.agentId,
            userId: this.state.metadata.userId,
            sessionToken: null,
            title: this.state.blueprint.title || this.state.query.substring(0, 100),
            description: this.state.blueprint.description,
            originalPrompt: this.state.query,
            finalPrompt: this.state.query,
            framework: this.state.blueprint.frameworks.join(','),
            playableAspectRatio: normalizePlayableAspectRatio(this.state.playableAspectRatio),
            visibility: 'private',
            status: 'generating',
            createdAt: new Date(),
            updatedAt: new Date()
            }, { createIfMissing: false });
        if (!app) {
            this.logger().warn(`Skipping database save for deleted app ${this.state.metadata.agentId}`);
            return;
        }
        this.logger().info(`App saved successfully to database for agent ${this.state.metadata.agentId}`, { 
            agentId: this.state.metadata.agentId, 
            userId: this.state.metadata.userId,
            visibility: 'private'
        });
        this.logger().info(`Agent initialized successfully for agent ${this.state.metadata.agentId}`);
    }

    // ==========================================
    // Project Import (bulk import pre-built projects)
    // ==========================================

    async importProject(args: {
        userId: string;
        agentId: string;
        projectName?: string;
        title: string;
        description: string;
        files: Record<string, string>;
        templateName: string;
        coverBase64?: string;
        coverContentType?: string;
        coverExtension?: 'webp' | 'png' | 'jpg';
        visibility?: 'private' | 'public';
        framework?: string;
    }): Promise<{ success: boolean; error?: string }> {
        try {
            const sessionId = DeploymentManager.generateNewSessionId();
            this.initLogger(args.agentId, args.userId, sessionId);
            const importProjectName = generateProjectName(
                args.title,
                args.agentId.replace(/-/g, '').slice(0, 12),
                CodeGeneratorAgent.PROJECT_NAME_PREFIX_MAX_LENGTH,
            );
            const projectName = args.projectName || importProjectName;

            // Set minimal state directly (skip LLM generation)
            this.setState({
                ...this.state,
                behaviorType: LEGACY_STATE_BEHAVIOR_TYPE,
                projectType: 'app' as ProjectType,
                projectName,
                query: args.description,
                initialUserAttachments: [],
                sessionId,
                hostname: '',
                blueprint: {
                    title: args.title,
                    projectName,
                    description: args.description,
                    detailedDescription: args.description,
                    colorPalette: [],
                    frameworks: [],
                    views: [],
                    userFlow: { uiLayout: '', uiDesign: '', userJourney: '' },
                    dataFlow: '',
                    architecture: { dataFlow: '' },
                    pitfalls: [],
                    implementationRoadmap: [],
                    initialPhase: { name: 'initial', description: '', files: [] },
                } as unknown as Blueprint,
                templateName: args.templateName,
                metadata: { agentId: args.agentId, userId: args.userId } as InferenceMetadata,
                shouldBeGenerating: false,
                currentDevState: CurrentDevState.IDLE,
                mvpGenerated: true,
                reviewingInitiated: false,
                generatedFilesMap: {},
                conversationMessages: [],
                pendingUserInputs: [],
                projectUpdatesAccumulator: [],
                lastDeepDebugTranscript: null,
                generatedPhases: [],
                phasesCounter: 0,
            } as unknown as AgentState);

            // Init git and populate files
            await this.git.init();

            const fileStates: FileState[] = Object.entries(args.files).map(([filePath, fileContents]) => ({
                filePath,
                fileContents,
                filePurpose: '',
                lastDiff: '',
            }));

            const filesMap: Record<string, FileState> = {};
            for (const fs of fileStates) {
                filesMap[fs.filePath] = fs;
            }
            this.setState({ ...this.state, generatedFilesMap: filesMap });

            await this.git.commit(fileStates, 'Initial import');

            // Upload cover image to R2 and set screenshotUrl
            let screenshotUrl = '';
            if (args.coverBase64) {
                const coverExtension = args.coverExtension || 'webp';
                const r2Key = `screenshots/${args.agentId}/latest.${coverExtension}`;
                const coverBytes = Uint8Array.from(atob(args.coverBase64), c => c.charCodeAt(0));
                await this.env.TEMPLATES_BUCKET.put(r2Key, coverBytes, {
                    httpMetadata: { contentType: args.coverContentType || 'image/webp' },
                });
                screenshotUrl = `/api/${r2Key}`;
            }

            // Save to D1
            const appService = new AppService(this.env);
            await appService.createApp({
                id: args.agentId,
                userId: args.userId,
                title: args.title,
                description: args.description,
                originalPrompt: args.description,
                framework: args.framework || '',
                visibility: args.visibility || 'public',
                status: 'completed',
                createdAt: new Date(),
                updatedAt: new Date(),
                ...(screenshotUrl ? { screenshotUrl, screenshotCapturedAt: new Date() } : {}),
            });

            this.logger().info(`Project imported: ${args.agentId} (${args.title})`);
            return { success: true };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger().error('Import failed:', error);
            return { success: false, error: msg };
        }
    }

    // ==========================================
    // Asset Map Sync
    // ==========================================

    /** Current `src/asset_map` contents for merge (URLs from R2 + preserved descriptions). */
    async readSrcAssetMap(): Promise<string | null> {
        const f = this.fileManager.getFile('src/asset_map');
        return f?.fileContents ?? null;
    }

    /**
     * Update src/asset_map file with current asset manifest.
     * Called from asset API routes after upload/delete operations.
     */
    async updateAssetMap(assetMapContent: string): Promise<{ success: boolean; error?: string }> {
        try {
            const file = {
                filePath: 'src/asset_map',
                fileContents: assetMapContent,
                filePurpose: 'Asset manifest mapping available project assets to their URLs',
            };
            await this.fileManager.saveGeneratedFile(file, 'chore: update asset map');
            this.logger().info('Asset map updated');
            return { success: true };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger().error('Failed to update asset map:', error);
            return { success: false, error: msg };
        }
    }

    async syncProjectAssetMapFromR2(): Promise<void> {
        const existing = await this.readSrcAssetMap();
        const json = await computeAgentAssetMapJson(this.env, this.getAgentId(), existing);
        const result = await this.updateAssetMap(json);
        if (!result.success) {
            this.logger().error('syncProjectAssetMapFromR2 failed', { error: result.error });
        }
    }

    async mergeAssetMapDescriptions(descriptionsByRelativePath: Record<string, string>): Promise<void> {
        if (Object.keys(descriptionsByRelativePath).length === 0) {
            return;
        }
        const raw = await this.readSrcAssetMap();
        const map = parseAssetMapJson(raw ?? undefined);
        for (const [rel, d] of Object.entries(descriptionsByRelativePath)) {
            const t = d.trim();
            if (!t) continue;
            const entry = map[rel];
            if (entry?.url) {
                map[rel] = { ...entry, description: t };
            }
        }
        const result = await this.updateAssetMap(JSON.stringify(map, null, 2));
        if (!result.success) {
            this.logger().error('mergeAssetMapDescriptions failed', { error: result.error });
        }
    }

    // ==========================================
    // Conversation Management
    // ==========================================

    /*
    * Each DO has 10 gb of sqlite storage. However, the way agents sdk works, it stores the 'state' object of the agent as a single row
    * in the cf_agents_state table. And row size has a much smaller limit in sqlite. Thus, we only keep current compactified conversation
    * in the agent's core state and store the full conversation in a separate DO table.
    */
    getConversationState(id: string = DEFAULT_CONVERSATION_SESSION_ID): ConversationState {
        const rows = this.sql<{ messages: string, id: string }>`SELECT * FROM full_conversations WHERE id = ${id}`;
        let fullHistory: ConversationMessage[] = [];
        if (rows.length > 0 && rows[0].messages) {
            try {
                const parsed = JSON.parse(rows[0].messages);
                if (Array.isArray(parsed)) {
                    fullHistory = parsed as ConversationMessage[];
                }
            } catch (_e) {
                this.logger().warn('Failed to parse full conversation history', _e);
            }
        }
        
        // Load compact (running) history from sqlite with fallback to in-memory state for migration
        const compactRows = this.sql<{ messages: string, id: string }>`SELECT * FROM compact_conversations WHERE id = ${id}`;
        let runningHistory: ConversationMessage[] = [];
        if (compactRows.length > 0 && compactRows[0].messages) {
            try {
                const parsed = JSON.parse(compactRows[0].messages);
                if (Array.isArray(parsed)) {
                    runningHistory = parsed as ConversationMessage[];
                }
            } catch (_e) {
                this.logger().warn('Failed to parse compact conversation history', _e);
            }
        }
        if (runningHistory.length === 0) {
            runningHistory = fullHistory;
        }

        this.logger().info(`Loaded conversation state ${id}, full_length: ${fullHistory.length}, compact_length: ${runningHistory.length}`, fullHistory);
        
        return {
            id: id,
            runningHistory,
            fullHistory,
        };
    }

    setConversationState(conversations: ConversationState) {
        const serializedFull = JSON.stringify(conversations.fullHistory);
        const serializedCompact = JSON.stringify(conversations.runningHistory);
        try {
            this.logger().info(`Saving conversation state ${conversations.id}, full_length: ${serializedFull.length}, compact_length: ${serializedCompact.length}`, serializedFull);
            void this.sql`INSERT OR REPLACE INTO compact_conversations (id, messages) VALUES (${conversations.id}, ${serializedCompact})`;
            void this.sql`INSERT OR REPLACE INTO full_conversations (id, messages) VALUES (${conversations.id}, ${serializedFull})`;
        } catch (error) {
            this.logger().error(`Failed to save conversation state ${conversations.id}`, error);
        }
    }

    addConversationMessage(message: ConversationMessage) {
        const conversationState = this.getConversationState();
        if (!conversationState.runningHistory.find(msg => msg.conversationId === message.conversationId)) {
            this.logger().info('Adding conversation message', {
                message,
                conversationId: message.conversationId,
                runningHistoryLength: conversationState.runningHistory.length,
                fullHistoryLength: conversationState.fullHistory.length
            });
            conversationState.runningHistory.push(message);
        } else  {
            conversationState.runningHistory = conversationState.runningHistory.map(msg => {
                if (msg.conversationId === message.conversationId) {
                    return message;
                }
                return msg;
            });
        }
        if (!conversationState.fullHistory.find(msg => msg.conversationId === message.conversationId)) {
            conversationState.fullHistory.push(message);
        } else {
            conversationState.fullHistory = conversationState.fullHistory.map(msg => {
                if (msg.conversationId === message.conversationId) {
                    return message;
                }
                return msg;
            });
        }
        this.setConversationState(conversationState);
    }

    private workflowConversationId(
        workflowId: string | undefined,
        suffix: 'user' | 'complete' | 'failed',
    ): string {
        return `${workflowId || generateNanoId()}-${suffix}`;
    }

    private buildUserInputHistoryMessage(
        userMessage: string,
        images?: ProcessedImageAttachment[],
    ): Omit<ConversationMessage, 'conversationId'> {
        const text = userMessage.trim() || '(Attached media)';
        const imageRefs = (images ?? [])
            .filter((image) => image.mimeType?.startsWith('image/') && image.r2Key)
            .map((image) => image.r2Key);
        const nonImageLines = (images ?? [])
            .filter((image) => image.mimeType && !image.mimeType.startsWith('image/'))
            .map((image) => {
                const filename = image.filename || image.r2Key.split('/').pop() || 'attachment';
                const description = image.description ? ` - ${image.description}` : '';
                return `- ${filename} (${image.mimeType}): ${image.r2Key || image.publicUrl}${description}`;
            });
        const content = nonImageLines.length > 0
            ? `${text}\n\n${USER_UPLOADED_MEDIA_HISTORY_MARKER}\n${nonImageLines.join('\n')}`
            : text;

        return imageRefs.length > 0
            ? createMultiModalUserMessage(content, imageRefs, 'high')
            : createUserMessage(content);
    }

    private recordWorkflowUserMessage(
        workflowId: string | undefined,
        userMessage: string,
        images?: ProcessedImageAttachment[],
    ): void {
        this.addConversationMessage({
            ...this.buildUserInputHistoryMessage(userMessage, images),
            conversationId: this.workflowConversationId(workflowId, 'user'),
        });
    }

    private buildGenerationCompleteMessage(kind: ActiveWorkflowTask['kind'], changedCount: number): string {
        if (kind === 'create_project') {
            return 'Your playable version is ready.';
        }
        if (changedCount > 0) {
            return 'Done, I updated the playable project.';
        }
        return 'I checked the project and did not make any project changes this time.';
    }

    private buildGenerationFailureMessage(errorMessage: string | undefined): string {
        if (errorMessage?.startsWith('The project agent ')) {
            return errorMessage;
        }
        return 'The project agent ran into a problem before finishing.';
    }

    private recordWorkflowAssistantMessage(
        workflowId: string | undefined,
        suffix: 'complete' | 'failed',
        message: string,
    ): void {
        this.addConversationMessage({
            ...createAssistantMessage(message),
            conversationId: this.workflowConversationId(workflowId, suffix),
        });
    }
    
    /**
     * Clear conversation history
     */
    public clearConversation(): void {
        try {
            this.logger().info('Clearing conversation history');
            
            // Clear SQL tables for default conversation session
            void this.sql`DELETE FROM full_conversations WHERE id = ${DEFAULT_CONVERSATION_SESSION_ID}`;
            void this.sql`DELETE FROM compact_conversations WHERE id = ${DEFAULT_CONVERSATION_SESSION_ID}`;
            
            this.logger().info('Conversation history cleared successfully');
            
            this.broadcast(WebSocketMessageResponses.CONVERSATION_CLEARED, {
                message: 'Conversation history cleared',
            });
        } catch (error) {
            this.logger().error('Error clearing conversation history:', error);
            this.broadcastError('Failed to clear conversation history', error);
        }
    }

    /**
     * Handle user input during conversational code generation
     * Processes user messages and updates pendingUserInputs state
     */
    async runUserInputFromWorkflow(
        userMessage: string,
        images?: Array<ImageAttachment | ProcessedImageAttachment>,
        workflowId?: string,
        options: { skipUserMessageRecord?: boolean; recoveryWorkflowId?: string } = {},
    ): Promise<void> {
        this.throwIfDeleted('run user input workflow');
        const effectiveWorkflowId = workflowId || this.createWorkflowId('user_input');
        try {
            if (!options.skipUserMessageRecord) {
                this.recordWorkflowUserMessage(effectiveWorkflowId, userMessage);
            }
            if (workflowId) {
                await this.updateWorkflowStatus({
                    workflowId,
                    kind: 'user_input',
                    status: 'running',
                    message: 'User input workflow is processing the message',
                });
            }
            this.logger().info('Processing user input message', { 
                messageLength: userMessage.length,
                pendingInputsCount: this.state.pendingUserInputs.length,
                hasImages: !!images && images.length > 0,
                imageCount: images?.length || 0
            });

            this.broadcast(WebSocketMessageResponses.USER_SUGGESTIONS_PROCESSING, {
                message: 'Processing user message',
                status: 'start',
            });

            const processedImages = images && images.length > 0
                ? (images.every(isProcessedWorkflowAttachment)
                    ? images.map(stripBase64FromProcessedAttachment)
                    : await this.uploadWorkflowUserInputAssets(images as ImageAttachment[]))
                : undefined;
            if (processedImages && processedImages.length > 0) {
                if (!options.skipUserMessageRecord) {
                    this.recordWorkflowUserMessage(effectiveWorkflowId, userMessage, processedImages);
                }
                await this.syncUploadedAssets(processedImages);
            }
            this.setState({
                ...this.state,
                lastFailedWorkflow: undefined,
                lastRetryableWorkflow: this.normalizeRetryableWorkflowIntent({
                    workflowId: effectiveWorkflowId,
                    recoveryWorkflowId: options.recoveryWorkflowId,
                    kind: 'user_input',
                    query: userMessage,
                    hostname: this.state.hostname,
                    requestedProjectType: this.state.projectType,
                    images: processedImages,
                }),
            } as AgentState);
            await this.runCodexGenerationFromWorkflow(workflowId, userMessage, 'user_input', {
                recoveryWorkflowId: options.recoveryWorkflowId,
                uploadedAssets: processedImages,
            });
            this.broadcast(WebSocketMessageResponses.USER_SUGGESTIONS_PROCESSING, {
                message: 'User message processed',
                status: 'complete',
            });
            return;

        } catch (error) {
            this.broadcast(WebSocketMessageResponses.USER_SUGGESTIONS_PROCESSING, {
                message: 'User message processing failed',
                status: 'error',
            });
            if (workflowId) {
                await this.updateWorkflowStatus({
                    workflowId,
                    kind: 'user_input',
                    status: 'failed',
                    message: error instanceof Error ? error.message : String(error),
                });
            }

            if (error instanceof RateLimitExceededError) {
                this.logger().error('Rate limit exceeded:', error);
                this.broadcast(WebSocketMessageResponses.RATE_LIMIT_ERROR, {
                    error
                });
                throw error;
            }
            this.broadcastError('Error processing user input', error);
            throw error;
        }
    }

    async handleUserInput(userMessage: string, images?: ImageAttachment[]): Promise<void> {
        return this.runUserInputFromWorkflow(userMessage, images);
    }
    // ==========================================
    // WebSocket Management
    // ==========================================
    
    /**
     * Handle WebSocket message - Agent owns WebSocket lifecycle
     * Delegates to centralized handler which can access both behavior and objective
     */
    async onMessage(connection: Connection, message: string): Promise<void> {
        handleWebSocketMessage(this, connection, message);
    }
    
    /**
     * Handle WebSocket close - Agent owns WebSocket lifecycle
     */
    async onClose(connection: Connection): Promise<void> {
        handleWebSocketClose(this, connection);
    }
    
    /**
     * Broadcast message to all connected WebSocket clients
     * Type-safe version using proper WebSocket message types
     */
    public broadcast<T extends WebSocketMessageType>(
        type: T, 
        data?: WebSocketMessageData<T>
    ): void {
        broadcastToConnections(this, type, data || {} as WebSocketMessageData<T>);
    }

    protected broadcastError(context: string, error: unknown): void {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger().error(`${context}:`, error);
        this.broadcast(WebSocketMessageResponses.ERROR, {
            error: `${context}: ${errorMessage}`
        });
    }
    // ==========================================
    // Git Management
    // ==========================================

    protected async gitInit() {
        try {
            await this.git.init();
            this.logger().info("Git initialized successfully");
            // Check if there is any commit
            const head = await this.git.getHead();
            
            if (!head) {
                this.logger().info("No commits found, creating initial commit");
                // get all generated files and commit them
                const generatedFiles = this.fileManager.getGeneratedFiles();
                if (generatedFiles.length === 0) {
                    this.logger().info("No generated files found, skipping initial commit");
                    return;
                }
                await this.git.commit(generatedFiles, "Initial commit");
                this.logger().info("Initial commit created successfully");
            }
        } catch (error) {
            this.logger().error("Error during git init:", error);
        }
    }

    /**
     * Export git objects
     * The route handler will build the repo with template rebasing
     */
    async exportGitObjects(): Promise<{
        gitObjects: Array<{ path: string; data: Uint8Array }>;
        query: string;
        hasCommits: boolean;
        templateDetails: TemplateDetails | null;
    }> {
        try {
            // Export git objects efficiently (minimal DO memory usage)
            const gitObjects = this.git.fs.exportGitObjects();

            await this.gitInit();
            
            // Ensure template details are available
            await this.ensureTemplateDetails();

            const templateDetails = this.getTemplateDetails();
            
            return {
                gitObjects,
                query: this.state.query || 'N/A',
                hasCommits: gitObjects.length > 0,
                templateDetails
            };
        } catch (error) {
            this.logger().error('exportGitObjects failed', error);
            throw error;
        }
    }

    /**
     * Handle browser file serving requests
     */
    async handleBrowserFileServing(request: Request): Promise<Response> {
        const url = new URL(request.url);

        this.logger().info('[BROWSER SERVING] Request received', {
            hostname: url.hostname,
            pathname: url.pathname,
            method: request.method
        });

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Max-Age': '86400'
                }
            });
        }

        // Extract token from hostname
        // Pattern: b-{agentid}-{token}.{previewDomain}/{filepath}
        // Token is always 16 characters after the LAST hyphen (after removing 'b-' prefix)
        const subdomain = url.hostname.split('.')[0];

        if (!subdomain.startsWith('b-')) {
            this.logger().warn('[BROWSER SERVING] Invalid hostname pattern - missing b- prefix', { hostname: url.hostname });
            return new Response('Invalid request', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        const withoutPrefix = subdomain.substring(2); // Remove 'b-'
        const lastHyphenIndex = withoutPrefix.lastIndexOf('-');

        if (lastHyphenIndex === -1) {
            this.logger().warn('[BROWSER SERVING] Invalid hostname pattern - no hyphen after prefix', { hostname: url.hostname });
            return new Response('Invalid request', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        const providedToken = withoutPrefix.substring(lastHyphenIndex + 1);

        // Extract file path from pathname (buzzplay templates: index.html at root; legacy: public/index.html)
        const filePath = url.pathname === '/' || url.pathname === ''
            ? 'index.html'
            : url.pathname.replace(/^\//, ''); // Remove leading slash

        this.logger().info('[BROWSER SERVING] Extracted', { providedToken, filePath });

        // Validate token
        const storedToken = this.state.fileServingToken?.token;
        if (!storedToken || providedToken !== storedToken.toLowerCase()) {
            this.logger().warn('[BROWSER SERVING] Token mismatch', { providedToken, storedToken });
            return new Response('Unauthorized', {
                status: 403,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        if (!isPathSafe(filePath)) {
            return new Response('Invalid path', {
                status: 400,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        // Handle /__buzzplay-host/v1/ API routes — games expect these but there's no
        // independent worker deployment, so return graceful degradation responses.
        const buzzplayApi = '/__buzzplay-host/v1';
        if (url.pathname.startsWith(`${buzzplayApi}/`)) {
            const corsHeaders = {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': '*',
            };
            const apiPath = url.pathname.slice(buzzplayApi.length);

            if (apiPath === '/health') {
                return new Response(JSON.stringify({ ok: true, persistence: 'none', auth: false, sessionCookieDomain: null }), { headers: corsHeaders });
            }

            // All other host APIs (state, leaderboard, auth) — not available in preview mode
            return new Response(JSON.stringify({ error: 'Not available in preview mode' }), { status: 501, headers: corsHeaders });
        }

        const normalized = normalizePath(filePath);
        let file = this.fileManager.getFile(normalized);

        if (!file && normalized === 'index.html') {
            file = this.fileManager.getFile('public/index.html');
        }

        // Try with public/ prefix if not found
        if (!file && !normalized.startsWith('public/')) {
            file = this.fileManager.getFile(`public/${normalized}`);
        }

        // Try with src/ prefix if not found (generated files like config, asset_map live under src/)
        if (!file && !normalized.startsWith('src/')) {
            file = this.fileManager.getFile(`src/${normalized}`);
        }

        if (!file) {
            // Fallback: try loading from R2 assets bucket
            const agentId = this.state.metadata?.agentId || '';
            const r2Key = `assets/${agentId}/${normalized}`;
            const r2Object = await this.env.TEMPLATES_BUCKET.get(r2Key);
            if (r2Object) {
                const r2ContentType = r2Object.httpMetadata?.contentType || getMimeType(normalized) || 'application/octet-stream';
                this.logger().info('[BROWSER SERVING] Serving from R2', { r2Key, contentType: r2ContentType });
                return new Response(r2Object.body, {
                    status: 200,
                    headers: {
                        'Content-Type': r2ContentType,
                        'Cache-Control': 'public, max-age=31536000, immutable',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, OPTIONS',
                        'Access-Control-Allow-Headers': '*',
                        'X-Preview-Type': 'browser-native'
                    }
                });
            }

            this.logger().warn('[BROWSER SERVING] File not found', { normalized });
            return new Response('File not found', {
                status: 404,
                headers: { 'Content-Type': 'text/plain' }
            });
        }

        // Serve file with correct Content-Type
        const contentType = getMimeType(normalized) || 'application/octet-stream';

        this.logger().info('[BROWSER SERVING] Serving file', {
            path: normalized,
            contentType
        });

        let content = file.fileContents;

        // For HTML files, inject base tag
        if (normalized.endsWith('.html') || contentType.includes('text/html')) {
            const baseTag = `<base href="/">`;

            // Inject base tag after <head> tag if present
            if (content.includes('<head>')) {
                content = content.replace(/<head>/i, `<head>\n  ${baseTag}`);
            } else {
                // Fallback: inject at the beginning
                content = baseTag + '\n' + content;
            }

            this.logger().info('[BROWSER SERVING] Injected base tag');
        }

        return new Response(content, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': '*',
                'X-Preview-Type': 'browser-native'
            }
        });
    }

    // ==========================================
    // WebSocket Ticket Management
    // ==========================================

    /**
     * Store a WebSocket ticket for later consumption
     * Called by controller after ownership is verified via JWT
     */
    storeWsTicket(ticket: PendingWsTicket): void {
        this.ticketManager.store(ticket);
        this.logger().info('WebSocket ticket stored', {
            userId: ticket.user.id,
            expiresIn: Math.floor((ticket.expiresAt - Date.now()) / 1000),
        });
    }

    /**
     * Consume a WebSocket ticket (one-time use)
     * Returns user session if valid, null otherwise
     */
    consumeWsTicket(token: string): TicketConsumptionResult | null {
        const result = this.ticketManager.consume(token);
        if (result) {
            this.logger().info('Ticket consumed successfully', { userId: result.user.id });
        } else {
            this.logger().warn('Ticket consumption failed', { tokenPrefix: token.slice(0, 10) });
        }
        return result;
    }
}
