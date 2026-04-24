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

/** Max image-only attachments (e.g. home / create flow). */
export const MAX_IMAGES_PER_MESSAGE = 2;

/** Max attachments (image + audio + video) per chat WebSocket message. */
export const MAX_CHAT_MEDIA_PER_MESSAGE = 3;
