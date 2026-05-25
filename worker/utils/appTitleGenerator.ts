const APP_TITLE_MODEL = 'gpt-5.4-mini';
const MAX_TITLE_CHARS = 48;
const APP_TITLE_MAX_RETRIES = 2;
const APP_TITLE_RETRY_BASE_DELAY_MS = 400;

type ResponsesApiResponse = {
	output_text?: string;
	output?: Array<{
		type?: string;
		content?: Array<{ type?: string; text?: string }>;
	}>;
	response?: ResponsesApiResponse;
	delta?: string;
	text?: string;
};

type AppTitleEndpoint = {
	name: 'primary' | 'fallback';
	baseUrl: string;
	apiKey: string;
};

function normalizeBaseUrl(url: string | undefined): string | null {
	const trimmed = url?.trim().replace(/\/+$/, '');
	return trimmed || null;
}

function getAppTitleEndpoints(env: Env): AppTitleEndpoint[] {
	const endpoints: AppTitleEndpoint[] = [];
	const primaryBaseUrl = normalizeBaseUrl(env.LLM_PROXY_URL);
	if (primaryBaseUrl && env.LLM_PROXY_API_KEY) {
		endpoints.push({
			name: 'primary',
			baseUrl: primaryBaseUrl,
			apiKey: env.LLM_PROXY_API_KEY,
		});
	}

	const fallbackBaseUrl = normalizeBaseUrl(env.LLM_PROXY_FALLBACK_URL);
	if (fallbackBaseUrl && env.LLM_PROXY_FALLBACK_API_KEY) {
		endpoints.push({
			name: 'fallback',
			baseUrl: fallbackBaseUrl,
			apiKey: env.LLM_PROXY_FALLBACK_API_KEY,
		});
	}

	return endpoints;
}

function extractTextFromResponsesJson(response: ResponsesApiResponse): string | null {
	if (typeof response.output_text === 'string' && response.output_text.length > 0) {
		return response.output_text;
	}

	if (Array.isArray(response.output)) {
		const text = response.output
			.flatMap(item => item.content ?? [])
			.map(part => part.type === 'output_text' ? part.text : '')
			.filter((text): text is string => Boolean(text))
			.join('');
		if (text) return text;
	}

	if (response.response) {
		return extractTextFromResponsesJson(response.response);
	}

	return null;
}

function extractTextFromResponsesSse(raw: string): string | null {
	let deltaText = '';
	let finalText: string | null = null;

	for (const line of raw.split(/\r?\n/)) {
		if (!line.startsWith('data:')) continue;
		const data = line.slice(5).trim();
		if (!data || data === '[DONE]') continue;

		try {
			const event = JSON.parse(data) as ResponsesApiResponse & { type?: string };
			if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
				deltaText += event.delta;
				continue;
			}
			if (event.type === 'response.output_text.done' && typeof event.text === 'string') {
				finalText = event.text;
				continue;
			}

			const text = extractTextFromResponsesJson(event);
			if (text) finalText = text;
		} catch {
			// Ignore malformed SSE control lines.
		}
	}

	return deltaText || finalText;
}

function extractTextFromResponsesBody(raw: string): string | null {
	try {
		const json = JSON.parse(raw) as ResponsesApiResponse;
		return extractTextFromResponsesJson(json);
	} catch {
		return extractTextFromResponsesSse(raw);
	}
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

	const statusMatch = error.message.match(/App title generation failed(?: \([^)]+\))?: (\d{3})/);
	if (!statusMatch) {
		return true;
	}

	const status = Number(statusMatch[1]);
	return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function requestAppTitle(endpoint: AppTitleEndpoint, normalizedQuery: string): Promise<string | null> {
	const response = await fetch(`${endpoint.baseUrl}/responses`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${endpoint.apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: APP_TITLE_MODEL,
			instructions: 'Create short playable project titles. Return only the title, no markdown, no quotes.',
			input:
				'Write a concise, friendly title for this BuzzPlay project. '
				+ 'Use 2-6 words when possible. Match the user language if clear.\n\n'
				+ `Request: ${normalizedQuery}`,
			max_output_tokens: 64,
			store: false,
		}),
	});

	const raw = await response.text();
	if (!response.ok) {
		throw new Error(`App title generation failed (${endpoint.name}): ${response.status} ${raw}`);
	}

	const text = extractTextFromResponsesBody(raw);
	return text ? normalizeGeneratedTitle(text) : null;
}

export async function generateAppTitle(env: Env, query: string): Promise<string | null> {
	const endpoints = getAppTitleEndpoints(env);
	if (endpoints.length === 0) {
		return null;
	}

	const normalizedQuery = query.replace(/\s+/g, ' ').trim();
	if (!normalizedQuery) {
		return null;
	}

	let lastError: unknown;
	for (const endpoint of endpoints) {
		for (let attempt = 0; attempt <= APP_TITLE_MAX_RETRIES; attempt += 1) {
			try {
				const title = await requestAppTitle(endpoint, normalizedQuery);
				if (title) {
					return title;
				}
				lastError = new Error(`App title generation returned an empty title (${endpoint.name})`);
			} catch (error) {
				lastError = error;
			}

			if (attempt >= APP_TITLE_MAX_RETRIES || !shouldRetryTitleGeneration(lastError)) {
				break;
			}

			await sleep(APP_TITLE_RETRY_BASE_DELAY_MS * 2 ** attempt);
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
