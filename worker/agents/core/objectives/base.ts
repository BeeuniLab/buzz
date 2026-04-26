import { BaseProjectState } from '../state';
import {
	ProjectType,
	ExportResult,
	ExportOptions,
	DeployResult,
	DeployOptions,
} from '../types';
import { AgentComponent } from '../AgentComponent';
import type { AgentInfrastructure } from '../AgentCore';
import { WebSocketMessageResponses } from '../../constants';
import { AppService } from '../../../database/services/AppService';
import {
	getAdditionalExportStrategy,
	type AdditionalExportStrategy,
	type ExportContext,
} from './strategies';

export class ProjectObjective<
	TState extends BaseProjectState = BaseProjectState,
> extends AgentComponent<TState> {
	private projectType: ProjectType;
	private additionalExportStrategy: AdditionalExportStrategy | null;

	constructor(
		infrastructure: AgentInfrastructure<TState>,
		projectType: ProjectType,
	) {
		super(infrastructure);
		this.projectType = projectType;
		this.additionalExportStrategy = getAdditionalExportStrategy(projectType);
	}

	getType(): ProjectType {
		return this.projectType;
	}

	async deploy(options?: DeployOptions): Promise<DeployResult> {
		const target = options?.target ?? 'platform';
		if (target !== 'platform') {
			return {
				success: false,
				target,
				error: `Unsupported deployment target "${target}"`,
			};
		}

		try {
			this.logger.info('Deploying to Workers for Platforms', {
				projectType: this.projectType,
			});

			if (!this.state.sandboxInstanceId) {
				this.logger.info('No sandbox instance, deploying to sandbox first');
				await this.deploymentManager.deployToSandbox();

				if (!this.state.sandboxInstanceId) {
					this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
						message: 'Deployment failed: Sandbox service unavailable',
						error: 'Sandbox service unavailable',
					});
					return {
						success: false,
						target,
						error: 'Failed to deploy to sandbox service',
					};
				}
			}

			const result = await this.deploymentManager.deployToCloudflare({
				target,
				callbacks: {
					onStarted: (data) =>
						this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_STARTED, data),
					onCompleted: (data) =>
						this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_COMPLETED, data),
					onError: (data) =>
						this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, data),
				},
			});

			if (result.deploymentUrl && result.deploymentId) {
				const appService = new AppService(this.env);
				await appService.updateDeploymentId(this.getAgentId(), result.deploymentId, {
					publishIfFirstDeployment: true,
				});
				this.logger.info('Updated deployment ID in database', {
					deploymentId: result.deploymentId,
				});
			}

			return {
				success: !!result.deploymentUrl,
				target,
				url: result.deploymentUrl || undefined,
				metadata: {
					deploymentId: result.deploymentId,
					workersUrl: result.deploymentUrl,
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown deployment error';
			this.logger.error('Deployment failed', error);
			this.broadcast(WebSocketMessageResponses.CLOUDFLARE_DEPLOYMENT_ERROR, {
				message: 'Deployment failed',
				error: message,
			});
			return { success: false, target, error: message };
		}
	}

	async export(options: ExportOptions): Promise<ExportResult> {
		if (this.additionalExportStrategy?.getSupportedKinds().includes(options.kind)) {
			return this.additionalExportStrategy.export(options, this.createExportContext());
		}

		return {
			success: false,
			error: `Export kind '${options.kind}' not supported for ${this.projectType}`,
		};
	}

	private createExportContext(): ExportContext {
		return {
			env: this.env,
			logger: this.logger,
			agentId: this.getAgentId(),
			state: this.state,
			broadcast: this.broadcast.bind(this),
		};
	}
}
