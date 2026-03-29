import { tool } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';

export function createDeployPreviewTool(
	agent: ICodingAgent,
	logger: StructuredLogger
) {
	return tool({
		name: 'deploy_preview',
		description:
			'Uploads and syncs the current application to the preview environment. After deployment, the app is live at the preview URL. CRITICAL: After deploying, use wait(20-30) to allow time for user interaction before checking results.',
		args: {},
		run: async () => {
			try {
				logger.info('Deploying preview');
				const result = await agent.deployPreview();
				logger.info('Preview deployment completed', { result });
				return { message: result };
			} catch (error) {
				return {
					error:
						error instanceof Error
							? `Failed to deploy preview: ${error.message}`
							: 'Unknown error occurred while deploying preview',
				};
			}
		},
	});
}
