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
		? `, ${attachment.dimensions.width}x${attachment.dimensions.height}`
		: '';

	return `- ${assetKey} (${category}, ${attachment.mimeType}${dimensions}, filename: ${filename}, url: ${attachment.publicUrl})`;
}

export function formatUploadedAssetContext(
	attachments?: ProcessedImageAttachment[],
	options?: {
		title?: string;
		includeRules?: boolean;
	},
): string {
	if (!attachments || attachments.length === 0) return '';

	const title = options?.title ?? 'UPLOADED_ASSETS';
	const lines = attachments.map(formatAssetLine).join('\n');
	const rules = options?.includeRules === false
		? ''
		: `\n\nRules for uploaded assets:
- If the creator explicitly says how to use an uploaded asset, that usage is mandatory.
- Latest explicit asset usage wins over older blueprint, phase, or chat instructions.
- For Phaser playable projects, use uploaded assets through src/asset_map and src/playable-assets.ts.
- Do not replace explicitly requested uploaded assets with shapes, emoji, external media, or starter assets except as missing/loading fallbacks.`;

	return `<${title}>\n${lines}${rules}\n</${title}>`;
}
