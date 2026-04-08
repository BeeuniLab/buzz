import { createObjectLogger } from '../../logger';
import { PhasicBlueprint } from '../schemas';

const logger = createObjectLogger('CoverGenerator');

const COVER_IMAGE_MODEL = 'google/gemini-3-pro-image-preview';

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
		+ '- Vertical portrait with 1024x1536 resolution (~2:3 aspect ratio), app-store style key art, one clear focal subject, readable at thumbnail size.\n'
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
 * Generate a cover image for a project using gemini-3-pro-image-preview
 * via Vercel AI Gateway chat completions endpoint.
 * Images are returned in the message.images array as base64 data URLs.
 */
export async function generateCoverImage(
	env: Env,
	blueprint: PhasicBlueprint,
): Promise<CoverGenerationResult> {
	if (!env.VERCEL_AI_GATEWAY_API_KEY) {
		throw new Error('VERCEL_AI_GATEWAY_API_KEY is required for cover generation');
	}

	const prompt = buildCoverPrompt(blueprint);

	logger.info('Generating cover image', { title: blueprint.title, model: COVER_IMAGE_MODEL });

	const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${env.VERCEL_AI_GATEWAY_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			model: COVER_IMAGE_MODEL,
			messages: [{ role: 'user', content: prompt }],
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Cover image generation failed: ${response.status} ${errorText}`);
	}

	const json = await response.json() as {
		choices?: Array<{
			message?: {
				images?: Array<{
					image_url?: { url?: string };
				}>;
			};
		}>;
	};

	const images = json.choices?.[0]?.message?.images;
	if (!images || images.length === 0) {
		throw new Error('No images returned from Gemini image model');
	}

	const dataUrl = images[0].image_url?.url;
	if (!dataUrl) {
		throw new Error('No image URL in Gemini response');
	}

	// Parse data URL: "data:image/png;base64,iVBOR..."
	const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
	if (!match) {
		throw new Error('Invalid image data URL format');
	}

	const contentType = match[1];
	const imageBytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));

	logger.info('Cover image generated successfully', { bytes: imageBytes.length });

	return { imageBytes, contentType };
}
