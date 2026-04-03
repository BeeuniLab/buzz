import { BaseController } from '../baseController';
import type { ControllerResponse, ApiResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { getAgentStubLightweight } from '../../../agents';

type AssetCategory = 'images' | '3d' | 'audio' | 'fonts' | 'other';

interface AssetItem {
	key: string;
	name: string;
	size: number;
	type: string;
	category: AssetCategory;
	uploadedAt: string;
}

interface AssetListResponse {
	assets: AssetItem[];
	totalCount: number;
}

const MIME_MAP: Record<string, string> = {
	'.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
	'.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
	'.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
	'.mp4': 'video/mp4', '.webm': 'video/webm',
	'.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
	'.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'model/obj',
	'.fbx': 'application/octet-stream',
};

const CATEGORY_EXTENSIONS: Record<string, string[]> = {
	images: ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'],
	'3d': ['.glb', '.gltf', '.obj', '.fbx'],
	audio: ['.mp3', '.wav', '.ogg'],
	fonts: ['.woff', '.woff2', '.ttf'],
};

function categorizeByExtension(filename: string): 'images' | '3d' | 'audio' | 'fonts' | 'other' {
	const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
	for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS)) {
		if (extensions.includes(ext)) return category as 'images' | '3d' | 'audio' | 'fonts';
	}
	return 'other';
}

function getMimeType(filename: string): string {
	const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
	return MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * List all assets for an agent and sync the asset_map file to the agent's git filesystem.
 * Runs in the background — failures are logged but do not affect the API response.
 */
async function syncAssetMap(env: Env, agentId: string): Promise<void> {
	const prefix = `assets/${agentId}/`;
	const listed = await env.TEMPLATES_BUCKET.list({ prefix, limit: 500 });

	const protocol = env.CUSTOM_DOMAIN?.startsWith('localhost') ? 'http' : 'https';
	const baseUrl = `${protocol}://${env.CUSTOM_DOMAIN}/api/projects/${agentId}/assets/file`;

	const assetMap: Record<string, string> = {};
	for (const obj of listed.objects) {
		const relativePath = obj.key.replace(prefix, '');
		assetMap[relativePath] = `${baseUrl}/${relativePath}`;
	}

	const assetMapContent = JSON.stringify(assetMap, null, 2);
	const agentInstance = await getAgentStubLightweight(env, agentId);
	await agentInstance.updateAssetMap(assetMapContent);
}

export class AssetController extends BaseController {
	static logger = createLogger('AssetController');

	static async listAssets(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<AssetListResponse>>> {
		try {
			const agentId = context.pathParams.agentId;
			if (!agentId) {
				return AssetController.createErrorResponse('Missing agentId', 400);
			}

			const prefix = `assets/${agentId}/`;
			const listed = await env.TEMPLATES_BUCKET.list({ prefix, limit: 500 });

			const assets: AssetItem[] = listed.objects.map(obj => {
				const relativePath = obj.key.replace(prefix, '');
				const name = relativePath.includes('/') ? relativePath.split('/').pop()! : relativePath;
				return {
					key: relativePath,
					name,
					size: obj.size,
					type: obj.httpMetadata?.contentType || getMimeType(name),
					category: categorizeByExtension(name),
					uploadedAt: obj.uploaded.toISOString(),
				};
			});

			return AssetController.createSuccessResponse<AssetListResponse>({
				assets,
				totalCount: assets.length,
			});
		} catch (error) {
			AssetController.logger.error('Error listing assets', { error });
			return AssetController.createErrorResponse('Failed to list assets', 500);
		}
	}

	static async uploadAsset(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<AssetItem>>> {
		try {
			const agentId = context.pathParams.agentId;
			if (!agentId) {
				return AssetController.createErrorResponse('Missing agentId', 400);
			}

			const formData = await request.formData();
			const file = formData.get('file') as File | null;
			const category = (formData.get('category') as string) || 'images';

			if (!file) {
				return AssetController.createErrorResponse('No file provided', 400);
			}

			if (file.size > 10 * 1024 * 1024) {
				return AssetController.createErrorResponse('File too large (max 10MB)', 400);
			}

			const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
			const relativePath = `${category}/${filename}`;
			const r2Key = `assets/${agentId}/${relativePath}`;
			const contentType = file.type || getMimeType(filename);

			await env.TEMPLATES_BUCKET.put(r2Key, await file.arrayBuffer(), {
				httpMetadata: { contentType },
			});

			const asset: AssetItem = {
				key: relativePath,
				name: filename,
				size: file.size,
				type: contentType,
				category: categorizeByExtension(filename),
				uploadedAt: new Date().toISOString(),
			};

			// Sync asset_map to agent in the background
			ctx.waitUntil(
				syncAssetMap(env, agentId).catch(err =>
					AssetController.logger.error('Failed to sync asset map after upload', { error: err }),
				),
			);

			return AssetController.createSuccessResponse<AssetItem>(asset);
		} catch (error) {
			AssetController.logger.error('Error uploading asset', { error });
			return AssetController.createErrorResponse('Failed to upload asset', 500);
		}
	}

	static async deleteAsset(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<{ deleted: boolean }>>> {
		try {
			const agentId = context.pathParams.agentId;
			if (!agentId) {
				return AssetController.createErrorResponse('Missing agentId', 400);
			}

			const url = new URL(request.url);
			const assetKey = url.pathname.replace(`/api/projects/${agentId}/assets/`, '');

			if (!assetKey || assetKey.includes('..')) {
				return AssetController.createErrorResponse('Invalid asset key', 400);
			}

			const r2Key = `assets/${agentId}/${assetKey}`;
			await env.TEMPLATES_BUCKET.delete(r2Key);

			// Sync asset_map to agent in the background
			ctx.waitUntil(
				syncAssetMap(env, agentId).catch(err =>
					AssetController.logger.error('Failed to sync asset map after delete', { error: err }),
				),
			);

			return AssetController.createSuccessResponse({ deleted: true });
		} catch (error) {
			AssetController.logger.error('Error deleting asset', { error });
			return AssetController.createErrorResponse('Failed to delete asset', 500);
		}
	}

	static async serveAsset(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<never>>> {
		try {
			const agentId = context.pathParams.agentId;
			if (!agentId) {
				return AssetController.createErrorResponse('Missing agentId', 400);
			}

			const url = new URL(request.url);
			const assetKey = url.pathname.replace(`/api/projects/${agentId}/assets/file/`, '');

			if (!assetKey || assetKey.includes('..')) {
				return AssetController.createErrorResponse('Invalid asset key', 400);
			}

			const r2Key = `assets/${agentId}/${assetKey}`;
			const obj = await env.TEMPLATES_BUCKET.get(r2Key);

			if (!obj || !obj.body) {
				return AssetController.createErrorResponse('Asset not found', 404);
			}

			const contentType = obj.httpMetadata?.contentType || getMimeType(assetKey) || 'application/octet-stream';
			return new Response(obj.body, {
				headers: {
					'Content-Type': contentType,
					'Cache-Control': 'public, max-age=86400',
					'X-Content-Type-Options': 'nosniff',
				},
			}) as unknown as ControllerResponse<ApiResponse<never>>;
		} catch (error) {
			AssetController.logger.error('Error serving asset', { error });
			return AssetController.createErrorResponse('Failed to serve asset', 500);
		}
	}
}
