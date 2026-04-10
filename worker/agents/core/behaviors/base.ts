import { Connection } from 'agents';
import { 
    FileConceptType,
    FileOutputType,
    Blueprint,
    AgenticBlueprint,
    PhasicBlueprint,
} from '../../schemas';
import { PreviewType, RuntimeError, StaticAnalysisResponse, TemplateDetails, TemplateFile } from 'worker/types/project-types';
import { BaseProjectState, AgenticState, FileState } from '../state';
import { AllIssues, AgentSummary, AgentInitArgs, BehaviorType, ProjectType } from '../types';
import { WebSocketMessageResponses } from '../../constants';
import { ProjectSetupAssistant } from '../../assistants/projectsetup';
import { UserConversationProcessor, RenderToolCall } from '../../operations/UserConversationProcessor';
import { FileRegenerationOperation } from '../../operations/FileRegeneration';
// Database schema imports removed - using zero-storage OAuth flow
import { getTemplateImportantFiles } from 'worker/services/templates/utils';
import { createScratchTemplateDetails } from '../../utils/templates';
import { WebSocketMessageData, WebSocketMessageType } from '../../../api/websocketTypes';
import { AgentActionKey, InferenceContext, InferenceRuntimeOverrides, ModelConfig } from '../../inferutils/config.types';
import { ModelConfigService } from '../../../database/services/ModelConfigService';
import { fixProjectIssues } from '../../../services/code-fixer';
import { FastCodeFixerOperation } from '../../operations/PostPhaseCodeFixer';
import { customizeTemplateFiles } from '../../utils/templateCustomizer';
import { AppService } from '../../../database';
import { RateLimitExceededError } from 'shared/types/errors';
import { ImageAttachment, type ProcessedImageAttachment } from '../../../types/image-attachment';
import { OperationOptions } from '../../operations/common';
import { uploadImageAsAgentAsset } from 'worker/utils/images';
import { uniqueAgentAssetRelativePath } from 'worker/utils/agentAssets';
import { generateAssetMediaCaption } from 'worker/utils/assetMediaCaption';
import { generateCoverImage } from '../../assistants/coverGenerator';

import { DeepDebugResult } from '../types';

import { ICodingAgent } from '../../services/interfaces/ICodingAgent';
import { SimpleCodeGenerationOperation } from '../../operations/SimpleCodeGeneration';
import { AgentComponent } from '../AgentComponent';
import type { AgentInfrastructure } from '../AgentCore';
import { GitVersionControl } from '../../git';
import { DeepDebuggerOperation } from '../../operations/DeepDebugger';
import type { DeepDebuggerInputs } from '../../operations/DeepDebugger';
import { generatePortToken } from 'worker/utils/cryptoUtils';
import { getPreviewDomain, getProtocolForHost } from 'worker/utils/urls';
import { isDev } from 'worker/utils/envs';
import { InMemoryAnalyzer } from '../../../services/static-analysis';
import { getTemplateDetails as fetchTemplateDetails, listTemplates } from '../../../services/templates/templateCatalog';


export interface BaseCodingOperations {
    regenerateFile: FileRegenerationOperation;
    fastCodeFixer: FastCodeFixerOperation;
    processUserMessage: UserConversationProcessor;
    simpleGenerateFiles: SimpleCodeGenerationOperation;
}

/**
 * Base class for all coding behaviors
 */
