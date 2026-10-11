import { readFile } from 'node:fs/promises';
import { parse } from 'jsonc-parser';
import OpenAI from 'openai';

type ModelSettings = {
	vars: {
		CODEX_MODEL: string;
		CODEX_MODEL_REASONING_EFFORT: OpenAI.Shared.ReasoningEffort;
		LLM_PROXY_URL: string;
		LLM_PROXY_FALLBACK_URL: string;
	};
};

const config = parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')) as ModelSettings;
const fallback = process.argv.includes('--fallback');
const apiKey = process.env[fallback ? 'LLM_PROXY_FALLBACK_API_KEY' : 'LLM_PROXY_API_KEY'];
const baseURL = fallback ? config.vars.LLM_PROXY_FALLBACK_URL : config.vars.LLM_PROXY_URL;
if (!apiKey) throw new Error(`Missing ${fallback ? 'LLM_PROXY_FALLBACK_API_KEY' : 'LLM_PROXY_API_KEY'}`);

const client = new OpenAI({ apiKey, baseURL, timeout: 120_000, maxRetries: 0 });
const stream = await client.responses.create({
	model: config.vars.CODEX_MODEL,
	input: 'Reply with OK only.',
	reasoning: { effort: config.vars.CODEX_MODEL_REASONING_EFFORT },
	stream: true,
	store: false,
});

let output = '';
for await (const event of stream) {
	if (event.type === 'response.output_text.delta') output += event.delta;
	if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
		throw new Error(`Model request did not complete: ${event.type}`);
	}
}
if (!output.trim()) throw new Error('Model returned no text');
console.log(`${config.vars.CODEX_MODEL} (${config.vars.CODEX_MODEL_REASONING_EFFORT}) via ${baseURL}: ${output.trim()}`);
