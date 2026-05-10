/**
 * Chat / blueprint attachments: images plus audio & video for asset pipeline + LLM context.
 * Legacy name `ImageAttachment` kept — values may be any supported chat media MIME type.
 */

/** Subset for home / strict image-only UIs (e.g. create flow). */
export const SUPPORTED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type SupportedImageMimeType = (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

/** Chat input: images + common audio/video containers (aligned with asset API categories). */
export const SUPPORTED_CHAT_MEDIA_MIME_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'audio/mpeg',
	'audio/webm',
	'audio/wav',
	'audio/ogg',
	'video/mp4',
	'video/webm',
	'video/quicktime',
] as const;

export type SupportedChatMediaMimeType = (typeof SUPPORTED_CHAT_MEDIA_MIME_TYPES)[number];

export interface ImageAttachment {
	id: string;
	filename: string;
	mimeType: SupportedChatMediaMimeType;
	base64Data: string;
	size?: number;
	dimensions?: {
		width: number;
		height: number;
	};
}

export interface ProcessedImageAttachment {
	id?: string;
	filename?: string;
	mimeType: SupportedChatMediaMimeType;
	base64Data?: string;
	r2Key: string;
	publicUrl: string;
	hash: string;
	size?: number;
	dimensions?: {
		width: number;
		height: number;
	};
}

export interface InitialUserAttachment {
	filename: string;
	mimeType: SupportedChatMediaMimeType;
	assetKey: string;
	publicUrl: string;
}

export function toInitialUserAttachment(
	attachment: Pick<ProcessedImageAttachment, 'filename' | 'mimeType' | 'r2Key' | 'publicUrl'>,
): InitialUserAttachment {
	const assetKey = attachment.r2Key.startsWith('assets/')
		? attachment.r2Key.split('/').slice(2).join('/')
		: attachment.r2Key;
	const filename = attachment.filename || assetKey.split('/').pop() || 'attachment';

	return {
		filename,
		mimeType: attachment.mimeType,
		assetKey,
		publicUrl: attachment.publicUrl,
	};
}

export function isSupportedImageType(mimeType: string): mimeType is SupportedImageMimeType {
	return SUPPORTED_IMAGE_MIME_TYPES.includes(mimeType as SupportedImageMimeType);
}

export function isSupportedChatMediaType(mimeType: string): mimeType is SupportedChatMediaMimeType {
	return SUPPORTED_CHAT_MEDIA_MIME_TYPES.includes(mimeType as SupportedChatMediaMimeType);
}

export function getFileExtensionFromMimeType(mimeType: SupportedImageMimeType): string {
	const map: Record<SupportedImageMimeType, string> = {
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/webp': 'webp',
	};
	return map[mimeType] || 'jpg';
}

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

/** Max image attachments per chat/create message. */
export const MAX_IMAGES_PER_MESSAGE = 5;

/** Max audio attachments per chat/create message. */
export const MAX_AUDIO_PER_MESSAGE = 1;

/** Max video attachments per chat/create message. */
export const MAX_VIDEO_PER_MESSAGE = 1;

/** Max attachments (image + audio + video) per chat WebSocket message. */
export const MAX_CHAT_MEDIA_PER_MESSAGE =
	MAX_IMAGES_PER_MESSAGE + MAX_AUDIO_PER_MESSAGE + MAX_VIDEO_PER_MESSAGE;

export type ChatMediaKind = 'image' | 'audio' | 'video';

export interface ChatMediaAttachmentCandidate {
	filename?: string;
	mimeType?: string;
	size?: number;
}

export function getChatMediaKind(mimeType: string): ChatMediaKind | null {
	if (mimeType.startsWith('image/')) return 'image';
	if (mimeType.startsWith('audio/')) return 'audio';
	if (mimeType.startsWith('video/')) return 'video';
	return null;
}

export function describeChatMediaLimits(): string {
	return `${MAX_IMAGES_PER_MESSAGE} image(s), ${MAX_AUDIO_PER_MESSAGE} audio file, and ${MAX_VIDEO_PER_MESSAGE} video file`;
}

export function validateChatMediaAttachments(
	attachments: readonly ChatMediaAttachmentCandidate[],
	options: { maxSizeBytes?: number } = {},
): string | null {
	const maxSizeBytes = options.maxSizeBytes ?? MAX_IMAGE_SIZE_BYTES;
	let imageCount = 0;
	let audioCount = 0;
	let videoCount = 0;

	for (const attachment of attachments) {
		if (!attachment || typeof attachment !== 'object') {
			return 'Invalid attachment payload.';
		}

		const mimeType = attachment.mimeType || '';
		const filename = attachment.filename || 'attachment';

		if (!isSupportedChatMediaType(mimeType)) {
			const allowed = SUPPORTED_CHAT_MEDIA_MIME_TYPES
				.map((type) => type.split('/')[1] || type)
				.join(', ');
			return `Unsupported file type for "${filename}": ${mimeType || 'unknown'}. Allowed: ${allowed}`;
		}

		if (typeof attachment.size === 'number' && attachment.size > maxSizeBytes) {
			const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
			const fileSizeMB = (attachment.size / (1024 * 1024)).toFixed(1);
			return `File too large: "${filename}" is ${fileSizeMB}MB. Maximum allowed is ${maxSizeMB}MB.`;
		}

		switch (getChatMediaKind(mimeType)) {
			case 'image':
				imageCount += 1;
				break;
			case 'audio':
				audioCount += 1;
				break;
			case 'video':
				videoCount += 1;
				break;
		}
	}

	if (imageCount > MAX_IMAGES_PER_MESSAGE) {
		return `Maximum ${MAX_IMAGES_PER_MESSAGE} image(s) allowed per message. Received ${imageCount}.`;
	}
	if (audioCount > MAX_AUDIO_PER_MESSAGE) {
		return `Maximum ${MAX_AUDIO_PER_MESSAGE} audio file allowed per message. Received ${audioCount}.`;
	}
	if (videoCount > MAX_VIDEO_PER_MESSAGE) {
		return `Maximum ${MAX_VIDEO_PER_MESSAGE} video file allowed per message. Received ${videoCount}.`;
	}
	if (attachments.length > MAX_CHAT_MEDIA_PER_MESSAGE) {
		return `Maximum ${MAX_CHAT_MEDIA_PER_MESSAGE} attachments allowed per message (${describeChatMediaLimits()}). Received ${attachments.length}.`;
	}

	return null;
}
