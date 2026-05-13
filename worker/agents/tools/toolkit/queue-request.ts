import { tool, t } from '../types';
import { StructuredLogger } from '../../../logger';
import { ICodingAgent } from 'worker/agents/services/interfaces/ICodingAgent';
import type { ProcessedImageAttachment } from 'worker/types/image-attachment';
import { formatUploadedAssetContext } from 'worker/agents/utils/assetContext';

export function createQueueRequestTool(
	agent: ICodingAgent,
	logger: StructuredLogger,
	currentUploadedAssets?: ProcessedImageAttachment[],
) {
	return tool({
		name: 'queue_request',
		description:
			'Queue up modification requests or changes, to be implemented in the next development phase. Use change_scope="major" only when the request changes the core product direction, core gameplay, or primary user experience.',
		args: {
			modificationRequest: t.string().describe("The changes needed to be made to the app. Please don't supply any code level or implementation details. Provide detailed requirements and description of the changes you want to make."),
			change_scope: t.enum(['minor', 'major']).default('minor').describe('Use "minor" for styling, tuning, bug fixes, small features, or asset swaps. Use "major" for core gameplay/product direction changes such as changing a snake game into an open-world explorer.'),
		},
		run: async ({ modificationRequest, change_scope }) => {
			const changeScope = change_scope === 'major' ? 'major' : 'minor';
			logger.info('Received app edit request', {
				modificationRequest,
				change_scope: changeScope,
			});
			const normalizedRequest = changeScope === 'major'
				? `CURRENT PRODUCT DIRECTION OVERRIDE: ${modificationRequest}\nThis supersedes any conflicting older prompt, blueprint, or phase plan. Preserve the user's new direction and do not revert to the previous core concept.`
				: modificationRequest;
			const assetContext = formatUploadedAssetContext(currentUploadedAssets);
			const requestWithAssets = assetContext
				? `${normalizedRequest}\n\n${assetContext}`
				: normalizedRequest;
			await agent.queueUserRequest(requestWithAssets, currentUploadedAssets, {
				changeScope,
				maxPhases: changeScope === 'major' ? 2 : 1,
			});
			return null;
		},
	});
}
