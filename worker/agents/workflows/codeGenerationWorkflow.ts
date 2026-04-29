import {
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
	type WorkflowStepConfig,
} from 'cloudflare:workers';
import { getAgentStub, getTemplateForQuery } from '../index';
import type { BehaviorType, ProjectType } from '../core/types';
import type { InferenceContext } from '../inferutils/config.types';
import type { ProcessedImageAttachment } from '../../types/image-attachment';
import { createLogger } from '../../logger';

const logger = createLogger('CodeGenerationWorkflow');

const LONG_STEP = {
	retries: {
		limit: 3,
		delay: '10 seconds',
		backoff: 'exponential' as const,
	},
	timeout: '30 minutes',
} satisfies WorkflowStepConfig;

type BaseWorkflowParams = {
	agentId: string;
	behaviorType: BehaviorType;
	projectType: ProjectType;
};

type WorkflowInferenceContext = Omit<InferenceContext, 'abortSignal'>;

export type CreateProjectWorkflowParams = BaseWorkflowParams & {
	kind: 'create_project';
	query: string;
	hostname: string;
	inferenceContext: WorkflowInferenceContext;
	language?: string;
	frameworks?: string[];
	selectedTemplate?: string;
	requestedProjectType: ProjectType | 'auto';
	images?: ProcessedImageAttachment[];
};

export type ExistingProjectWorkflowParams = BaseWorkflowParams & {
	kind: 'generate_all' | 'resume_generation';
};

export type UserInputWorkflowParams = BaseWorkflowParams & {
	kind: 'user_input';
	message: string;
	images?: ProcessedImageAttachment[];
};

export type CodeGenerationWorkflowParams =
	| CreateProjectWorkflowParams
	| ExistingProjectWorkflowParams
	| UserInputWorkflowParams;

export class CodeGenerationWorkflow extends WorkflowEntrypoint<Env, CodeGenerationWorkflowParams> {
	async run(
		event: Readonly<WorkflowEvent<CodeGenerationWorkflowParams>>,
		step: WorkflowStep,
	): Promise<unknown> {
		const params = event.payload;
		const workflowId = event.instanceId;

		try {
			await this.updateAgentWorkflowStatus(params, workflowId, 'running', `Workflow ${params.kind} started`);

			if (params.kind === 'create_project') {
				await this.runCreateProject(event, step, params);
				await this.updateAgentWorkflowStatus(params, workflowId, 'completed', 'Create project workflow completed');
				return { ok: true, kind: params.kind, agentId: params.agentId };
			}

			if (params.kind === 'user_input') {
				await this.runUserInputJob(event, step, params);
				await this.updateAgentWorkflowStatus(params, workflowId, 'completed', 'User input workflow completed');
				return { ok: true, kind: params.kind, agentId: params.agentId };
			}

			await this.runExistingProjectJob(event, step, params);
			await this.updateAgentWorkflowStatus(params, workflowId, 'completed', `Workflow ${params.kind} completed`);
			return { ok: true, kind: params.kind, agentId: params.agentId };
		} catch (error) {
			await this.updateAgentWorkflowStatus(
				params,
				workflowId,
				'failed',
				error instanceof Error ? error.message : String(error),
			);
			throw error;
		}
	}

	private async runCreateProject(
		event: Readonly<WorkflowEvent<CodeGenerationWorkflowParams>>,
		step: WorkflowStep,
		params: CreateProjectWorkflowParams,
	): Promise<void> {
		const selected = await step.do('select template and initialize agent', LONG_STEP, async () => {
			await this.updateAgentWorkflowStatus(
				params,
				event.instanceId,
				'running',
				'Selecting template and generating blueprint',
			);
			const templateInfo = await getTemplateForQuery(
				this.env,
				params.inferenceContext,
				params.query,
				params.requestedProjectType,
				params.images,
				logger,
				params.selectedTemplate,
			);

			const agent = await getAgentStub(this.env, params.agentId, {
				behaviorType: params.behaviorType,
				projectType: templateInfo.projectType,
			});

			await agent.initializeFromWorkflow({
				query: params.query,
				language: params.language,
				frameworks: params.frameworks,
				hostname: params.hostname,
				inferenceContext: params.inferenceContext,
				images: params.images,
				templateInfo: {
					templateDetails: templateInfo.templateDetails,
					selection: templateInfo.selection,
				},
			});

			return {
				projectType: templateInfo.projectType,
				templateName: templateInfo.templateDetails.name,
			};
		});

		if (params.images && params.images.length > 0) {
			await step.do('sync uploaded asset captions', LONG_STEP, async () => {
				await this.updateAgentWorkflowStatus(
					params,
					event.instanceId,
					'running',
					'Syncing uploaded assets',
				);
				const agent = await getAgentStub(this.env, params.agentId, {
					behaviorType: params.behaviorType,
					projectType: selected.projectType,
				});
				await agent.syncAndCaptionUploadedAssets(params.images ?? [], params.inferenceContext);
				return { synced: params.images?.length ?? 0 };
			});
		}

		await step.do('generate project files', LONG_STEP, async () => {
			await this.updateAgentWorkflowStatus(
				params,
				event.instanceId,
				'running',
				'Generating project files',
			);
			const agent = await getAgentStub(this.env, params.agentId, {
				behaviorType: params.behaviorType,
				projectType: selected.projectType,
			});
			await agent.runGenerationFromWorkflow('create_project', event.instanceId);
			return { generated: true };
		});
	}

	private async runExistingProjectJob(
		event: Readonly<WorkflowEvent<CodeGenerationWorkflowParams>>,
		step: WorkflowStep,
		params: ExistingProjectWorkflowParams,
	): Promise<void> {
		await step.do(`run ${params.kind}`, LONG_STEP, async () => {
			const agent = await getAgentStub(this.env, params.agentId, {
				behaviorType: params.behaviorType,
				projectType: params.projectType,
			});
			await agent.runGenerationFromWorkflow(params.kind, event.instanceId);
			return { generated: true, workflowInstanceId: event.instanceId };
		});
	}

	private async runUserInputJob(
		event: Readonly<WorkflowEvent<CodeGenerationWorkflowParams>>,
		step: WorkflowStep,
		params: UserInputWorkflowParams,
	): Promise<void> {
		await step.do('process user input and continue generation', LONG_STEP, async () => {
			const agent = await getAgentStub(this.env, params.agentId, {
				behaviorType: params.behaviorType,
				projectType: params.projectType,
			});
			await agent.runUserInputFromWorkflow(params.message, params.images, event.instanceId);
			return { processed: true, workflowInstanceId: event.instanceId };
		});
	}

	private async updateAgentWorkflowStatus(
		params: CodeGenerationWorkflowParams,
		workflowId: string,
		status: 'queued' | 'running' | 'failed' | 'completed',
		message: string,
	): Promise<void> {
		try {
			const agent = await getAgentStub(this.env, params.agentId, {
				behaviorType: params.behaviorType,
				projectType: params.projectType,
			});
			await agent.updateWorkflowStatus({
				workflowId,
				kind: params.kind,
				status,
				message,
			});
		} catch (error) {
			logger.warn('Unable to update agent workflow status', {
				agentId: params.agentId,
				workflowId,
				status,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
