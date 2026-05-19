
// ===============================
// Image storage helpers
// ===============================

import { ImageAttachment, ProcessedImageAttachment, SupportedChatMediaMimeType } from "worker/types/image-attachment";
import { getAgentAssetFilePublicUrl, getPublicUrlForBucketKey } from "./agentAssets";

export function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

/** Upload to Cloudflare Images; `cfFilenameSegment` disambiguates filenames in the CF dashboard. */
export async function uploadImageToCloudflareImages(
	env: Env,
	image: ImageAttachment,
	cfFilenameSegment: string,
	bytes?: Uint8Array,
): Promise<string> {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/images/v1`;

    const filename = `${image.id}-${cfFilenameSegment}-${image.filename}`;

    const data = bytes ?? base64ToUint8Array(image.base64Data!);
    const blob = new Blob([data], { type: image.mimeType });
    const form = new FormData();
    form.append('file', blob, filename);

    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}` },
        body: form,
    });

    const json = await resp.json() as {
        success: boolean;
        result?: { id: string; variants?: string[] };
        errors?: Array<{ message?: string }>;
    };

    if (!resp.ok || !json.success || !json.result) {
        const errMsg = json.errors?.map(e => e.message).join('; ') || `status ${resp.status}`;
        throw new Error(`Cloudflare Images upload failed: ${errMsg}`);
    }

    const variants = json.result.variants || [];
    if (variants.length > 0) {
        // Prefer first variant URL
        return variants[0];
    }
    throw new Error('Cloudflare Images upload succeeded without variants');
}

/** Store user media (image/audio/video) under assets/{agentId}/… for asset_map + preview. */
export async function uploadImageAsAgentAsset(
	env: Env,
	agentId: string,
	image: ImageAttachment,
	relativePath: string,
): Promise<ProcessedImageAttachment> {
	const uploadedAt = new Date().toISOString();
	const hashPromise = hashImageB64url(image.base64Data!);
	const bytes = base64ToUint8Array(image.base64Data!);

	let cfImagesUrl = '';
	if (env.USE_CLOUDFLARE_IMAGES && image.mimeType.startsWith('image/')) {
		try {
			cfImagesUrl = await uploadImageToCloudflareImages(env, image, 'user-asset', bytes);
		} catch (err) {
			console.warn('Cloudflare Images upload failed, will try R2 fallback', {
				error: err instanceof Error ? err.message : String(err),
				filename: image.filename,
				mimeType: image.mimeType,
				size: image.size,
				type: 'agent-asset',
			});
		}
	}

	const r2Key = `assets/${agentId}/${relativePath}`;
	const description = typeof image.description === 'string' ? image.description.trim() : '';
	await env.TEMPLATES_BUCKET.put(r2Key, bytes, {
		httpMetadata: { contentType: image.mimeType },
		customMetadata: {
			cfImagesUrl: cfImagesUrl || '',
			uploadedAt,
			...(description ? { description } : {}),
		},
	});

	const url = getAgentAssetFilePublicUrl(env, agentId, relativePath);
	const hash = await hashPromise;

	return {
		...image,
		publicUrl: cfImagesUrl || url,
		hash,
		mimeType: image.mimeType,
		r2Key,
		uploadedAt,
	};
}

function sanitizeBase64Data(dataUrl: string): string {
	return dataUrl.replace(/^data:[^;]+;base64,/, '');
}

export async function hashImageB64url(dataUrl: string): Promise<string> {
    // This is required for both hashing and uploading.
    const imageBuffer = Buffer.from(sanitizeBase64Data(dataUrl), 'base64');

    // Calculate the SHA-256 hash of the image data for a unique fingerprint.
    const hashBuffer = await crypto.subtle.digest('SHA-256', imageBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hash;
}

export async function imageToBase64(env: Env, image: ProcessedImageAttachment): Promise<string> {
    try {
        // If base64 data is not available, try to fetch it from the r2 key
        if (!image.base64Data) {
            const r2Key = image.r2Key;
            if (!r2Key) {
                throw new Error('No R2 key provided for image');
            }
            image = await downloadR2Image(env, r2Key);
        }
        return `data:${image.mimeType};base64,${image.base64Data}`;
    } catch (error) {
        console.error('Failed to convert image to base64:', error, image);
        return '';
    }
}

export async function imagesToBase64(env: Env, images: ProcessedImageAttachment[]): Promise<string[]> {
    return (await Promise.all(images.map(image => imageToBase64(env, image)))).filter((image) => image !== '');
}

export async function downloadR2Image(env: Env, r2Key: string) : Promise<ProcessedImageAttachment> {
    const response = await env.TEMPLATES_BUCKET.get(r2Key);
    if (!response || !response.body) {
        throw new Error('Failed to fetch image from R2');
    }
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.httpMetadata!.contentType! as SupportedChatMediaMimeType;
    const customMetadata = response.customMetadata;
    const cfImagesUrl = customMetadata?.cfImagesUrl;
    const uploadedAt = customMetadata?.uploadedAt || response.uploaded.toISOString();
    const description = typeof customMetadata?.description === 'string' ? customMetadata.description.trim() : '';
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    // Get the filename and mimeType from response
    return {
        base64Data: sanitizeBase64Data(base64),
        r2Key,
        publicUrl: cfImagesUrl || getPublicUrlForBucketKey(env, r2Key),
        hash: await hashImageB64url(base64),
        mimeType,
        uploadedAt,
        ...(description ? { description } : {}),
    };
}
