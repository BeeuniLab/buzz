import { getProtocolForHost } from './urls';

export function sanitizeAgentAssetFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function getAgentAssetFilePublicUrl(env: Env, agentId: string, relativePath: string): string {
	const protocol = getProtocolForHost(env.CUSTOM_DOMAIN);
	const base = `${protocol}://${env.CUSTOM_DOMAIN}`;
	return `${base}/api/projects/${agentId}/assets/file/${relativePath}`;
}

const ASSETS_KEY_RE = /^assets\/([^/]+)\/(.+)$/;

/** Public URL for an object in TEMPLATES_BUCKET (project assets vs legacy /api/{key} paths). */
export function getPublicUrlForBucketKey(env: Env, r2Key: string): string {
	const m = r2Key.match(ASSETS_KEY_RE);
	if (m) {
		return getAgentAssetFilePublicUrl(env, m[1], m[2]);
	}
	const protocol = getProtocolForHost(env.CUSTOM_DOMAIN);
	const base = `${protocol}://${env.CUSTOM_DOMAIN}`;
	return `${base}/api/${r2Key}`;
}

export async function computeAgentAssetMapJson(env: Env, agentId: string): Promise<string> {
	const prefix = `assets/${agentId}/`;
	const listed = await env.TEMPLATES_BUCKET.list({ prefix, limit: 500 });

	const protocol = getProtocolForHost(env.CUSTOM_DOMAIN);
	const baseUrl = `${protocol}://${env.CUSTOM_DOMAIN}/api/projects/${agentId}/assets/file`;

	const assetMap: Record<string, string> = {};
	for (const obj of listed.objects) {
		const relativePath = obj.key.replace(prefix, '');
		assetMap[relativePath] = `${baseUrl}/${relativePath}`;
	}

	return JSON.stringify(assetMap, null, 2);
}

export async function syncAgentAssetMap(env: Env, agentId: string): Promise<void> {
	const assetMapContent = await computeAgentAssetMapJson(env, agentId);
	const { getAgentStubLightweight } = await import('../agents');
	const agentInstance = await getAgentStubLightweight(env, agentId);
	await agentInstance.updateAssetMap(assetMapContent);
}

/** Stable relative path under assets/{agentId}/ for an image (dedupes same batch). */
export function uniqueAgentAssetRelativePath(
	image: { id: string; filename: string },
	index: number,
	used: Set<string>,
): string {
	const base = sanitizeAgentAssetFilename(image.filename);
	let rel = `images/${base}`;
	if (used.has(rel)) {
		const lastDot = base.lastIndexOf('.');
		const stem = lastDot > 0 ? base.slice(0, lastDot) : base;
		const ext = lastDot > 0 ? base.slice(lastDot) : '';
		rel = `images/${stem}_${image.id.slice(0, 8)}${ext}`;
	}
	if (used.has(rel)) {
		rel = `images/upload_${index}_${base}`;
	}
	used.add(rel);
	return rel;
}
