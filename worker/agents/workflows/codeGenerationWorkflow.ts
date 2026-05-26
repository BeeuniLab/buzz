import {
	WorkflowEntrypoint,
	type WorkflowEvent,
	type WorkflowStep,
	type WorkflowStepConfig,
} from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { getAgentStub, getTemplateForQuery } from '../index';
import type { DeployOptions, PlayableAspectRatio, ProjectType } from '../core/types';
import type { InferenceContext } from '../inferutils/config.types';
import type { ProcessedImageAttachment } from '../../types/image-attachment';
import { createLogger } from '../../logger';
import { AppService } from '../../database';
import { generateAppTitle } from '../../utils/appTitleGenerator';
import { WebSocketMessageResponses } from '../constants';

const logger = createLogger('CodeGenerationWorkflow');

const LONG_STEP = {
	retries: {
		limit: 3,
		delay: '10 seconds',
		backoff: 'exponential' as const,
	},
	timeout: '30 minutes',
} satisfies WorkflowStepConfig;

const RETRYABLE_HTTP_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_HTTP_STATUS_CODES = new Set([400, 401, 403, 404, 422]);

const RETRYABLE_ERROR_PATTERNS = [
	'rate limit',
	'too many requests',
	'timed out',
	'timeout',
	'temporarily unavailable',
	'service unavailable',
	'bad gateway',
	'gateway timeout',
	'internal server error',
	'overloaded',
	'connection reset',
	'connection refused',
	'network error',
	'socket hang up',
	'econnreset',
	'etimedout',
	'ehostunreach',
	'enetunreach',
];

