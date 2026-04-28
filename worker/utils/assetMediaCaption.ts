/**
 * Short captions for `src/asset_map` descriptions.
 *
 * This uses Vercel AI Gateway directly so media captioning stays lightweight and
 * independent from the main GPT-5.5 coding proxy.
 */

import type { InferenceContext } from '../agents/inferutils/config.types';
import type { ProcessedImageAttachment } from '../types/image-attachment';
import { MAX_IMAGE_SIZE_BYTES } from '../types/image-attachment';

const VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const ASSET_CAPTION_MODEL = 'google/gemini-3.1-flash-lite-preview';
const CAPTION_PROMPT =
	'Write one src/asset_map description for the attached user asset. '
	+ 'Match the examples: short subject sentence, then "Use as ..." with concrete gameplay roles. '
	+ 'Examples:\n'
	+ '- A tasty apple. Use as snake food, fruit pickup, food pickup, collectible, health item, snack reward, or cooking ingredient.\n'
	+ '- An ancient coin. Use as currency, treasure, score pickup, mystery reward, prop, collectible, pickup, or interactive object.\n'
	+ '- A ghost that likes to fly around. Use as player character, NPC, enemy, avatar, story character, or ghost.\n'
	+ '- A very fire fire! Use as hazard, projectile, damage effect, prop, collectible, pickup, obstacle, interactive object, or flame.\n'
	+ '- Default background for Phaser stages. Use as a fallback scene backdrop, cover layer, skybox-style image, or ambience layer.\n'
	+ 'Return only the description. No markdown, no title, no quotes.';

const MAX_DESCRIPTION_CHARS = 220;

type VercelChatContentPart =
	| { type: 'text'; text: string }
	| { type: 'image_url'; image_url: { url: string; detail: 'low' } }
	| { type: 'input_audio'; input_audio: { data: string; format: 'mp3' | 'wav' } }
	| { type: 'file'; file: { file_data: string; filename: string } };

type VercelChatResponse = {
	choices?: Array<{
		message?: {
			content?: string | Array<{ type?: string; text?: string }>;
		};
	}>;
};

function approxBytesFromBase64(b64: string): number {
	const trimmed = b64.replace(/\s/g, '');
	const pad = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
	return Math.max(0, Math.floor((trimmed.length * 3) / 4) - pad);
}

function normalizeCaption(raw: string): string {
	const t = raw
		.replace(/\r\n/g, '\n')
		.replace(/^[\s*"']+|[\s*"']+$/g, '')
		.replace(/\s+/g, ' ')
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

function buildCaptionContent(attachment: ProcessedImageAttachment): VercelChatContentPart[] | null {
	const mime = attachment.mimeType;
	const b64 = attachment.base64Data;
	if (!b64 || approxBytesFromBase64(b64) > MAX_IMAGE_SIZE_BYTES) {
		return null;
	}

	const dataUrl = `data:${mime};base64,${b64}`;
	const content: VercelChatContentPart[] = [{ type: 'text', text: CAPTION_PROMPT }];

	if (mime.startsWith('image/')) {
		content.push({ type: 'image_url', image_url: { url: dataUrl, detail: 'low' } });
		return content;
	}

	if (mime === 'audio/mpeg') {
		content.push({ type: 'input_audio', input_audio: { data: b64, format: 'mp3' } });
		return content;
	}

	if (mime === 'audio/wav') {
		content.push({ type: 'input_audio', input_audio: { data: b64, format: 'wav' } });
		return content;
	}

	if (mime.startsWith('video/') || mime === 'audio/webm' || mime === 'audio/ogg') {
		const ext = fileExtensionForMime(mime);
		content.push({
			type: 'file',
			file: {
				file_data: b64,
				filename: `upload.${ext}`,
			},
		});
		return content;
	}

	return null;
}

function extractCaption(response: VercelChatResponse): string | null {
	const content = response.choices?.[0]?.message?.content;
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map(part => part.text)
			.filter((text): text is string => Boolean(text))
			.join(' ');
	}
	return null;
}

/**
 * Returns a short description for one uploaded asset, or null if inference fails or is skipped.
 */
export async function generateAssetMediaCaption(
	env: Env,
	inferenceContext: InferenceContext,
	attachment: ProcessedImageAttachment,
): Promise<string | null> {
	if (!env.VERCEL_AI_GATEWAY_API_KEY) {
		return null;
	}

	const content = buildCaptionContent(attachment);
	if (!content) {
		return null;
	}

	const response = await fetch(VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.VERCEL_AI_GATEWAY_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: ASSET_CAPTION_MODEL,
			messages: [{ role: 'user', content }],
			temperature: 0,
		}),
		signal: inferenceContext.abortSignal,
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Asset media caption failed: ${response.status} ${errorText}`);
	}

	const json = await response.json() as VercelChatResponse;
	const raw = extractCaption(json);
	if (!raw) return null;

	const out = normalizeCaption(raw);
	return out || null;
}
