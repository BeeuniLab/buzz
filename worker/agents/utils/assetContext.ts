import type { ProcessedImageAttachment } from 'worker/types/image-attachment';

export function getUploadedAssetKey(attachment: Pick<ProcessedImageAttachment, 'r2Key'>): string {
	if (attachment.r2Key.startsWith('assets/')) {
		const parts = attachment.r2Key.split('/');
		return parts.length > 2 ? parts.slice(2).join('/') : parts.slice(1).join('/');
	}
	return attachment.r2Key;
}

function formatAssetLine(attachment: ProcessedImageAttachment): string {
	const assetKey = getUploadedAssetKey(attachment);
	const filename = attachment.filename || assetKey.split('/').pop() || 'upload';
	const category = attachment.mimeType.split('/')[0] || 'media';
	const dimensions = attachment.dimensions
		? `; dimensions: ${attachment.dimensions.width}x${attachment.dimensions.height}`
		: '';
	const uploadedAt = attachment.uploadedAt ? `; uploadedAt: ${attachment.uploadedAt}` : '; uploadedAt: unknown';

	return `- key: ${assetKey}; filename: ${filename}; kind: ${category}${dimensions}${uploadedAt}`;
}

export function formatUploadedAssetContext(
	attachments?: ProcessedImageAttachment[],
	options?: {
		includeRules?: boolean;
	},
): string {
	if (!attachments || attachments.length === 0) return '';

	const sortedAttachments = [...attachments].sort((a, b) => {
		const aTime = a.uploadedAt ? Date.parse(a.uploadedAt) : Number.POSITIVE_INFINITY;
		const bTime = b.uploadedAt ? Date.parse(b.uploadedAt) : Number.POSITIVE_INFINITY;
		if (aTime !== bTime) return aTime - bTime;
		return getUploadedAssetKey(a).localeCompare(getUploadedAssetKey(b));
	});
	const lines = sortedAttachments.map(formatAssetLine).join('\n');
	const rules = options?.includeRules === false
		? ''
		: `\n\nRules for uploaded assets:
- If the creator explicitly says how to use an uploaded asset, that usage is mandatory.
- Latest explicit asset usage wins over older planning, generated code, or chat instructions.
- Treat asset_map keys as lookup keys in src/asset_map, not guaranteed local filesystem paths.
- For Phaser playable projects, use uploaded assets through src/asset_map URLs and src/playable-assets.ts.
- Use explicitly requested uploaded assets first. If one is missing or fails to load, fall back in this order: another suitable src/asset_map asset, a bundled starter asset, then a simple shape/color placeholder.`;

	return `${lines}${rules}`;
}