export abstract class BaseCodingBehavior<TState extends BaseProjectState> 
    extends AgentComponent<TState> implements ICodingAgent {
    protected static readonly MAX_COMMANDS_HISTORY = 10;

    protected projectSetupAssistant: ProjectSetupAssistant | undefined;

    protected templateDetailsCache: TemplateDetails | null = null;
    
    // In-memory storage for user-uploaded images (not persisted in DO state)
    protected pendingUserImages: ProcessedImageAttachment[] = []
    protected generationPromise: Promise<void> | null = null;
    protected currentAbortController?: AbortController;
    protected deepDebugPromise: Promise<{ transcript: string } | { error: string }> | null = null;
    protected deepDebugConversationId: string | null = null;

    protected staticAnalysisCache: StaticAnalysisResponse | null = null;

    protected userModelConfigs?: Record<AgentActionKey, ModelConfig>;
    protected runtimeOverrides?: InferenceRuntimeOverrides;
    
    protected operations: BaseCodingOperations = {
        regenerateFile: new FileRegenerationOperation(),
        fastCodeFixer: new FastCodeFixerOperation(),
        processUserMessage: new UserConversationProcessor(),
        simpleGenerateFiles: new SimpleCodeGenerationOperation(),
    };

    getBehavior(): BehaviorType {
        return this.state.behaviorType;
    }

    protected isAgenticState(state: BaseProjectState): state is AgenticState {
        return state.behaviorType === 'agentic';
    }

    constructor(infrastructure: AgentInfrastructure<TState>, protected projectType: ProjectType) {
        super(infrastructure);

        this.setState({
            ...this.state,
            behaviorType: this.getBehavior(),
            projectType: this.projectType,
        });
    }

    public async initialize(
        initArgs: AgentInitArgs,
        ..._args: unknown[]
    ): Promise<TState> {
        this.logger.info("Initializing agent");
        const { templateInfo } = initArgs;
        if (templateInfo) {
            this.templateDetailsCache = templateInfo.templateDetails;
            
            await this.ensureTemplateDetails();
        }

        // Reset the logg
        return this.state;
    }

    onStart(_props?: Record<string, unknown> | undefined): Promise<void> {
        return Promise.resolve();
    }

    protected async initializeAsync(): Promise<void> {
        try {
            await Promise.all([
                this.deployPreview(),
                this.generateReadme(),
                this.generateCover(),
            ]);
            this.logger.info("Deployment and initialization completed successfully");
        } catch (error) {
            this.logger.error("Error during async initialization:", error);
        }
    }
    onStateUpdate(_state: TState, _source: "server" | Connection) {}

    async ensureTemplateDetails() {
        // Skip fetching details for "scratch" baseline
        if (!this.templateDetailsCache) {
            if (this.state.templateName === 'scratch') {
                this.logger.info('Skipping template details fetch for scratch baseline');
                return;
            }
            this.logger.info(`Loading template details for: ${this.state.templateName}`);
            const results = await fetchTemplateDetails(this.env.TEMPLATES_BUCKET, this.state.templateName);
            if (!results.success || !results.templateDetails) {
                throw new Error(`Failed to get template details for: ${this.state.templateName}`);
            }
            
            const templateDetails = results.templateDetails;
            
            const customizedAllFiles = { ...templateDetails.allFiles };
            
            this.logger.info('Customizing template files for older app');
            const customizedFiles = customizeTemplateFiles(
                templateDetails.allFiles,
                {
                    projectName: this.state.projectName,
                }
            );
            Object.assign(customizedAllFiles, customizedFiles);
            
            this.templateDetailsCache = {
                ...templateDetails,
                allFiles: customizedAllFiles
            };
            this.logger.info('Template details loaded and customized');

            // Deploy preview right away for browser-rendered templates
            if (templateDetails.renderMode === 'browser') {
                await this.deployPreview();
            }
        }
        return this.templateDetailsCache;
    }

    public getTemplateDetails(): TemplateDetails {
        if (!this.templateDetailsCache) {
            // Synthesize a minimal scratch template when starting from scratch
            if (this.state.templateName === 'scratch') {
                this.templateDetailsCache = createScratchTemplateDetails();
                return this.templateDetailsCache;
            }
            this.ensureTemplateDetails();
            throw new Error('Template details not loaded. Call ensureTemplateDetails() first.');
        }
        return this.templateDetailsCache;
    }

    protected isPreviewable(): boolean {
        // If there are 'package.json', and 'wrangler.jsonc' files, then it is previewable
        return this.fileManager.fileExists('package.json') && (this.fileManager.fileExists('wrangler.jsonc') || this.fileManager.fileExists('wrangler.toml'));
    }

    getProjectSetupAssistant(): ProjectSetupAssistant {
        if (this.projectSetupAssistant === undefined) {
            this.projectSetupAssistant = new ProjectSetupAssistant({
                env: this.env,
                agentId: this.getAgentId(),
                query: this.state.query,
                blueprint: this.state.blueprint,
                template: this.getTemplateDetails(),
                inferenceContext: this.getInferenceContext()
            });
        }
        return this.projectSetupAssistant;
    }

    getSessionId() {
        return this.deploymentManager.getSessionId();
    }

    isCodeGenerating(): boolean {
        return this.generationPromise !== null;
    }

    getUserModelConfigs(): Record<AgentActionKey, ModelConfig> | undefined {
        return this.userModelConfigs;
    }

    setUserModelConfigs(configs: Record<AgentActionKey, ModelConfig> | undefined): void {
        this.userModelConfigs = configs;
    }

    getRuntimeOverrides(): InferenceRuntimeOverrides | undefined {
        return this.runtimeOverrides;
    }

    setRuntimeOverrides(overrides: InferenceRuntimeOverrides | undefined): void {
        this.runtimeOverrides = overrides;
    }

    abstract getOperationOptions(): OperationOptions;

    /**
     * Gets or creates an abort controller for the current operation
     * Reuses existing controller for nested operations (e.g., tool calling)
     */
    protected getOrCreateAbortController(): AbortController {
        // Don't reuse aborted controllers
        if (this.currentAbortController && !this.currentAbortController.signal.aborted) {
            return this.currentAbortController;
        }
        
        // Create new controller in memory for new operation
        this.currentAbortController = new AbortController();
        
        return this.currentAbortController;
    }
    
    /**
     * Cancels the current inference operation if any
     */
    public cancelCurrentInference(): boolean {
        if (this.currentAbortController) {
            this.logger.info('Cancelling current inference operation');
            this.currentAbortController.abort();
            this.currentAbortController = undefined;
            return true;
        }
        return false;
    }
    
    /**
     * Clears abort controller after successful completion
     */
    protected clearAbortController(): void {
        this.currentAbortController = undefined;
    }
    
    /**
     * Gets inference context with abort signal
     * Reuses existing abort controller for nested operations
     */
    protected getInferenceContext(): InferenceContext {
        const controller = this.getOrCreateAbortController();
        
        return {
            metadata: this.state.metadata,
            enableFastSmartCodeFix: false,  // TODO: Do we want to enable it via some config?
            enableRealtimeCodeFix: false,   // TODO: Do we want to enable it via some config?
            abortSignal: controller.signal,
            userModelConfigs: this.getUserModelConfigs(),
            runtimeOverrides: this.getRuntimeOverrides(),
        };
    }

    async generateReadme() {
        this.logger.info('Generating README.md');
        this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
            message: 'Generating README.md',
            filePath: 'README.md',
            filePurpose: 'Project documentation and setup instructions'
        });

        const readme = await this.operations.simpleGenerateFiles.generateReadme(this.getOperationOptions());

        await this.fileManager.saveGeneratedFile(readme, "feat: README.md");

        this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
            message: 'README.md generated successfully',
            file: readme
        });
        this.logger.info('README.md generated successfully');
    }

    async generateCover() {
        const blueprint = this.state.blueprint as PhasicBlueprint;
        if (!blueprint?.title) {
            this.logger.warn('Skipping cover generation: no blueprint title');
            return;
        }

        try {
            this.logger.info('Generating cover image');
            const result = await generateCoverImage(this.env, blueprint);

            const agentId = this.getAgentId();
            const r2Key = `screenshots/${agentId}/cover.png`;
            await this.env.TEMPLATES_BUCKET.put(r2Key, result.imageBytes, {
                httpMetadata: { contentType: result.contentType },
            });

            const screenshotUrl = `/api/${r2Key}`;

            const appService = new AppService(this.env);
            await appService.updateApp(agentId, {
                screenshotUrl,
                screenshotCapturedAt: new Date(),
            });

            this.logger.info('Cover image generated and stored', { r2Key });
        } catch (error) {
            this.logger.error('Cover generation failed (non-blocking):', error);
        }
    }

    async setBlueprint(blueprint: Blueprint): Promise<void> {
        this.setState({
            ...this.state,
            blueprint: blueprint as AgenticBlueprint | PhasicBlueprint,
        });
        this.broadcast(WebSocketMessageResponses.BLUEPRINT_UPDATED, {
            message: 'Blueprint updated',
            updatedKeys: Object.keys(blueprint || {})
        });
    }

    getProjectType() {
        return this.state.projectType;
    }

    async queueUserRequest(request: string, images?: ProcessedImageAttachment[]): Promise<void> {
        this.setState({
            ...this.state,
            pendingUserInputs: [...this.state.pendingUserInputs, request]
        });
        if (images && images.length > 0) {
            this.logger.info('Storing user images in-memory for phase generation', {
                imageCount: images.length,
            });
            this.pendingUserImages = [...this.pendingUserImages, ...images];
        }
    }

    protected fetchPendingUserRequests(): string[] {
        const inputs = this.state.pendingUserInputs;
        if (inputs.length > 0) {
            this.setState({
                ...this.state,
                pendingUserInputs: []
            });
        }
        return inputs;
    }

    clearConversation(): void {
        this.infrastructure.clearConversation();
    }

    getGit(): GitVersionControl {
        return this.git;
    }


    /**
     * State machine controller for code generation with user interaction support
     * Executes phases sequentially with review cycles and proper state transitions
     */
    async generateAllFiles(): Promise<void> {
        if (this.state.mvpGenerated && this.state.pendingUserInputs.length === 0) {
            this.logger.info("Code generation already completed and no user inputs pending");
            return;
        }
        if (this.isCodeGenerating()) {
            this.logger.info("Code generation already in progress");
            return;
        }
        this.generationPromise = this.buildWrapper();
        await this.generationPromise;
    }

    setMVPGenerated(): boolean {
        if (!this.state.mvpGenerated) {
            this.setState({ ...this.state, mvpGenerated: true });
            this.logger.info('MVP generated');
            return true;
        }
        return false;
    }

    isMVPGenerated(): boolean {
        return this.state.mvpGenerated;
    }

    private async buildWrapper() {
        this.broadcast(WebSocketMessageResponses.GENERATION_STARTED, {
            message: 'Starting code generation',
            totalFiles: this.getTotalFiles()
        });
        this.logger.info('Starting code generation', {
            totalFiles: this.getTotalFiles()
        });
        await this.ensureTemplateDetails();
        try {
            await this.build();
        } catch (error) {
            if (error instanceof RateLimitExceededError) {
                this.logger.error("Error in state machine:", error);
                this.broadcast(WebSocketMessageResponses.RATE_LIMIT_ERROR, { error });
            } else {
                this.broadcastError("Error during generation", error);
            }
        } finally {
            // Clear abort controller after generation completes
            this.clearAbortController();
            
            const appService = new AppService(this.env);
            await appService.updateApp(
                this.getAgentId(),
                {
                    status: 'completed',
                }
            );
            this.generationPromise = null;
            this.broadcast(WebSocketMessageResponses.GENERATION_COMPLETE, {
                message: "Code generation and review process completed.",
                instanceId: this.state.sessionId,
            });
        }
    }
    
    /**
     * Abstract method to be implemented by subclasses
     * Contains the main logic for code generation and review process
     */
    abstract build(): Promise<void>

    async executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[],
    ): Promise<DeepDebugResult> {
        const debugPromise = (async () => {
            try {
                const previousTranscript = this.state.lastDeepDebugTranscript ?? undefined;
                const operationOptions = this.getOperationOptions();
                const filesIndex = operationOptions.context.allFiles
                    .filter((f) =>
                        !focusPaths?.length ||
                        focusPaths.some((p) => f.filePath.includes(p)),
                    );

                const runtimeErrors = await this.fetchRuntimeErrors(false);

                const inputs: DeepDebuggerInputs = {
                    issue,
                    previousTranscript,
                    filesIndex,
                    runtimeErrors,
                    streamCb,
                    toolRenderer,
                };

                const operation = new DeepDebuggerOperation();

                const result = await operation.execute(inputs, operationOptions);

                const transcript = result.transcript;

                // Save transcript for next session
                this.setState({
                    ...this.state,
                    lastDeepDebugTranscript: transcript,
                });

                return { success: true as const, transcript };
            } catch (e) {
                this.logger.error('Deep debugger failed', e);
                return { success: false as const, error: `Deep debugger failed: ${String(e)}` };
            } finally {
                this.deepDebugPromise = null;
                this.deepDebugConversationId = null;
            }
        })();

        // Store promise before awaiting
        this.deepDebugPromise = debugPromise;

        return await debugPromise;
    }


    getModelConfigsInfo() {
        const modelService = new ModelConfigService(this.env);
        return modelService.getModelConfigsInfo(this.state.metadata.userId);
    }

    getTotalFiles(): number {
        return this.fileManager.getGeneratedFilePaths().length
    }

    getSummary(): Promise<AgentSummary> {
        const summaryData = {
            query: this.state.query,
            generatedCode: this.fileManager.getGeneratedFiles(),
        };
        return Promise.resolve(summaryData);
    }

    async getFullState(): Promise<TState> {
        return this.state;
    }
    
    migrateStateIfNeeded(): void {
        // no-op, only older phasic agents need this, for now.
    }

    getFileGenerated(filePath: string) {
        return this.fileManager!.getGeneratedFile(filePath) || null;
    }

    async fetchRuntimeErrors(_clear: boolean = true, _shouldWait: boolean = true): Promise<RuntimeError[]> {
        // No preview environment to fetch runtime errors from; return empty
        return [];
    }

    /**
     * Perform static code analysis on the generated files
     * This helps catch potential issues early in the development process
     */
    async runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse> {
        try {
            // Only use cache for full (unscoped) analysis
            if (!files && this.staticAnalysisCache) {
                return this.staticAnalysisCache;
            }

            // Use in-memory analysis (no preview environment)
            let analysisResponse: StaticAnalysisResponse;
            analysisResponse = await this.runInMemoryAnalysis(files);

            // Only cache full (unscoped) analysis results
            if (!files) {
                this.staticAnalysisCache = analysisResponse;
            }

            const { lint, typecheck } = analysisResponse;
            this.broadcast(WebSocketMessageResponses.STATIC_ANALYSIS_RESULTS, {
                lint: { issues: lint.issues, summary: lint.summary },
                typecheck: { issues: typecheck.issues, summary: typecheck.summary }
            });

            return analysisResponse;
        } catch (error) {
            this.broadcastError("Failed to lint code", error);
            return { success: false, lint: { issues: [], }, typecheck: { issues: [], } };
        }
    }

    /**
     * Run in-memory static analysis for browser-rendered projects
     * Performs static analysis directly in the worker
     */
    private async runInMemoryAnalysis(filePaths?: string[]): Promise<StaticAnalysisResponse> {
        const allFiles = this.fileManager.getAllFiles();
        const filePathSet = filePaths ? new Set(filePaths) : null;
        const filesToAnalyze = filePathSet
            ? allFiles.filter((f) => filePathSet.has(f.filePath))
            : allFiles;

        const fileInputs = filesToAnalyze.map((f) => ({
            path: f.filePath,
            content: f.fileContents,
        }));

        const analyzer = new InMemoryAnalyzer();
        return analyzer.analyze(fileInputs);
    }

    /**
     * Apply deterministic code fixes for common TypeScript errors
     */
    protected async applyDeterministicCodeFixes() : Promise<StaticAnalysisResponse | undefined> {
        try {
            // Get static analysis and do deterministic fixes
            const staticAnalysis = await this.runStaticAnalysisCode();
            if (staticAnalysis.typecheck.issues.length == 0) {
                this.logger.info("No typecheck issues found, skipping deterministic fixes");
                return staticAnalysis;  // So that static analysis is not repeated again
            }
            const typeCheckIssues = staticAnalysis.typecheck.issues;
            this.broadcast(WebSocketMessageResponses.DETERMINISTIC_CODE_FIX_STARTED, {
                message: `Attempting to fix ${typeCheckIssues.length} TypeScript issues using deterministic code fixer`,
                issues: typeCheckIssues
            });

            this.logger.info(`Attempting to fix ${typeCheckIssues.length} TypeScript issues using deterministic code fixer`);
            const allFiles = this.fileManager.getAllFiles();

            const fixResult = fixProjectIssues(
                allFiles.map(file => ({
                    filePath: file.filePath,
                    fileContents: file.fileContents,
                    filePurpose: ''
                })),
                typeCheckIssues
            );

            this.broadcast(WebSocketMessageResponses.DETERMINISTIC_CODE_FIX_COMPLETED, {
                message: `Fixed ${typeCheckIssues.length} TypeScript issues using deterministic code fixer`,
                issues: typeCheckIssues,
                fixResult
            });

            if (fixResult) {
                if (fixResult.modifiedFiles.length > 0) {
                        this.logger.info("Applying deterministic fixes to files, Fixes: ", JSON.stringify(fixResult, null, 2));
                        const fixedFiles = fixResult.modifiedFiles.map(file => ({
                            filePath: file.filePath,
                            filePurpose: allFiles.find(f => f.filePath === file.filePath)?.filePurpose || '',
                            fileContents: file.fileContents
                    }));
                    await this.fileManager.saveGeneratedFiles(fixedFiles, "fix: applied deterministic fixes");

                    await this.deployPreview();
                    this.logger.info("Deployed deterministic fixes");
                }
            }
            this.logger.info(`Applied deterministic code fixes: ${JSON.stringify(fixResult, null, 2)}`);
        } catch (error) {
            this.broadcastError('Deterministic code fixer failed', error);
        }
        // return undefined;
    }

    async fetchAllIssues(_resetIssues: boolean = false): Promise<AllIssues> {
        const staticAnalysis = await this.runStaticAnalysisCode();
        this.logger.info("Fetched issues:", JSON.stringify({ runtimeErrors: [], staticAnalysis }));
        return { runtimeErrors: [], staticAnalysis };
    }

    async updateProjectName(newName: string): Promise<boolean> {
        try {
            const valid = /^[a-z0-9-_]{3,50}$/.test(newName);
            if (!valid) return false;
            const updatedBlueprint = { ...this.state.blueprint, projectName: newName };
            this.setState({
                ...this.state,
                blueprint: updatedBlueprint
            });
            let ok = true;
            try {
                const appService = new AppService(this.env);
                const dbOk = await appService.updateApp(this.getAgentId(), { title: newName });
                ok = ok && dbOk;
            } catch (error) {
                this.logger.error('Error updating project name in database:', error);
                ok = false;
            }
            this.broadcast(WebSocketMessageResponses.PROJECT_NAME_UPDATED, {
                message: 'Project name updated',
                projectName: newName
            });
            return ok;
        } catch (error) {
            this.logger.error('Error updating project name:', error);
            return false;
        }
    }

    /**
     * Update user-facing blueprint fields
     * Only allows updating safe, cosmetic fields - not internal generation state
     */
    async updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint> {
        // Fields that are safe to update after generation starts
        // Excludes: initialPhase (breaks phasic generation)
        const safeUpdatableFields = new Set([
            'title',
            'description',
            'detailedDescription',
            'colorPalette',
            'views',
            'userFlow',
            'dataFlow',
            'architecture',
            'pitfalls',
            'frameworks',
            'implementationRoadmap'
        ]);

        // Filter to only safe fields
        const filtered: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(patch)) {
            if (safeUpdatableFields.has(key) && value !== undefined) {
                filtered[key] = value;
            }
        }

        // Agentic: allow initializing plan if not set yet (first-time plan initialization only)
        if (this.isAgenticState(this.state)) {
            const currentPlan = this.state.blueprint?.plan;
            const patchPlan = 'plan' in patch ? patch.plan : undefined;
            if (Array.isArray(patchPlan) && (!Array.isArray(currentPlan) || currentPlan.length === 0)) {
                filtered['plan'] = patchPlan;
            }
        }

        // projectName requires separate handling
        if ('projectName' in patch && typeof patch.projectName === 'string') {
            await this.updateProjectName(patch.projectName);
        }

        // Merge and update state
        const updated = { ...this.state.blueprint, ...filtered } as Blueprint;
        this.setState({
            ...this.state,
            blueprint: updated
        });
        
        this.broadcast(WebSocketMessageResponses.BLUEPRINT_UPDATED, {
            message: 'Blueprint updated',
            updatedKeys: Object.keys(filtered)
        });
        
        return updated;
    }

    // ===== Debugging helpers for assistants =====
    listFiles(): FileOutputType[] {
        return this.fileManager.getAllRelevantFiles();
    }

    async readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }> {
        const results: { path: string; content: string }[] = [];

        for (const path of paths) {
            const file = this.fileManager.getFile(path);
            if (file) {
                results.push({ path, content: file.fileContents });
            }
        }

        return { files: results };
    }

    updateSlideManifest(file: FileOutputType) {
        // If the project type is presentation and this is a slide file, update the manifest
        if (this.projectType === 'presentation') {
            const templateDetails = this.getTemplateDetails()
            if (!templateDetails) {
                return;
            }
            const slidesDirectory = templateDetails.slideDirectory ?? '/public/slides';
            if (file.filePath.startsWith(slidesDirectory) && file.filePath.endsWith('.json')) {
                const manifestPath = `${slidesDirectory}/manifest.json`
                const existingManifest = this.fileManager.getFile(manifestPath)
                
                // Parse existing manifest or create new one
                let manifestData: { slides: string[] } = { slides: [] };
                if (existingManifest) {
                    try {
                        const parsed = JSON.parse(existingManifest.fileContents);
                        manifestData = {
                            slides: Array.isArray(parsed.slides) ? parsed.slides : []
                        };
                    } catch (error) {
                        this.logger.error('Failed to parse existing manifest.json', error);
                        manifestData = { slides: [] };
                    }
                } else {
                    manifestData = { slides: [] };
                }
                
                // Add slide path to slides array if not already present
                const relativeSlidePath = file.filePath.replace(slidesDirectory + '/', '');
                if (!manifestData.slides.includes(relativeSlidePath)) {
                    manifestData.slides.push(relativeSlidePath);
                    
                    // Save updated manifest
                    const updatedManifest: FileOutputType = {
                        filePath: manifestPath,
                        fileContents: JSON.stringify(manifestData, null, 2),
                        filePurpose: 'Presentation slides manifest'
                    };
                    this.fileManager.recordFileChanges([updatedManifest]);
                    
                    this.logger.info('Updated manifest.json with new slide', {
                        slidePath: relativeSlidePath,
                        totalSlides: manifestData.slides.length
                    });
                }
            }
        }
    }

    /**
     * Regenerate a file to fix identified issues
     * Retries up to 3 times before giving up
     */
    async regenerateFile(file: FileOutputType, issues: string[], retryIndex: number = 0) {
        this.broadcast(WebSocketMessageResponses.FILE_REGENERATING, {
            message: `Regenerating file: ${file.filePath}`,
            filePath: file.filePath,
            original_issues: issues,
        });
        
        const result = await this.operations.regenerateFile.execute(
            {file, issues, retryIndex},
            this.getOperationOptions()
        );

        this.updateSlideManifest(result);
        const fileState = await this.fileManager.saveGeneratedFile(result);

        this.broadcast(WebSocketMessageResponses.FILE_REGENERATED, {
            message: `Regenerated file: ${file.filePath}`,
            file: fileState,
            original_issues: issues,
        });
        
        return fileState;
    }

    async regenerateFileByPath(path: string, issues: string[]): Promise<{ path: string; diff: string }> {
        const templateDetails = this.getTemplateDetails();
        if (templateDetails && templateDetails.dontTouchFiles && templateDetails.dontTouchFiles.includes(path)) {
            return {
                path,
                diff: '<WRITE PROTECTED - TEMPLATE FILE, CANNOT MODIFY - SKIPPED - NO CHANGES MADE>'
            };
        }
        // Read file from local file manager
        let fileContents = '';
        let filePurpose = '';
        try {
            const fmFile = this.fileManager.getFile(path);
            if (fmFile) {
                fileContents = fmFile.fileContents;
                filePurpose = fmFile.filePurpose || '';
            } else {
                throw new Error(`File not found: ${path}`);
            }
        } catch (e) {
            throw new Error(`Failed to read file for regeneration: ${String(e)}`);
        }

        const regenerated = await this.regenerateFile({ filePath: path, fileContents, filePurpose }, issues, 0);
        // Invalidate cache
        this.staticAnalysisCache = null;
        await this.deployPreview();
        return { path, diff: regenerated.lastDiff };
    }

    async generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }> {
        this.logger.info('Generating files for deep debugger', {
            phaseName,
            requirementsCount: requirements.length,
            filesCount: files.length
        });
        
        // Broadcast file generation started
        this.broadcast(WebSocketMessageResponses.PHASE_IMPLEMENTING, {
            message: `Generating files: ${phaseName}`,
            phaseName
        });

        const skippedFiles: { path: string; purpose: string; diff: string }[] = [];

        // Enforce template donttouch constraints
        const templateDetails = this.getTemplateDetails();
        if (templateDetails && templateDetails.dontTouchFiles) {
            const dontTouchFiles = new Set<string>(templateDetails.dontTouchFiles);
            files = files.filter(file => {
                if (dontTouchFiles.has(file.path)) {
                    this.logger.info('Skipping dont-touch file', { filePath: file.path });
                    skippedFiles.push({ path: file.path, purpose: `WRITE-PROTECTED FILE, CANNOT MODIFY`, diff: "<WRITE PROTECTED - TEMPLATE FILE, CANNOT MODIFY - SKIPPED - NO CHANGES MADE>" });
                    return false;
                }
                return true;
            });
        }

        const savedFiles: FileState[] = [];

        const operation = new SimpleCodeGenerationOperation();
        const result = await operation.execute(
            {
                phaseName,
                phaseDescription,
                requirements,
                files,
                fileGeneratingCallback: (filePath: string, filePurpose: string) => {
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATING, {
                        message: `Generating file: ${filePath}`,
                        filePath,
                        filePurpose
                    });
                },
                fileChunkGeneratedCallback: (filePath: string, chunk: string, format: 'full_content' | 'unified_diff') => {
                    this.broadcast(WebSocketMessageResponses.FILE_CHUNK_GENERATED, {
                        message: `Generating file: ${filePath}`,
                        filePath,
                        chunk,
                        format
                    });
                },
                fileClosedCallback: (file, message) => {
                    // Record file to state (sync)
                    const saved = this.fileManager.recordFileChanges([file]);
                    savedFiles.push(...saved);
                    this.updateSlideManifest(file);
                    this.broadcast(WebSocketMessageResponses.FILE_GENERATED, {
                        message,
                        file
                    });
                }
            },
            this.getOperationOptions()
        );

        await this.fileManager.saveGeneratedFiles(
            [],
            `feat: ${phaseName}\n\n${phaseDescription}`
        );

        this.logger.info('Files generated and saved', {
            fileCount: result.files.length
        });

        await this.deployPreview();

        return { 
            files: [
                ...skippedFiles,
                ...savedFiles.map(f => {
                    return {
                        path: f.filePath,
                        purpose: f.filePurpose || '',
                        diff: f.lastDiff || ''
                    };
                }) 
            ]
        };
    }

    /**
     * Get or create file serving token (lazy generation)
     */
    private getOrCreateFileServingToken(): string {
        const existing = this.state.fileServingToken?.token;
        if (!existing || /[^a-z0-9]/.test(existing)) {
            const token = generatePortToken();
            this.setState({
                ...this.state,
                fileServingToken: {
                    token,
                    createdAt: Date.now()
                }
            });
        }
        return this.state.fileServingToken!.token;
    }

    /**
     * Get browser preview URL for file serving
     */
    public getBrowserPreviewURL(): string {
        const token = this.getOrCreateFileServingToken();
        const agentId = this.getAgentId();
        const previewDomain = isDev(this.env) ? 'localhost:5173' : getPreviewDomain(this.env);

        // Format: b-{agentid}-{token}.{previewDomain}
        return `${getProtocolForHost(previewDomain)}://b-${agentId}-${token}.${previewDomain}`;
    }

    // Deploy browser preview and broadcast URL
    async deployPreview(_clearLogs: boolean = true, _forceRedeploy: boolean = false): Promise<string> {
        this.broadcast(WebSocketMessageResponses.DEPLOYMENT_STARTED, {});
        const result: PreviewType = {
            previewURL: this.getBrowserPreviewURL()
        };
        this.broadcast(WebSocketMessageResponses.DEPLOYMENT_COMPLETED, result);
        this.broadcast(WebSocketMessageResponses.PREVIEW_FORCE_REFRESH, {});
        return result.previewURL ?? '';
    }

    async importTemplate(templateName: string): Promise<{ templateName: string; filesImported: number; files: TemplateFile[] }> {
        this.logger.info(`Importing template into project: ${templateName}`);

        if (this.state.templateName !== templateName) {
            // Get template catalog info to sync projectType
            const catalogResponse = await listTemplates(this.env.TEMPLATES_BUCKET);
            const catalogInfo = catalogResponse.success 
                ? catalogResponse.templates.find(t => t.name === templateName)
                : null;
            
            // Update state with template name and projectType if available
            this.setState({
                ...this.state,
                templateName: templateName,
                ...(catalogInfo?.projectType ? { projectType: catalogInfo.projectType } : {}),
            });

            this.templateDetailsCache = null;   // Clear template details cache
        }
        const templateDetails = await this.ensureTemplateDetails();
        if (!templateDetails) {
            throw new Error(`Failed to get template details for: ${templateName}`);
        }

        this.setState({
            ...this.state,
            lastPackageJson: templateDetails.allFiles['package.json'] || this.state.lastPackageJson,
        });

        // Get important files for return value
        const importantFiles = getTemplateImportantFiles(templateDetails);

        // Ensure deployment for preview
        await this.deployPreview();

        // Notify frontend about template metadata update
        this.broadcast(WebSocketMessageResponses.TEMPLATE_UPDATED, {
            templateDetails
        });

        return {
            templateName: templateDetails.name,
            filesImported: Object.keys(templateDetails.allFiles).length,
            files: importantFiles
        };
    }

    async waitForGeneration(): Promise<void> {
        if (this.generationPromise) {
            try {
                await this.generationPromise;
                this.logger.info("Code generation completed successfully");
            } catch (error) {
                this.logger.error("Error during code generation:", error);
            }
        } else {
            this.logger.error("No generation process found");
        }
    }

    isDeepDebugging(): boolean {
        return this.deepDebugPromise !== null;
    }
    
    getDeepDebugSessionState(): { conversationId: string } | null {
        if (this.deepDebugConversationId && this.deepDebugPromise) {
            return { conversationId: this.deepDebugConversationId };
        }
        return null;
    }

    async waitForDeepDebug(): Promise<void> {
        if (this.deepDebugPromise) {
            try {
                await this.deepDebugPromise;
                this.logger.info("Deep debug session completed successfully");
            } catch (error) {
                this.logger.error("Error during deep debug session:", error);
            } finally {
                // Clear promise after waiting completes
                this.deepDebugPromise = null;
            }
        }
    }

    protected async onProjectUpdate(message: string): Promise<void> {
        this.setState({
            ...this.state,
            projectUpdatesAccumulator: [...this.state.projectUpdatesAccumulator, message]
        });
    }

    protected async getAndResetProjectUpdates() {
        const projectUpdates = this.state.projectUpdatesAccumulator || [];
        this.setState({
            ...this.state,
            projectUpdatesAccumulator: []
        });
        return projectUpdates;
    }

    public broadcast<T extends WebSocketMessageType>(msg: T, data?: WebSocketMessageData<T>): void {
        if (this.operations.processUserMessage.isProjectUpdateType(msg)) {
            let message = msg as string;
            if (data && 'message' in data) {
                message = (data as { message: string }).message;
            }
            this.onProjectUpdate(message);
        }
        super.broadcast(msg, data);
    }

    /**
     * Delete files from the file manager
     */
    async deleteFiles(filePaths: string[]) : Promise<{ success: boolean, error?: string }> {
        this.fileManager.deleteFiles(filePaths);
        this.logger.info(`Deleted ${filePaths.length} files: ${filePaths.join(", ")}`);
        return { success: true };
    }

    /**
     * Sync R2 manifest into src/asset_map, then Flash-Lite captions for new uploads (scheme A).
     */
    protected async syncAndCaptionUploadedAssets(uploaded: ProcessedImageAttachment[]): Promise<void> {
        if (uploaded.length === 0) return;

        await this.infrastructure.syncProjectAssetMapFromR2();

        const opts = this.getOperationOptions();
        const agentId = opts.agentId;
        const prefix = `assets/${agentId}/`;
        const descriptions: Record<string, string> = {};

        for (const att of uploaded) {
            if (!att.r2Key.startsWith(prefix)) continue;
            const rel = att.r2Key.slice(prefix.length);
            try {
                const text = await generateAssetMediaCaption(opts.env, opts.inferenceContext, att);
                if (text) descriptions[rel] = text;
            } catch (err) {
                opts.logger.warn('Asset media caption failed', {
                    rel,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        if (Object.keys(descriptions).length > 0) {
            await this.infrastructure.mergeAssetMapDescriptions(descriptions);
        }
    }

    /**
     * Handle user input during conversational code generation
     * Processes user messages and updates pendingUserInputs state
     */
    async handleUserInput(userMessage: string, images?: ImageAttachment[]): Promise<void> {
        try {
            this.logger.info('Processing user input message', { 
                messageLength: userMessage.length,
                pendingInputsCount: this.state.pendingUserInputs.length,
                hasImages: !!images && images.length > 0,
                imageCount: images?.length || 0
            });

            // Ensure template details are loaded before processing
            await this.ensureTemplateDetails();

            // Just fetch runtime errors
            const errors = await this.fetchRuntimeErrors(false, false);
            const projectUpdates = await this.getAndResetProjectUpdates();
            this.logger.info('Passing context to user conversation processor', { errors, projectUpdates });


            const conversationState = this.infrastructure.getConversationState();
            // If there are images, upload them and pass the URLs to the conversation processor
            let uploadedImages: ProcessedImageAttachment[] = [];
            if (images) {
                const usedPaths = new Set<string>();
                const agentId = this.getAgentId();
                uploadedImages = await Promise.all(
                    images.map(async (image, index) => {
                        const relativePath = uniqueAgentAssetRelativePath(image, index, usedPaths);
                        return uploadImageAsAgentAsset(this.env, agentId, image, relativePath);
                    }),
                );

                this.logger.info('Uploaded images', { uploadedImages });
                try {
                    await this.syncAndCaptionUploadedAssets(uploadedImages);
                } catch (err) {
                    this.logger.error('Failed to sync/caption assets after upload', { error: err });
                }
            }

            // Process the user message using conversational assistant
            const conversationalResponse = await this.operations.processUserMessage.execute(
                { 
                    userMessage, 
                    conversationState,
                    conversationResponseCallback: (
                        message: string,
                        conversationId: string,
                        isStreaming: boolean,
                        tool?: { name: string; status: 'start' | 'success' | 'error'; args?: Record<string, unknown> }
                    ) => {
                        // Track conversationId when deep_debug starts
                        if (tool?.name === 'deep_debug' && tool.status === 'start') {
                            this.deepDebugConversationId = conversationId;
                        }
                        
                        this.broadcast(WebSocketMessageResponses.CONVERSATION_RESPONSE, {
                            message,
                            conversationId,
                            isStreaming,
                            tool,
                        });
                    },
                    errors,
                    projectUpdates,
                    images: uploadedImages
                }, 
                this.getOperationOptions()
            );

            const { conversationResponse, conversationState: newConversationState } = conversationalResponse;
            this.logger.info('User input processed successfully', {
                responseLength: conversationResponse.userResponse.length,
            });

            this.infrastructure.setConversationState(newConversationState);
        } catch (error) {
            this.logger.error('Error processing user input', error);
            throw error;
        }
    }
}
