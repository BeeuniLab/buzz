import { FileOutputType } from "worker/agents/schemas";
import { BaseSandboxService } from "worker/services/sandbox/BaseSandboxService";
import { ExecuteCommandsResponse, PreviewType, RuntimeError } from "worker/services/sandbox/sandboxTypes";
import { StaticAnalysisResponse, TemplateFile } from "worker/types/project-types";
import { ProcessedImageAttachment } from "worker/types/image-attachment";
import { DeploymentTarget, ProjectType, QueueRequestOptions } from "worker/agents/core/types";
import { WebSocketMessageType, WebSocketMessageData } from "worker/api/websocketTypes";
import { GitVersionControl } from "worker/agents/git/git";

export interface ICodingAgent {
    isMVPGenerated(): boolean;

    setMVPGenerated(): boolean;

    getLogs(reset?: boolean, durationSeconds?: number): Promise<string>;

    fetchRuntimeErrors(clear?: boolean): Promise<RuntimeError[]>;

    deployToSandbox(files?: FileOutputType[], redeploy?: boolean, commitMessage?: string, clearLogs?: boolean): Promise<PreviewType | null>;

    deployPreview(clearLogs?: boolean, forceRedeploy?: boolean): Promise<string>;

    releasePreviewSandbox(reason?: string): Promise<boolean>;

    broadcast<T extends WebSocketMessageType>(msg: T, data?: WebSocketMessageData<T>): void;

    deployToCloudflare(target?: DeploymentTarget): Promise<{ deploymentUrl?: string; workersUrl?: string } | null>;

    queueUserRequest(request: string, images?: ProcessedImageAttachment[], options?: QueueRequestOptions): Promise<void>;

    clearConversation(): void;

    updateProjectName(newName: string): Promise<boolean>;

    getProjectType(): ProjectType;

    importTemplate(templateName: string): Promise<{ templateName: string; filesImported: number; files: TemplateFile[] }>;

    listFiles(): FileOutputType[];

    readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }>;

    deleteFiles(paths: string[]): Promise<{ success: boolean, error?: string }>;

    runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse>;

    execCommands(commands: string[], shouldSave: boolean, timeout?: number): Promise<ExecuteCommandsResponse>;

    isCodeGenerating(): boolean;

    isConversationProcessing(): boolean;

    hasActivePersistedAppTask(): boolean;

    waitForGeneration(): Promise<void>;

    get git(): GitVersionControl;

    getSandboxServiceClient(): BaseSandboxService;
}