const NON_RETRYABLE_ERROR_PATTERNS = [
	'background agent encountered an issue',
	'background generator requires',
	'background session persistence is missing',
	'could not finish creating the playable version',
	'sandbox service does not support background generator environment injection',
	'invalid api key',
	'incorrect api key',
	'authentication failed',
	'unauthorized',
	'forbidden',
	'model not found',
	'unknown model',
	'unsupported model',
	'no such model',
	'login required',
	'forced_login_method',
	'requires_openai_auth',
	'must set up mfa',
	'active credentials don',
];

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function extractHttpStatusCode(message: string): number | null {
	const match = message.match(
		/(?:status(?:[_ ]?code)?|http(?: response)?)["'\s:=]+(\d{3})\b/i,
	);
	return match ? Number(match[1]) : null;
}

function includesAny(message: string, patterns: string[]): boolean {
	return patterns.some((pattern) => message.includes(pattern));
}

function shouldFailWithoutRetry(error: unknown): boolean {
	const message = getErrorMessage(error);
	const normalized = message.toLowerCase();
	const statusCode = extractHttpStatusCode(message);

	if (statusCode !== null) {
		if (RETRYABLE_HTTP_STATUS_CODES.has(statusCode)) return false;
		if (NON_RETRYABLE_HTTP_STATUS_CODES.has(statusCode)) return true;
	}

	if (includesAny(normalized, RETRYABLE_ERROR_PATTERNS)) {
		return false;
	}

	return includesAny(normalized, NON_RETRYABLE_ERROR_PATTERNS);
}

function rethrowForWorkflowRetry(error: unknown): never {
	const message = getErrorMessage(error);
	if (shouldFailWithoutRetry(error)) {
		throw new NonRetryableError(message);
	}
	throw (error instanceof Error ? error : new Error(message));
}

type BaseWorkflowParams = {
	agentId: string;
	projectType: ProjectType;
	recoveryWorkflowId?: string;
};

type WorkflowInferenceContext = Omit<InferenceContext, 'abortSignal'>;

export type CreateProjectWorkflowParams = BaseWorkflowParams & {
	kind: 'create_project';
	query: string;
	fallbackTitle?: string;
	hostname: string;
	inferenceContext: WorkflowInferenceContext;
	language?: string;
	frameworks?: string[];
	selectedTemplate?: string;
	playableAspectRatio?: PlayableAspectRatio;
	requestedProjectType: ProjectType | 'auto';
	images?: ProcessedImageAttachment[];
};

export type ExistingProjectWorkflowParams = BaseWorkflowParams & {
	kind: 'generate_all' | 'resume_generation';
};

export type DeployProjectWorkflowParams = BaseWorkflowParams & {
	kind: 'deploy_project';
	options?: DeployOptions;
};

export type DeployPreviewWorkflowParams = BaseWorkflowParams & {
	kind: 'deploy_preview';
	clearLogs?: boolean;
	forceRedeploy?: boolean;
};

export type UserInputWorkflowParams = BaseWorkflowParams & {
	kind: 'user_input';
	message: string;
	images?: ProcessedImageAttachment[];
};

export type CodeGenerationWorkflowParams =
	| CreateProjectWorkflowParams
	| ExistingProjectWorkflowParams
	| DeployProjectWorkflowParams
	| DeployPreviewWorkflowParams
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

			if (params.kind === 'deploy_project') {
				await this.runDeployProjectJob(event, step, params);
				await this.updateAgentWorkflowStatus(params, workflowId, 'completed', 'Playable update workflow completed');
				return { ok: true, kind: params.kind, agentId: params.agentId };
			}

			if (params.kind === 'deploy_preview') {
				await this.runDeployPreviewJob(event, step, params);
				await this.updateAgentWorkflowStatus(params, workflowId, 'completed', 'Preview workflow completed');
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
				'Selecting template and initializing project',
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
				projectType: templateInfo.projectType,
			});

			await agent.initializeFromWorkflow({
				query: params.query,
				language: params.language,
				frameworks: params.frameworks,
				playableAspectRatio: params.playableAspectRatio,
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

		await step.do('generate app title', LONG_STEP, async () => {
			try {
				const title = await generateAppTitle(this.env, params.query);
				if (!title || title === params.fallbackTitle) {
					logger.warn('App title generation skipped after workflow attempt', {
						agentId: params.agentId,
						reason: !title ? 'empty_title' : 'same_as_fallback',
						fallbackTitle: params.fallbackTitle,
					});
					return { updated: false, reason: !title ? 'empty_title' : 'same_as_fallback' };
				}

				const appService = new AppService(this.env);
				const updated = await appService.updateApp(params.agentId, { title });
				if (!updated) {
					logger.warn('Generated app title but failed to update app', {
						agentId: params.agentId,
						title,
					});
					return { updated: false, reason: 'update_failed' };
				}

				const agent = await getAgentStub(this.env, params.agentId, {
					projectType: selected.projectType,
				});
				await agent.broadcast(WebSocketMessageResponses.APP_TITLE_UPDATED, {
					agentId: params.agentId,
					title,
				});
				logger.info('Generated app title synced from workflow', {
					agentId: params.agentId,
					title,
				});
				return { updated: true, title };
			} catch (error) {
				logger.warn('App title generation skipped in workflow', {
					agentId: params.agentId,
					error: error instanceof Error ? error.message : String(error),
				});
				return { updated: false, reason: 'error' };
			}
		});

		if (params.images && params.images.length > 0) {
			await step.do('sync uploaded assets', LONG_STEP, async () => {
				await this.updateAgentWorkflowStatus(
					params,
					event.instanceId,
					'running',
					'Syncing uploaded assets',
				);
				const agent = await getAgentStub(this.env, params.agentId, {
					projectType: selected.projectType,
				});
				await agent.syncUploadedAssets(params.images ?? []);
				return { synced: params.images?.length ?? 0 };
			});
		}

		await step.do('generate project files', LONG_STEP, async () => {
			try {
				await this.updateAgentWorkflowStatus(
					params,
					event.instanceId,
					'running',
					'Preparing the workspace',
				);
				const agent = await getAgentStub(this.env, params.agentId, {
					projectType: selected.projectType,
				});
				await agent.runGenerationFromWorkflow('create_project', event.instanceId, params.recoveryWorkflowId);
				return { generated: true };
			} catch (error) {
				rethrowForWorkflowRetry(error);
			}
		});
	}

	private async runExistingProjectJob(
		event: Readonly<WorkflowEvent<CodeGenerationWorkflowParams>>,
		step: WorkflowStep,
		params: ExistingProjectWorkflowParams,
	): Promise<void> {
		await step.do(`run ${params.kind}`, LONG_STEP, async () => {
			try {
				const agent = await getAgentStub(this.env, params.agentId, {
					projectType: params.projectType,
				});
				await agent.runGenerationFromWorkflow(params.kind, event.instanceId, params.recoveryWorkflowId);
				return { generated: true, workflowInstanceId: event.instanceId };
			} catch (error) {
				rethrowForWorkflowRetry(error);
			}
		});
	}

	private async runUserInputJob(
		event: Readonly<WorkflowEvent<CodeGenerationWorkflowParams>>,
		step: WorkflowStep,
		params: UserInputWorkflowParams,
	): Promise<void> {
		await step.do('process user input and continue generation', LONG_STEP, async () => {
			try {
				const agent = await getAgentStub(this.env, params.agentId, {
					projectType: params.projectType,
				});
				await agent.runUserInputFromWorkflow(params.message, params.images, event.instanceId, {
					recoveryWorkflowId: params.recoveryWorkflowId,
				});
				return { processed: true, workflowInstanceId: event.instanceId };
			} catch (error) {
				rethrowForWorkflowRetry(error);
			}
		});
	}

	private async runDeployProjectJob(
		event: Readonly<WorkflowEvent<CodeGenerationWorkflowParams>>,
		step: WorkflowStep,
		params: DeployProjectWorkflowParams,
	): Promise<void> {
		const deployResult = await step.do('validate and deploy playable', LONG_STEP, async (): Promise<{ success: boolean; error?: string }> => {
			const agent = await getAgentStub(this.env, params.agentId, {
				projectType: params.projectType,
			});
			const result = await (
				agent.runDeployProjectFromWorkflow(event.instanceId, params.options) as unknown as Promise<{
					success: boolean;
					error?: string;
				}>
			);
			return {
				success: result.success,
				error: result.error,
			};
		});

		if (!deployResult.success) {
			throw new Error(deployResult.error || 'Playable update failed');
		}
	}

	private async runDeployPreviewJob(
		event: Readonly<WorkflowEvent<CodeGenerationWorkflowParams>>,
		step: WorkflowStep,
		params: DeployPreviewWorkflowParams,
	): Promise<void> {
		await step.do('deploy preview sandbox', LONG_STEP, async () => {
			const agent = await getAgentStub(this.env, params.agentId, {
				projectType: params.projectType,
			});
			await agent.runDeployPreviewFromWorkflow(
				event.instanceId,
				params.clearLogs ?? true,
				params.forceRedeploy ?? false,
			);
			return { deployed: true, workflowInstanceId: event.instanceId };
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
