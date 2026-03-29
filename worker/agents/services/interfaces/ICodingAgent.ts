import { FileOutputType, FileConceptType, Blueprint } from "worker/agents/schemas";
import { StaticAnalysisResponse, TemplateFile } from "worker/types/project-types";
import { ProcessedImageAttachment } from "worker/types/image-attachment";
import { BehaviorType, DeepDebugResult, ProjectType } from "worker/agents/core/types";
import { RenderToolCall } from "worker/agents/operations/UserConversationProcessor";
import { WebSocketMessageType, WebSocketMessageData } from "worker/api/websocketTypes";
import { GitVersionControl } from "worker/agents/git/git";
import { OperationOptions } from "worker/agents/operations/common";

export interface ICodingAgent {
    getBehavior(): BehaviorType;

    isMVPGenerated(): boolean;

    setMVPGenerated(): boolean;

    deployPreview(clearLogs?: boolean, forceRedeploy?: boolean): Promise<string>;

    broadcast<T extends WebSocketMessageType>(msg: T, data?: WebSocketMessageData<T>): void;

    queueUserRequest(request: string, images?: ProcessedImageAttachment[]): void;

    clearConversation(): void;

    updateProjectName(newName: string): Promise<boolean>;

    setBlueprint(blueprint: Blueprint): Promise<void>;

    getProjectType(): ProjectType;

    importTemplate(templateName: string): Promise<{ templateName: string; filesImported: number; files: TemplateFile[] }>;

    getOperationOptions(): OperationOptions;

    listFiles(): FileOutputType[];

    readFiles(paths: string[]): Promise<{ files: { path: string; content: string }[] }>;

    deleteFiles(paths: string[]): Promise<{ success: boolean, error?: string }>;

    runStaticAnalysisCode(files?: string[]): Promise<StaticAnalysisResponse>;

    updateBlueprint(patch: Partial<Blueprint>): Promise<Blueprint>;

    generateFiles(
        phaseName: string,
        phaseDescription: string,
        requirements: string[],
        files: FileConceptType[]
    ): Promise<{ files: Array<{ path: string; purpose: string; diff: string }> }>;

    regenerateFileByPath(path: string, issues: string[]): Promise<{ path: string; diff: string }>;

    isCodeGenerating(): boolean;

    waitForGeneration(): Promise<void>;

    isDeepDebugging(): boolean;

    waitForDeepDebug(): Promise<void>;

    executeDeepDebug(
        issue: string,
        toolRenderer: RenderToolCall,
        streamCb: (chunk: string) => void,
        focusPaths?: string[],
    ): Promise<DeepDebugResult>;

    get git(): GitVersionControl;
}
