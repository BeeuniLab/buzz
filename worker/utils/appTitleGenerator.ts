import { AIModels } from '../agents/inferutils/config.types';

const VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const APP_TITLE_MODEL = AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW;
const MAX_TITLE_CHARS = 48;

type VercelChatResponse = {
	choices?: Array<{
		message?: {
			content?: string | Array<{ type?: string; text?: string }>;
		};
	}>;
};

function extractText(response: VercelChatResponse): string | null {
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

function normalizeGeneratedTitle(raw: string): string | null {
	const title = raw
		.replace(/\r\n/g, '\n')
		.split('\n')[0]
		.replace(/^#+\s*/, '')
		.replace(/^title\s*:\s*/i, '')
		.replace(/^[\s"'“”‘’`]+|[\s"'“”‘’`.。]+$/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	if (!title || title.length < 2) {
		return null;
	}

	return title.length > MAX_TITLE_CHARS ? `${title.slice(0, MAX_TITLE_CHARS - 1)}…` : title;
}

export async function generateAppTitle(env: Env, query: string): Promise<string | null> {
	if (!env.VERCEL_AI_GATEWAY_API_KEY) {
		return null;
	}

	const normalizedQuery = query.replace(/\s+/g, ' ').trim();
	if (!normalizedQuery) {
		return null;
	}

	const response = await fetch(VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.VERCEL_AI_GATEWAY_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: APP_TITLE_MODEL,
			messages: [
				{
					role: 'system',
					content: 'Create short playable project titles. Return only the title, no markdown, no quotes.',
				},
				{
					role: 'user',
					content:
						'Write a concise, friendly title for this BuzzPlay project. '
						+ 'Use 2-6 words when possible. Match the user language if clear.\n\n'
						+ `Request: ${normalizedQuery}`,
				},
			],
			max_tokens: 32,
			temperature: 0.4,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`App title generation failed: ${response.status} ${errorText}`);
	}

	const json = await response.json() as VercelChatResponse;
	const raw = extractText(json);
	return raw ? normalizeGeneratedTitle(raw) : null;
}
