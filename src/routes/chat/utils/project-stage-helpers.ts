export interface ProjectStage {
    id: 'bootstrap' | 'blueprint' | 'code';
    title: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    metadata?: string;
    queuePosition?: number;
}

const STAGE_TITLES: Record<ProjectStage['id'], string> = {
    bootstrap: 'Getting your idea ready',
    blueprint: 'Preparing the workspace',
    code: 'Making it playable',
};

export function createInitialStages(): ProjectStage[] {
    return [
        {
            id: 'bootstrap',
            title: STAGE_TITLES.bootstrap,
            status: 'active',
        },
        {
            id: 'blueprint',
            title: STAGE_TITLES.blueprint,
            status: 'pending',
        },
        { id: 'code', title: STAGE_TITLES.code, status: 'pending' },
    ];
}

export const initialStages: ProjectStage[] = createInitialStages();

/**
 * Update a specific stage's status and metadata
 */
export function updateStage(
    stages: ProjectStage[],
    stageId: ProjectStage['id'],
    updates: Partial<Omit<ProjectStage, 'id'>>
): ProjectStage[] {
    return stages.map(stage =>
        stage.id === stageId
            ? { ...stage, ...updates }
            : stage
    );
}

/**
 * Complete multiple stages at once
 */
export function completeStages(
    stages: ProjectStage[],
    stageIds: ProjectStage['id'][]
): ProjectStage[] {
    return stages.map(stage =>
        stageIds.includes(stage.id)
            ? { ...stage, status: 'completed' as const }
            : stage
    );
}

/**
 * Get the status of a specific stage
 */
export function getStageStatus(
    stages: ProjectStage[],
    stageId: ProjectStage['id']
): ProjectStage['status'] | undefined {
    return stages.find(stage => stage.id === stageId)?.status;
}

/**
 * Check if a stage is completed
 */
export function isStageCompleted(
    stages: ProjectStage[],
    stageId: ProjectStage['id']
): boolean {
    return getStageStatus(stages, stageId) === 'completed';
}
