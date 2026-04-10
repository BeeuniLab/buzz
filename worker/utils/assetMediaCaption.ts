/**
 * Flash-Lite captions for `src/asset_map` (scheme A `description`), via the same
 * OpenAI SDK + AI Gateway path as other inference (`chat.completions`).
 *
 * Upload path already caps attachments at MAX_IMAGE_SIZE_BYTES (10MB). Gemini Files API
 * allows larger media (e.g. up to ~100MB for many types, 50MB for PDF); we only send
 * what the user already uploaded. For Gemini 3, prefer lower vision detail for short
 * descriptions to limit token use (media_resolution guidance).
 *
 * @see https://ai.google.dev/gemini-api/docs/gemini-3?hl=zh-cn
 * @see https://ai.google.dev/gemini-api/docs/files?hl=zh-cn
 */

import { executeInference } from '../agents/inferutils/infer';
import { createMultiModalUserMessage, createUserMessage, type Message } from '../agents/inferutils/common';
import type { InferenceContext } from '../agents/inferutils/config.types';
import type { ProcessedImageAttachment } from '../types/image-attachment';
import { MAX_IMAGE_SIZE_BYTES } from '../types/image-attachment';

const CAPTION_PROMPT =
	'Describe this asset in 1–3 concise English sentences for a code project manifest: subject, style, and notable details. No title, no markdown, no surrounding quotes.';

const MAX_DESCRIPTION_CHARS = 800;

function approxBytesFromBase64(b64: string): number {
	const trimmed = b64.replace(/\s/g, '');
	const pad = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
	return Math.max(0, Math.floor((trimmed.length * 3) / 4) - pad);
}

function normalizeCaption(raw: string): string {
	const t = raw
		.replace(/\r\n/g, '\n')
		.replace(/^[\s*"']+|[\s*"']+$/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	if (!t) return '';
	return t.length > MAX_DESCRIPTION_CHARS ? `${t.slice(0, MAX_DESCRIPTION_CHARS - 1)}…` : t;
}

function fileExtensionForMime(mime: string): string {
	const map: Record<string, string> = {
		'video/mp4': 'mp4',
		'video/webm': 'webm',
		'video/quicktime': 'mov',
		'audio/webm': 'webm',
		'audio/ogg': 'ogg',
	};
	return map[mime] ?? 'bin';
}

function buildCaptionUserMessage(attachment: ProcessedImageAttachment): Message {
	const mime = attachment.mimeType;
	const b64 = attachment.base64Data;
	if (!b64 || approxBytesFromBase64(b64) > MAX_IMAGE_SIZE_BYTES) {
		return createUserMessage(
			`${CAPTION_PROMPT}\n\n(No inline media available; describe only from MIME type: ${mime}.)`,
		);
	}

	const dataUrl = `data:${mime};base64,${b64}`;

	if (mime.startsWith('image/')) {
		return createMultiModalUserMessage(CAPTION_PROMPT, dataUrl, 'low');
	}

	if (mime === 'audio/mpeg') {
		return {
			role: 'user',
			content: [
				{ type: 'text', text: CAPTION_PROMPT },
				{ type: 'input_audio', input_audio: { data: b64, format: 'mp3' } },
			],
		};
	}

	if (mime === 'audio/wav') {
		return {
			role: 'user',
			content: [
				{ type: 'text', text: CAPTION_PROMPT },
				{ type: 'input_audio', input_audio: { data: b64, format: 'wav' } },
			],
		};
	}

	if (mime.startsWith('video/') || mime === 'audio/webm' || mime === 'audio/ogg') {
		const ext = fileExtensionForMime(mime);
		return {
			role: 'user',
			content: [
				{ type: 'text', text: CAPTION_PROMPT },
				{
					type: 'file',
					file: {
						file_data: b64,
						filename: `upload.${ext}`,
					},
				},
			],
		};
	}

	return createUserMessage(`${CAPTION_PROMPT}\n\n(MIME type: ${mime}.)`);
}

/**
 * Returns a short description for one uploaded asset, or null if inference fails or is skipped.
 */
export async function generateAssetMediaCaption(
	env: Env,
	inferenceContext: InferenceContext,
	attachment: ProcessedImageAttachment,
): Promise<string | null> {
	if (!attachment.base64Data) {
		return null;
	}
	if (approxBytesFromBase64(attachment.base64Data) > MAX_IMAGE_SIZE_BYTES) {
		return null;
	}

	const messages: Message[] = [buildCaptionUserMessage(attachment)];

	const result = await executeInference({
		env,
		context: inferenceContext,
		messages,
		agentActionName: 'assetMediaCaption',
	});

	if (!result?.string) {
		return null;
	}
	const out = normalizeCaption(result.string);
	return out || null;
}
