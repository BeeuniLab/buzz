import type { AssetMapEntry } from 'shared/types/asset-map';
import { getProtocolForHost } from './urls';

/**
 * Parse existing asset_map file. Accepts legacy values that were plain URL strings.
 */
export function parseAssetMapJson(raw: string | null | undefined): Record<string, AssetMapEntry> {
	if (!raw || !raw.trim()) {
		return {};
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return {};
		}
		const out: Record<string, AssetMapEntry> = {};
		for (const [key, v] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof v === 'string') {
				out[key] = { url: v };
				continue;
			}
			if (v && typeof v === 'object' && typeof (v as { url?: unknown }).url === 'string') {
				const o = v as { url: string; description?: unknown; uploadedAt?: unknown };
				const entry: AssetMapEntry = { url: o.url };
				if (typeof o.description === 'string' && o.description.trim() !== '') {
					entry.description = o.description.trim();
				}
				if (typeof o.uploadedAt === 'string' && o.uploadedAt.trim() !== '') {
					entry.uploadedAt = o.uploadedAt.trim();
				}
				out[key] = entry;
			}
		}
		return out;
	} catch {
		return {};
	}
}

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

function isTemplateStarterAssetUrl(url: string): boolean {
	return url.startsWith('assets/') || url.startsWith('/assets/');
}

/**
 * Build asset_map JSON from R2 listing. Preserves local template starter assets and
 * `description` for uploaded paths that still exist in R2.
 * Values are always `{ url, uploadedAt? }` plus optional `description`.
 */
export async function computeAgentAssetMapJson(
	env: Env,
	agentId: string,
	existingFileContent?: string | null,
): Promise<string> {
	const existing = parseAssetMapJson(existingFileContent ?? undefined);
	const prefix = `assets/${agentId}/`;
	const listed = await env.TEMPLATES_BUCKET.list({ prefix, limit: 500 });

	const protocol = getProtocolForHost(env.CUSTOM_DOMAIN);
	const baseUrl = `${protocol}://${env.CUSTOM_DOMAIN}/api/projects/${agentId}/assets/file`;

	const assetMap: Record<string, AssetMapEntry> = {};

	const uploadedObjects = await Promise.all(listed.objects.map(async (obj) => {
		const metadata = obj.customMetadata ?? (await env.TEMPLATES_BUCKET.head(obj.key))?.customMetadata;
		const uploadedAt = metadata?.uploadedAt || obj.uploaded.toISOString();
		const uploadedTime = Number.isFinite(Date.parse(uploadedAt))
			? Date.parse(uploadedAt)
			: obj.uploaded.getTime();
		return { obj, uploadedAt, uploadedTime };
	}));
	uploadedObjects.sort((a, b) => {
		const byTime = a.uploadedTime - b.uploadedTime;
		return byTime !== 0 ? byTime : a.obj.key.localeCompare(b.obj.key);
	});
	for (const { obj, uploadedAt } of uploadedObjects) {
		const relativePath = obj.key.replace(prefix, '');
		const url = `${baseUrl}/${relativePath}`;
		const prev = existing[relativePath];
		const entry: AssetMapEntry = { url, uploadedAt };
		if (prev?.description) {
			entry.description = prev.description;
		}
		assetMap[relativePath] = entry;
	}

	const starterEntries = Object.entries(existing).filter(([, entry]) => isTemplateStarterAssetUrl(entry.url));
	starterEntries.sort(([a], [b]) => a.localeCompare(b));
	for (const [relativePath, entry] of starterEntries) {
		assetMap[relativePath] = entry;
	}

	return JSON.stringify(assetMap, null, 2);
}

export async function syncAgentAssetMap(env: Env, agentId: string): Promise<void> {
	const { getAgentStubLightweight } = await import('../agents');
	const agentInstance = await getAgentStubLightweight(env, agentId);
	const existing = await agentInstance.readSrcAssetMap();
	const assetMapContent = await computeAgentAssetMapJson(env, agentId, existing);
	await agentInstance.updateAssetMap(assetMapContent);
}

export function assetCategoryFolderForMime(mimeType: string): 'images' | 'audio' | 'video' | 'other' {
	if (mimeType.startsWith('image/')) return 'images';
	if (mimeType.startsWith('audio/')) return 'audio';
	if (mimeType.startsWith('video/')) return 'video';
	return 'other';
}

/** Stable relative path under assets/{agentId}/ (images|audio|video|other); dedupes same batch. */
export function uniqueAgentAssetRelativePath(
	file: { id: string; filename: string; mimeType: string },
	index: number,
	used: Set<string>,
): string {
	const folder = assetCategoryFolderForMime(file.mimeType);
	const base = sanitizeAgentAssetFilename(file.filename);
	let rel = `${folder}/${base}`;
	if (used.has(rel)) {
		const lastDot = base.lastIndexOf('.');
		const stem = lastDot > 0 ? base.slice(0, lastDot) : base;
		const ext = lastDot > 0 ? base.slice(lastDot) : '';
		rel = `${folder}/${stem}_${file.id.slice(0, 8)}${ext}`;
	}
	if (used.has(rel)) {
		rel = `${folder}/upload_${index}_${base}`;
	}
	used.add(rel);
	return rel;
}
