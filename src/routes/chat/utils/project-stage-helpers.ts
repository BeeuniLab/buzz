import type { GenerationBackend } from '@/api-types';

export interface ProjectStage {
    id: 'bootstrap' | 'blueprint' | 'code';
    title: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    metadata?: string;
}

const STAGE_TITLES: Record<'native' | 'codex', Record<ProjectStage['id'], string>> = {
    native: {
        bootstrap: 'Getting your idea ready',
        blueprint: 'Shaping the experience',
        code: 'Making it playable',
    },
    codex: {
        bootstrap: 'Getting your idea ready',
        blueprint: 'Preparing the workspace',
        code: 'Making it playable',
    },
};

function getStageTitles(generationBackend?: GenerationBackend): Record<ProjectStage['id'], string> {
    return generationBackend === 'codex' ? STAGE_TITLES.codex : STAGE_TITLES.native;
}

export function createInitialStages(generationBackend?: GenerationBackend): ProjectStage[] {
    const titles = getStageTitles(generationBackend);

    return [
        {
            id: 'bootstrap',
            title: titles.bootstrap,
            status: 'active',
        },
        {
            id: 'blueprint',
            title: titles.blueprint,
            status: 'pending',
        },
        { id: 'code', title: titles.code, status: 'pending' },
    ];
}

export const initialStages: ProjectStage[] = createInitialStages();

export function syncStageTitles(
    stages: ProjectStage[],
    generationBackend?: GenerationBackend,
): ProjectStage[] {
    const titles = getStageTitles(generationBackend);
    let changed = false;

    const nextStages = stages.map((stage) => {
        const nextTitle = titles[stage.id];
        if (stage.title === nextTitle) {
            return stage;
        }

        changed = true;
        return { ...stage, title: nextTitle };
    });

    return changed ? nextStages : stages;
}

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
