import OpenAI from 'openai';
import { createObjectLogger } from '../../logger';
import { PhasicBlueprint } from '../schemas';

const logger = createObjectLogger('CoverGenerator');

const COVER_MODEL = 'gpt-image-1.5';
const COVER_SIZE = '1024x1536' as const;

/**
 * Build a cover art generation prompt from the blueprint.
 * Adapted from game_data/generate_astrocade_covers.py build_prompt()
 */
function buildCoverPrompt(blueprint: PhasicBlueprint): string {
	const title = blueprint.title || blueprint.projectName || 'Untitled';
	const description = blueprint.detailedDescription || blueprint.description || '';
	const palette = blueprint.colorPalette?.join(', ') || 'not specified';

	return (
		'Create one high-quality original cover art (key art) for an interactive web experience. '
		+ 'The illustration must be centered on what the DESCRIPTION says: setting, mood, '
		+ 'characters, objects, and atmosphere should follow the description first. '
		+ 'The cover may include ONLY the title as readable text. Do not add any other words. '
		+ 'Use the color palette hint to refine palette and tone.\n\n'
		+ '--- Description (primary) ---\n'
		+ `${description.slice(0, 1200)}\n\n`
		+ '--- Context ---\n'
		+ `Title (render exactly this as the ONLY readable text): ${title}\n`
		+ `Color palette hint: ${palette}\n\n`
		+ 'Requirements:\n'
		+ '- Vertical portrait (~2:3), app-store style key art, one clear focal subject, readable at thumbnail size.\n'
		+ '- Text constraint: render ONLY the title; no subtitles, slogans, numbers, or any other words.\n'
		+ '- No logos, watermarks, or UI overlays on the image.\n'
		+ '- Strong silhouette, depth, and lighting that match the described experience.\n'
		+ '- Output a single finished cover image.\n'
	);
}

export interface CoverGenerationResult {
	imageBytes: Uint8Array;
	contentType: string;
}

/**
 * Generate a cover image for a project using gpt-image-1.5 via Images API.
 * Returns PNG (the proxy does not support WebP output format).
 * Requires LLM_PROXY_URL/LLM_PROXY_API_KEY or VERCEL_AI_GATEWAY_API_KEY.
 */
export async function generateCoverImage(
	env: Env,
	blueprint: PhasicBlueprint,
): Promise<CoverGenerationResult> {
	let apiKey: string;
	let baseURL: string;

	if (env.VERCEL_AI_GATEWAY_API_KEY) {
		apiKey = env.VERCEL_AI_GATEWAY_API_KEY;
		baseURL = 'https://ai-gateway.vercel.sh/v1';
	} else if (env.LLM_PROXY_URL && env.LLM_PROXY_API_KEY) {
		apiKey = env.LLM_PROXY_API_KEY;
		baseURL = env.LLM_PROXY_URL;
	} else {
		throw new Error('VERCEL_AI_GATEWAY_API_KEY or LLM_PROXY_URL/LLM_PROXY_API_KEY are required for cover generation');
	}

	const prompt = buildCoverPrompt(blueprint);

	logger.info('Generating cover image', { title: blueprint.title, model: COVER_MODEL });

	const client = new OpenAI({
		apiKey,
		baseURL,
	});

	const response = await client.images.generate({
		model: COVER_MODEL,
		prompt,
		n: 1,
		size: COVER_SIZE,
	});

	const imageData = response.data?.[0];
	if (!imageData) {
		throw new Error('No image data returned from image generation API');
	}

	let imageBytes: Uint8Array;

	if (imageData.b64_json) {
		imageBytes = Uint8Array.from(atob(imageData.b64_json), c => c.charCodeAt(0));
	} else if (imageData.url) {
		logger.info('Downloading cover from URL', { url: imageData.url.slice(0, 80) });
		const resp = await fetch(imageData.url);
		if (!resp.ok) throw new Error(`Failed to download cover image: ${resp.status}`);
		imageBytes = new Uint8Array(await resp.arrayBuffer());
	} else {
		throw new Error('No image url or b64_json in response');
	}

	logger.info('Cover image generated successfully', { bytes: imageBytes.length });

	return {
		imageBytes,
		contentType: 'image/png',
	};
}
