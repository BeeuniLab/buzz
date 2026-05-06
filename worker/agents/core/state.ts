import type { PhasicBlueprint, AgenticBlueprint, PhaseConceptType ,
    FileOutputType,
    Blueprint,
} from '../schemas';
import type { InferenceMetadata } from '../inferutils/config.types';
import { BehaviorType, GenerationBackend, Plan, ProjectType } from './types';
import type { InitialUserAttachment } from '../../types/image-attachment';

export interface FileState extends FileOutputType {
    lastDiff: string;
}

export interface FileServingToken {
    token: string;
    createdAt: number;
}

export interface ActiveAppTask {
    type: 'generation' | 'conversation' | 'deep_debug';
    startedAt: number;
}

export interface ActiveWorkflowTask {
    id: string;
    kind: 'create_project' | 'generate_all' | 'resume_generation' | 'user_input' | 'deploy_project' | 'deploy_preview';
    status: 'queued' | 'running' | 'failed';
    message?: string;
    startedAt: number;
    updatedAt: number;
}

export interface PhaseState extends PhaseConceptType {
    // deploymentNeeded: boolean;
    completed: boolean;
}

export enum CurrentDevState {
    IDLE,
    PHASE_GENERATING,
    PHASE_IMPLEMENTING,
    REVIEWING,
    FINALIZING,
}

export const MAX_PHASES = 10;

/** Common state fields for all agent behaviors */
export interface BaseProjectState {
    behaviorType: BehaviorType;
    projectType: ProjectType;
    generationBackend?: GenerationBackend;
    
    // Identity
    projectName: string;
    query: string;
    initialUserAttachments?: InitialUserAttachment[];
    sessionId: string;
    hostname: string;

    blueprint: Blueprint;

    templateName: string | 'custom';
    
    // Inference context
    readonly metadata: InferenceMetadata;
    
    // Generation control
    shouldBeGenerating: boolean;
    activeAppTask?: ActiveAppTask;
    activeWorkflow?: ActiveWorkflowTask;
    lastUserStopAt?: number;
    deletedAt?: number;
    
    // Common file storage
    sandboxInstanceId?: string;
    generatedFilesMap: Record<string, FileState>;
    generatedFilesRevision?: number;
    lastPlayableDeploymentRevision?: number;
    lastPlayableDeploymentAt?: number;
    lastPlayableDeploymentId?: string;
    lastPlayableDeploymentUrl?: string;
    
    // Common infrastructure
    fileServingToken?: FileServingToken;
    commandsHistory?: string[];
    lastPackageJson?: string;
    pendingUserInputs: string[];
    projectUpdatesAccumulator: string[];
    
    // Deep debug
    lastDeepDebugTranscript: string | null;

    mvpGenerated: boolean;
    reviewingInitiated: boolean;
}

/** Phasic agent state */
export interface PhasicState extends BaseProjectState {
    behaviorType: 'phasic';
    blueprint: PhasicBlueprint;
    generatedPhases: PhaseState[];
    
    phasesCounter: number;
    currentDevState: CurrentDevState;
    reviewCycles?: number;
    currentPhase?: PhaseConceptType;
}

export interface WorkflowMetadata {
    name: string;
    description: string;
    params: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'object';
        description: string;
        example?: unknown;
        required: boolean;
    }>;
    bindings?: {
        envVars?: Record<string, {
            type: 'string';
            description: string;
            default?: string;
            required?: boolean;
        }>;
        secrets?: Record<string, {
            type: 'secret';
            description: string;
            required?: boolean;
        }>;
        resources?: Record<string, {
            type: 'kv' | 'r2' | 'd1' | 'queue' | 'ai';
            description: string;
            required?: boolean;
        }>;
    };
}

/** Agentic agent state */
export interface AgenticState extends BaseProjectState {
    behaviorType: 'agentic';
    blueprint: AgenticBlueprint;
    currentPlan: Plan;
}

export type AgentState = PhasicState | AgenticState;
