import { AIModels } from '../agents/inferutils/config.types';

const VERCEL_AI_GATEWAY_CHAT_COMPLETIONS_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const APP_TITLE_MODEL = AIModels.GEMINI_3_1_FLASH_LITE_PREVIEW;
const MAX_TITLE_CHARS = 48;
const APP_TITLE_MAX_RETRIES = 2;
const APP_TITLE_RETRY_BASE_DELAY_MS = 400;

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

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryTitleGeneration(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return true;
	}

	const statusMatch = error.message.match(/App title generation failed: (\d{3})/);
	if (!statusMatch) {
		return true;
	}

	const status = Number(statusMatch[1]);
	return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function requestAppTitle(env: Env, normalizedQuery: string): Promise<string | null> {
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

export async function generateAppTitle(env: Env, query: string): Promise<string | null> {
	if (!env.VERCEL_AI_GATEWAY_API_KEY) {
		return null;
	}

	const normalizedQuery = query.replace(/\s+/g, ' ').trim();
	if (!normalizedQuery) {
		return null;
	}

	let lastError: unknown;
	for (let attempt = 0; attempt <= APP_TITLE_MAX_RETRIES; attempt += 1) {
		try {
			const title = await requestAppTitle(env, normalizedQuery);
			if (title) {
				return title;
			}
			lastError = new Error('App title generation returned an empty title');
		} catch (error) {
			lastError = error;
		}

		if (attempt >= APP_TITLE_MAX_RETRIES || !shouldRetryTitleGeneration(lastError)) {
			break;
		}

		await sleep(APP_TITLE_RETRY_BASE_DELAY_MS * 2 ** attempt);
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
