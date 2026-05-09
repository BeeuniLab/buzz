import { getAgentByName } from 'agents';
import { generateId } from '../utils/idGenerator';
import { StructuredLogger } from '../logger';
import { InferenceContext } from './inferutils/config.types';
import { DEFAULT_BUZZPLAY_TEMPLATE } from './planning/templateSelector';
import { TemplateDetails } from 'worker/types/project-types';
import { getTemplateDetails as fetchTemplateDetails } from '../services/templates/templateCatalog';
import { TemplateSelection } from './schemas';
import type { ImageAttachment, ProcessedImageAttachment } from '../types/image-attachment';
import { AgentState, CurrentDevState } from './core/state';
import { CodeGeneratorAgent } from './core/codingAgent';
import { ProjectType } from './core/types';

type AgentStubProps = {
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
        activeWorkflow: undefined,
        projectUpdatesAccumulator: [],
        reviewingInitiated: false,
        mvpGenerated: false,
        generatedPhases: [],
        currentDevState: CurrentDevState.IDLE,
    } as AgentState;

    const newAgent = await getAgentStub(env, newAgentId, {
        projectType: originalState.projectType,
    });

    await newAgent.setState(newState);
    return {newAgentId, newAgent};
}

type TemplateQueryResult = { templateDetails: TemplateDetails; selection: TemplateSelection; projectType: ProjectType };

async function loadTemplate(
    env: Env,
    templateName: string,
    logger: StructuredLogger,
    reason?: string,
): Promise<TemplateQueryResult> {
    logger.info(reason || `Using template ${templateName}`, { selectedTemplate: templateName });

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

export async function getTemplateForQuery(
    env: Env,
    inferenceContext: InferenceContext,
    query: string,
    projectType: ProjectType | 'auto',
    images: Array<ImageAttachment | ProcessedImageAttachment> | undefined,
    logger: StructuredLogger,
    selectedTemplate?: string,
): Promise<TemplateQueryResult> {
    void inferenceContext;
    void query;
    void projectType;
    void images;
    void selectedTemplate;

    return loadTemplate(
        env,
        DEFAULT_BUZZPLAY_TEMPLATE,
        logger,
        `Defaulting to ${DEFAULT_BUZZPLAY_TEMPLATE}`,
    );
}
