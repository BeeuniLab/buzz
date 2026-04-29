import { getAgentByName } from 'agents';
import { generateId } from '../utils/idGenerator';
import { StructuredLogger } from '../logger';
import { InferenceContext } from './inferutils/config.types';
import { selectTemplate } from './planning/templateSelector';
import { TemplateDetails, TemplateInfo } from 'worker/types/project-types';
import { listTemplates, getTemplateDetails as fetchTemplateDetails } from '../services/templates/templateCatalog';
import { createScratchTemplateDetails } from './utils/templates';
import { TemplateSelection } from './schemas';
import type { ImageAttachment } from '../types/image-attachment';
import { AgentState, CurrentDevState } from './core/state';
import { CodeGeneratorAgent } from './core/codingAgent';
import { BehaviorType, ProjectType } from './core/types';

type AgentStubProps = {
    behaviorType?: BehaviorType;
    projectType?: ProjectType;
    readOnlyMode?: boolean;
};

export async function getAgentStub(
    env: Env, 
    agentId: string,
    props?: AgentStubProps
) : Promise<DurableObjectStub<CodeGeneratorAgent>> {
    const options = props ? { props } : undefined;
    return getAgentByName<Env, CodeGeneratorAgent>(env.CodeGenObject, agentId, options);
}

export async function getAgentStubLightweight(env: Env, agentId: string) : Promise<DurableObjectStub<CodeGeneratorAgent>> {
    return getAgentByName<Env, CodeGeneratorAgent>(env.CodeGenObject, agentId, {
        props: { readOnlyMode: true }
    });
}

export async function getAgentState(env: Env, agentId: string) : Promise<AgentState> {
    const agentInstance = await getAgentStub(env, agentId);
    return await agentInstance.getFullState() as AgentState;
}

export async function cloneAgent(env: Env, agentId: string) : Promise<{newAgentId: string, newAgent: DurableObjectStub<CodeGeneratorAgent>}> {
    const agentInstance = await getAgentStub(env, agentId);
    if (!agentInstance || !await agentInstance.isInitialized()) {
        throw new Error(`Agent ${agentId} not found`);
    }
    const newAgentId = generateId();

    const originalState = await agentInstance.getFullState();

    const newState: AgentState = {
        ...originalState,
        sessionId: newAgentId,
        pendingUserInputs: [],
        shouldBeGenerating: false,
        projectUpdatesAccumulator: [],
        reviewingInitiated: false,
        mvpGenerated: false,
        ...(originalState.behaviorType === 'phasic' ? {
            generatedPhases: [],
            currentDevState: CurrentDevState.IDLE,
        } : {}),
    } as AgentState;

    const newAgent = await getAgentStub(env, newAgentId, {
        behaviorType: originalState.behaviorType,
        projectType: originalState.projectType,
    });

    await newAgent.setState(newState);
    return {newAgentId, newAgent};
}

type TemplateQueryResult = { templateDetails: TemplateDetails; selection: TemplateSelection; projectType: ProjectType };

type TemplateQueryArgs = {
    env: Env;
    inferenceContext: InferenceContext;
    query: string;
    projectType: ProjectType | 'auto';
    images: ImageAttachment[] | undefined;
    logger: StructuredLogger;
    selectedTemplate?: string;
};

function getSelectableTemplates(templates: TemplateInfo[]): TemplateInfo[] {
    return templates.filter(
        t => !t.disabled && !t.hiddenFromSelection && !t.name.includes('minimal')
    );
}

async function handleGeneralType(): Promise<TemplateQueryResult> {
    const scratch = createScratchTemplateDetails();
    const selection: TemplateSelection = {
        selectedTemplateName: null,
        reasoning: 'General (from-scratch) mode: no template selected',
        useCase: 'General',
        complexity: 'moderate',
        styleSelection: 'Custom',
        projectType: 'general',
    } as TemplateSelection;
    return { templateDetails: scratch, selection, projectType: 'general' };
}

async function handleUserSelectedTemplate(
    env: Env,
    templateName: string,
    logger: StructuredLogger,
    reason?: string,
): Promise<TemplateQueryResult> {
    logger.info(reason || 'Using user-specified template, bypassing AI selection', { selectedTemplate: templateName });

    const detailsResponse = await fetchTemplateDetails(env.TEMPLATES_BUCKET, templateName);
    if (!detailsResponse.success || !detailsResponse.templateDetails) {
        throw new Error(`Failed to get template details for: ${templateName}: ${detailsResponse.error}`);
    }

    const templateDetails = detailsResponse.templateDetails;
    const selection: TemplateSelection = {
        selectedTemplateName: templateName,
        reasoning: reason || `User-specified template: ${templateName}`,
        useCase: templateDetails.description?.selection || templateName,
        complexity: 'moderate',
        styleSelection: 'Custom',
        projectType: templateDetails.projectType || 'app',
    } as TemplateSelection;

    return {
        templateDetails,
        selection,
        projectType: (templateDetails.projectType || 'app') as ProjectType,
    };
}

async function handleAITemplateSelection(args: Omit<TemplateQueryArgs, 'selectedTemplate'>): Promise<TemplateQueryResult> {
    const { env, inferenceContext, query, projectType, images, logger } = args;

    const catalogResponse = await listTemplates(env.TEMPLATES_BUCKET);
    if (!catalogResponse.success) {
        throw new Error(`Failed to fetch templates: ${catalogResponse.error}`);
    }

    const selectableTemplates = getSelectableTemplates(catalogResponse.templates);
    if (selectableTemplates.length === 1) {
        const templateName = selectableTemplates[0].name;
        return handleUserSelectedTemplate(
            env,
            templateName,
            logger,
            `Only one selectable template is available; auto-selected ${templateName}`,
        );
    }

    const selection = await selectTemplate({
        env,
        query,
        projectType,
        availableTemplates: selectableTemplates,
        inferenceContext,
        images,
    });

    if (!selection.selectedTemplateName) {
        logger.info('AI selected no template, using scratch');
        return handleGeneralType();
    }

    const detailsResponse = await fetchTemplateDetails(env.TEMPLATES_BUCKET, selection.selectedTemplateName);
    if (!detailsResponse.success || !detailsResponse.templateDetails) {
        logger.warn(`Failed to get details for selected template ${selection.selectedTemplateName}, falling back to scratch`, { error: detailsResponse.error });
        return handleGeneralType();
    }

    return {
        templateDetails: detailsResponse.templateDetails,
        selection,
        projectType: (detailsResponse.templateDetails.projectType || selection.projectType || 'app') as ProjectType,
    };
}

export async function getTemplateForQuery(
    env: Env,
    inferenceContext: InferenceContext,
    query: string,
    projectType: ProjectType | 'auto',
    images: ImageAttachment[] | undefined,
    logger: StructuredLogger,
    selectedTemplate?: string,
): Promise<TemplateQueryResult> {
    // Flow 1: General type - start from scratch
    if (projectType === 'general') {
        return handleGeneralType();
    }

    // Flow 2: User-specified template - bypass AI selection
    if (selectedTemplate && selectedTemplate !== 'auto') {
        return handleUserSelectedTemplate(env, selectedTemplate, logger);
    }

    // Flow 3: AI template selection
    return handleAITemplateSelection({ env, inferenceContext, query, projectType, images, logger });
}
