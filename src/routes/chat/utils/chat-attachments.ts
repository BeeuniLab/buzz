import type { AssetCategory, ConversationMessage, ImageAttachment, InitialUserAttachment } from '@/api-types';

export interface ChatAttachmentPreview {
	id: string;
	filename: string;
	mimeType: string;
	category: AssetCategory;
	previewUrl?: string;
	assetKey?: string;
	assetAgentId?: string;
	description?: string;
}

export interface ChatAssetSelectionTarget {
	assetKey?: string;
	filename?: string;
	category?: AssetCategory;
	nonce: number;
}

const MEDIA_BLOCK_MARKER = '[User-uploaded media — also listed in project assets / src/asset_map]';

const EXTENSION_TO_MIME: Record<string, string> = {
	webp: 'image/webp',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	svg: 'image/svg+xml',
	mp3: 'audio/mpeg',
	wav: 'audio/wav',
	ogg: 'audio/ogg',
	webm: 'video/webm',
	mp4: 'video/mp4',
	mov: 'video/quicktime',
	woff: 'font/woff',
	woff2: 'font/woff2',
	ttf: 'font/ttf',
	glb: 'model/gltf-binary',
	gltf: 'model/gltf+json',
	obj: 'model/obj',
	fbx: 'application/octet-stream',
};

function getMimeTypeFromFilename(filename: string): string {
	const extension = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : '';
	return EXTENSION_TO_MIME[extension] || 'application/octet-stream';
}

function getCategoryFromMimeType(mimeType: string): AssetCategory {
	if (mimeType.startsWith('image/')) return 'images';
	if (mimeType.startsWith('video/')) return 'video';
	if (mimeType.startsWith('audio/')) return 'audio';
	if (mimeType.startsWith('font/')) return 'fonts';
	if (mimeType.includes('gltf') || mimeType.includes('model/')) return '3d';
	return 'other';
}

function getFilenameFromPath(path: string): string {
	const normalized = path.split('?')[0]?.split('#')[0] ?? path;
	const parts = normalized.split('/');
	return decodeURIComponent(parts[parts.length - 1] || 'attachment');
}

function buildAssetPreviewUrl(agentId: string | undefined, assetKey: string | undefined, fallbackUrl?: string): string | undefined {
	if (agentId && assetKey) {
		return `/api/projects/${agentId}/assets/file/${assetKey}`;
	}
	return fallbackUrl;
}

function parseAssetReference(raw: string): { agentId?: string; assetKey?: string; previewUrl?: string } {
	if (!raw) return {};

	if (raw.startsWith('assets/')) {
		const parts = raw.split('/');
		if (parts.length >= 3) {
			const agentId = parts[1];
			const assetKey = parts.slice(2).join('/');
			return {
				agentId,
				assetKey,
				previewUrl: `/api/projects/${agentId}/assets/file/${assetKey}`,
			};
		}
	}

	try {
		const parsed = raw.startsWith('http://') || raw.startsWith('https://')
			? new URL(raw)
			: new URL(raw, 'http://local');
		const match = parsed.pathname.match(/^\/api\/projects\/([^/]+)\/assets\/file\/(.+)$/);
		if (match) {
			const agentId = decodeURIComponent(match[1]);
			const assetKey = decodeURIComponent(match[2]);
			return {
				agentId,
				assetKey,
				previewUrl: `/api/projects/${agentId}/assets/file/${assetKey}`,
			};
		}
	} catch {
		// Ignore malformed URLs and fall back below.
	}

	return {
		previewUrl: raw,
	};
}

function extractImageReference(part: {
	image_url?: string | { url?: string };
}): string | undefined {
	if (!part || typeof part !== 'object' || !('image_url' in part)) return undefined;

	const imageUrl = part.image_url;
	if (typeof imageUrl === 'string') {
		return imageUrl;
	}

	if (imageUrl && typeof imageUrl === 'object' && 'url' in imageUrl && typeof imageUrl.url === 'string') {
		return imageUrl.url;
	}

	return undefined;
}

export function buildOptimisticChatAttachments(images: ImageAttachment[]): ChatAttachmentPreview[] {
	return images.map((attachment) => ({
		id: attachment.id,
		filename: attachment.filename,
		mimeType: attachment.mimeType,
		category: getCategoryFromMimeType(attachment.mimeType),
		previewUrl: attachment.mimeType.startsWith('image/')
			? `data:${attachment.mimeType};base64,${attachment.base64Data}`
			: undefined,
		description: attachment.description,
	}));
}

