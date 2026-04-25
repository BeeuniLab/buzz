import { BaseController } from '../baseController';
import type { ControllerResponse, ApiResponse } from '../types';
import type { RouteContext } from '../../types/route-context';
import { createLogger } from '../../../logger';
import { sanitizeAgentAssetFilename, syncAgentAssetMap } from '../../../utils/agentAssets';

type AssetCategory = 'images' | 'video' | '3d' | 'audio' | 'fonts' | 'other';
const ASSET_CATEGORIES: readonly AssetCategory[] = ['images', 'video', '3d', 'audio', 'fonts', 'other'];
const MAX_ASSET_SIZE_BYTES = 10 * 1024 * 1024;

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
	'.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.weba': 'audio/webm',
	'.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
	'.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
	'.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'model/obj',
	'.fbx': 'application/octet-stream',
};

const CATEGORY_EXTENSIONS: Record<string, string[]> = {
	images: ['.webp', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'],
	video: ['.mp4', '.webm', '.mov'],
	'3d': ['.glb', '.gltf', '.obj', '.fbx'],
	audio: ['.mp3', '.wav', '.ogg', '.weba'],
	fonts: ['.woff', '.woff2', '.ttf'],
};

const CATEGORY_MIME_TYPES: Record<string, string[]> = {
	images: ['image/webp', 'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/x-icon'],
	video: ['video/mp4', 'video/webm', 'video/quicktime'],
	'3d': ['model/gltf-binary', 'model/gltf+json', 'model/obj'],
	audio: ['audio/mpeg', 'audio/webm', 'audio/wav', 'audio/ogg'],
	fonts: ['font/woff', 'font/woff2', 'font/ttf'],
};

function getExtension(filename: string): string {
	const dotIndex = filename.lastIndexOf('.');
	return dotIndex === -1 ? '' : filename.substring(dotIndex).toLowerCase();
}

function isAssetCategory(value: string): value is AssetCategory {
	return ASSET_CATEGORIES.includes(value as AssetCategory);
}

function categorizeByExtension(filename: string): AssetCategory {
	const ext = getExtension(filename);
	for (const [category, extensions] of Object.entries(CATEGORY_EXTENSIONS)) {
		if (extensions.includes(ext)) return category as AssetCategory;
	}
	return 'other';
}

function getMimeType(filename: string): string {
	const ext = getExtension(filename);
	return MIME_MAP[ext] || 'application/octet-stream';
}

function isFileAllowedForCategory(filename: string, contentType: string, category: AssetCategory): boolean {
	if (category === 'other') return true;

	const normalizedContentType = contentType.toLowerCase();
	const categoryMimeTypes = CATEGORY_MIME_TYPES[category] ?? [];
	if (normalizedContentType && normalizedContentType !== 'application/octet-stream') {
		return categoryMimeTypes.includes(normalizedContentType);
	}

	const extensions = CATEGORY_EXTENSIONS[category] ?? [];
	return extensions.includes(getExtension(filename));
}

function categorizeByStoredPath(relativePath: string, contentType: string): AssetCategory {
	const [folder, ...rest] = relativePath.split('/');
	const filename = rest.length > 0 ? rest.join('/') : relativePath;
	if (folder && isAssetCategory(folder) && isFileAllowedForCategory(filename, contentType, folder)) {
		return folder;
	}
	return categorizeByExtension(filename);
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
				const contentType = obj.httpMetadata?.contentType || getMimeType(name);
				return {
					key: relativePath,
					name,
					size: obj.size,
					type: contentType,
					category: categorizeByStoredPath(relativePath, contentType),
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
			const requestedCategory = (formData.get('category') as string) || 'images';

			if (!file) {
				return AssetController.createErrorResponse('No file provided', 400);
			}

			if (!isAssetCategory(requestedCategory)) {
				return AssetController.createErrorResponse('Invalid asset category', 400);
			}

			if (file.size > MAX_ASSET_SIZE_BYTES) {
				return AssetController.createErrorResponse('File too large (max 10MB)', 400);
			}

			const filename = sanitizeAgentAssetFilename(file.name);
			const contentType = file.type || getMimeType(filename);

			if (!isFileAllowedForCategory(filename, contentType, requestedCategory)) {
				return AssetController.createErrorResponse(`File type does not match ${requestedCategory} upload`, 400);
			}

			const relativePath = `${requestedCategory}/${filename}`;
			const r2Key = `assets/${agentId}/${relativePath}`;

			await env.TEMPLATES_BUCKET.put(r2Key, await file.arrayBuffer(), {
				httpMetadata: { contentType },
			});

			const asset: AssetItem = {
				key: relativePath,
				name: filename,
				size: file.size,
				type: contentType,
				category: requestedCategory,
				uploadedAt: new Date().toISOString(),
			};

			// Sync asset_map to agent in the background
			ctx.waitUntil(
				syncAgentAssetMap(env, agentId).catch(err =>
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
				syncAgentAssetMap(env, agentId).catch(err =>
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