export function buildInitialChatAttachments(
	attachments: InitialUserAttachment[],
	fallbackAgentId?: string,
): ChatAttachmentPreview[] {
	return attachments.map((attachment, index) => ({
		id: `initial-${attachment.assetKey || attachment.filename}-${index}`,
		filename: attachment.filename || getFilenameFromPath(attachment.assetKey || attachment.publicUrl),
		mimeType: attachment.mimeType || getMimeTypeFromFilename(attachment.filename),
		category: getCategoryFromMimeType(attachment.mimeType || getMimeTypeFromFilename(attachment.filename)),
		previewUrl: buildAssetPreviewUrl(fallbackAgentId, attachment.assetKey, attachment.publicUrl),
		assetKey: attachment.assetKey,
		assetAgentId: fallbackAgentId,
		description: attachment.description,
	}));
}

function extractTextContentPreservingFormatting(content: ConversationMessage['content']): string {
	if (!content) return '';
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => ('type' in part && part.type === 'text' ? part.text : ''))
			.filter(Boolean)
			.join('\n')
			.trim();
	}
	return '';
}

function splitTextAndMediaBlock(text: string): { text: string; mediaLines: string[] } {
	const markerIndex = text.indexOf(MEDIA_BLOCK_MARKER);
	if (markerIndex === -1) {
		return { text: text.trim(), mediaLines: [] };
	}

	const before = text.slice(0, markerIndex).trimEnd();
	const after = text.slice(markerIndex + MEDIA_BLOCK_MARKER.length).trim();
	const mediaLines = after
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line.startsWith('- '));

	return {
		text: before.trim(),
		mediaLines,
	};
}

function parseNonImageAttachmentLine(
	line: string,
	fallbackAgentId?: string,
	index: number = 0,
): ChatAttachmentPreview | null {
	const match = line.match(/^- (.+?) \(([^)]+)\): (.+)$/);
	if (!match) return null;

	const filename = match[1].trim();
	const mimeType = match[2].trim();
	const rawReference = match[3].trim();
	const parsed = parseAssetReference(rawReference);
	const assetAgentId = parsed.agentId || fallbackAgentId;
	const previewUrl = buildAssetPreviewUrl(assetAgentId, parsed.assetKey, parsed.previewUrl);

	return {
		id: `media-${filename}-${index}`,
		filename,
		mimeType,
		category: getCategoryFromMimeType(mimeType),
		previewUrl,
		assetKey: parsed.assetKey,
		assetAgentId,
	};
}

export function parseUserMessageForDisplay(
	content: ConversationMessage['content'],
	fallbackAgentId?: string,
): { text: string; attachments: ChatAttachmentPreview[] } {
	const attachments: ChatAttachmentPreview[] = [];

	if (Array.isArray(content)) {
		content.forEach((part, index) => {
			if (!('type' in part) || part.type !== 'image_url') return;

			const rawReference = extractImageReference(part);
			if (!rawReference) return;
			const parsed = parseAssetReference(rawReference);
			const assetAgentId = parsed.agentId || fallbackAgentId;
			const assetKey = parsed.assetKey;
			const filename = assetKey ? getFilenameFromPath(assetKey) : getFilenameFromPath(rawReference);
			const mimeType = getMimeTypeFromFilename(filename);

			attachments.push({
				id: `image-${assetKey || filename}-${index}`,
				filename,
				mimeType,
				category: getCategoryFromMimeType(mimeType),
				previewUrl: buildAssetPreviewUrl(assetAgentId, assetKey, parsed.previewUrl),
				assetKey,
				assetAgentId,
			});
		});
	}

	const rawText = extractTextContentPreservingFormatting(content);
	const { text, mediaLines } = splitTextAndMediaBlock(rawText);
	mediaLines.forEach((line, index) => {
		const attachment = parseNonImageAttachmentLine(line, fallbackAgentId, index);
		if (attachment) attachments.push(attachment);
	});

	const dedupedAttachments = attachments.filter((attachment, index, arr) => {
		return arr.findIndex((candidate) => {
			if (attachment.assetKey && candidate.assetKey) {
				return attachment.assetKey === candidate.assetKey;
			}
			return attachment.filename === candidate.filename && attachment.previewUrl === candidate.previewUrl;
		}) === index;
	});

	return {
		text,
		attachments: dedupedAttachments,
	};
}
