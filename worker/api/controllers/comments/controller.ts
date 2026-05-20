import { BaseController } from '../baseController';
import { CommentService } from '../../../database/services/CommentService';
import type { RouteContext } from '../../types/route-context';
import type { ControllerResponse, ApiResponse } from '../types';
import type {
	CommentsListData,
	CommentCreateData,
	CommentLikeToggleData,
	CommentMediaUploadData,
} from './types';

const COMMENT_MEDIA_PREFIX = 'comment-media';
const MAX_COMMENT_MEDIA_SIZE_BYTES = 10 * 1024 * 1024;
const COMMENT_MEDIA_MIME_TYPES = new Set([
	'image/webp',
	'image/png',
	'image/jpeg',
	'image/gif',
]);

const COMMENT_MEDIA_EXTENSION_BY_MIME: Record<string, string> = {
	'image/webp': 'webp',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
};

const COMMENT_MEDIA_MIME_BY_EXTENSION: Record<string, string> = {
	webp: 'image/webp',
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
};

function sanitizeCommentMediaFilename(filename: string, contentType: string): string {
	const fallbackExtension = COMMENT_MEDIA_EXTENSION_BY_MIME[contentType] || 'webp';
	const normalized = filename
		.replace(/[^a-zA-Z0-9._-]/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 80);
	const safeName = normalized || `comment-media.${fallbackExtension}`;
	if (safeName.includes('.')) return safeName;
	return `${safeName}.${fallbackExtension}`;
}

function getCommentMediaContentType(key: string, fallback?: string): string {
	if (fallback && COMMENT_MEDIA_MIME_TYPES.has(fallback)) return fallback;
	const extension = key.split('.').pop()?.toLowerCase() || '';
	return COMMENT_MEDIA_MIME_BY_EXTENSION[extension] || 'application/octet-stream';
}

export class CommentController extends BaseController {

	static async getComments(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<CommentsListData>>> {
		try {
			const appId = context.pathParams.appId;
			if (!appId) {
				return CommentController.createErrorResponse<CommentsListData>('appId is required', 400);
			}

			const limit = parseInt(context.queryParams.get('limit') || '20', 10);
			const offset = parseInt(context.queryParams.get('offset') || '0', 10);
			const parentCommentId = context.queryParams.get('parentCommentId');

			const optionalUser = await CommentController.getOptionalUser(request, env);
			const commentService = new CommentService(env);

			if (parentCommentId) {
				const replies = await commentService.getReplies(parentCommentId, optionalUser?.id);
				return CommentController.createSuccessResponse<CommentsListData>({
					comments: replies,
					totalCount: replies.length,
				});
			}

			const result = await commentService.getComments(appId, {
				limit,
				offset,
				userId: optionalUser?.id,
			});

			return CommentController.createSuccessResponse<CommentsListData>(result);
		} catch (error) {
			return CommentController.createErrorResponse<CommentsListData>('Failed to get comments', 500);
		}
	}

	static async createComment(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<CommentCreateData>>> {
		try {
			const user = context.user;
			CommentController.requireAuthentication(user);

			const appId = context.pathParams.appId;
			if (!appId) {
				return CommentController.createErrorResponse<CommentCreateData>('appId is required', 400);
			}

			const body = await CommentController.parseJsonBody<{
				content: string;
				parentCommentId?: string;
			}>(request);

			if (!body.success || !body.data) {
				return CommentController.createErrorResponse<CommentCreateData>('Invalid request body', 400);
			}

			const { content, parentCommentId } = body.data;

			if (!content || content.trim().length === 0) {
				return CommentController.createErrorResponse<CommentCreateData>('Comment content is required', 400);
			}

			if (content.length > 2000) {
				return CommentController.createErrorResponse<CommentCreateData>('Comment must be 2000 characters or less', 400);
			}

			const commentService = new CommentService(env);
			const comment = await commentService.createComment({
				appId,
				userId: user!.id,
				content: content.trim(),
				parentCommentId,
			});

			return CommentController.createSuccessResponse<CommentCreateData>({ comment });
		} catch (error) {
			return CommentController.createErrorResponse<CommentCreateData>('Failed to create comment', 500);
		}
	}

	static async toggleLike(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<CommentLikeToggleData>>> {
		try {
			const user = context.user;
			CommentController.requireAuthentication(user);

			const commentId = context.pathParams.commentId;
			if (!commentId) {
				return CommentController.createErrorResponse<CommentLikeToggleData>('commentId is required', 400);
			}

			const commentService = new CommentService(env);
			const result = await commentService.toggleLike(commentId, user!.id);

			return CommentController.createSuccessResponse<CommentLikeToggleData>(result);
		} catch (error) {
			return CommentController.createErrorResponse<CommentLikeToggleData>('Failed to toggle like', 500);
		}
	}

	static async uploadCommentMedia(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<CommentMediaUploadData>>> {
		try {
			const user = context.user;
			CommentController.requireAuthentication(user);

			const appId = context.pathParams.appId;
			if (!appId) {
				return CommentController.createErrorResponse<CommentMediaUploadData>('appId is required', 400);
			}

			const formData = await request.formData();
			const file = formData.get('file') as File | null;
			const title = typeof formData.get('title') === 'string'
				? (formData.get('title') as string).trim().slice(0, 120)
				: '';

			if (!file) {
				return CommentController.createErrorResponse<CommentMediaUploadData>('No file provided', 400);
			}

			const contentType = file.type || getCommentMediaContentType(file.name);
			if (!COMMENT_MEDIA_MIME_TYPES.has(contentType)) {
				return CommentController.createErrorResponse<CommentMediaUploadData>('Unsupported comment media type', 400);
			}

			if (file.size > MAX_COMMENT_MEDIA_SIZE_BYTES) {
				return CommentController.createErrorResponse<CommentMediaUploadData>('File too large (max 10MB)', 400);
			}

			const uploadedAt = new Date().toISOString();
			const filename = sanitizeCommentMediaFilename(file.name, contentType);
			const key = `${COMMENT_MEDIA_PREFIX}/${appId}/${user!.id}/${crypto.randomUUID()}-${filename}`;

			await env.TEMPLATES_BUCKET.put(key, await file.arrayBuffer(), {
				httpMetadata: { contentType },
				customMetadata: {
					uploadedAt,
					...(title ? { title } : {}),
				},
			});

			return CommentController.createSuccessResponse<CommentMediaUploadData>({
				url: `/api/comment-media/${key.replace(`${COMMENT_MEDIA_PREFIX}/`, '')}`,
				key,
				name: filename,
				size: file.size,
				type: contentType,
				uploadedAt,
			});
		} catch (error) {
			return CommentController.createErrorResponse<CommentMediaUploadData>('Failed to upload comment media', 500);
		}
	}

	static async serveCommentMedia(
		request: Request,
		env: Env,
		_ctx: ExecutionContext,
		_context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<never>>> {
		try {
			const url = new URL(request.url);
			const mediaPath = decodeURIComponent(url.pathname.replace('/api/comment-media/', ''));
			if (
				!mediaPath ||
				mediaPath === url.pathname ||
				mediaPath.includes('..') ||
				mediaPath.includes('\\')
			) {
				return CommentController.createErrorResponse('Invalid media path', 400);
			}

			const key = `${COMMENT_MEDIA_PREFIX}/${mediaPath}`;
			const obj = await env.TEMPLATES_BUCKET.get(key);
			if (!obj || !obj.body) {
				return CommentController.createErrorResponse('Media not found', 404);
			}

			const contentType = getCommentMediaContentType(key, obj.httpMetadata?.contentType);
			return new Response(obj.body, {
				headers: {
					'Content-Type': contentType,
					'Cache-Control': 'public, max-age=31536000, immutable',
					'Cross-Origin-Resource-Policy': 'cross-origin',
					'X-Content-Type-Options': 'nosniff',
				},
			}) as unknown as ControllerResponse<ApiResponse<never>>;
		} catch (error) {
			return CommentController.createErrorResponse('Failed to serve comment media', 500);
		}
	}

	static async deleteComment(
		_request: Request,
		env: Env,
		_ctx: ExecutionContext,
		context: RouteContext,
	): Promise<ControllerResponse<ApiResponse<{ deleted: boolean }>>> {
		try {
			const user = context.user;
			CommentController.requireAuthentication(user);

			const commentId = context.pathParams.commentId;
			if (!commentId) {
				return CommentController.createErrorResponse<{ deleted: boolean }>('commentId is required', 400);
			}

			const commentService = new CommentService(env);
			const deleted = await commentService.deleteComment(commentId, user!.id);

			return CommentController.createSuccessResponse({ deleted });
		} catch (error) {
			return CommentController.createErrorResponse<{ deleted: boolean }>('Failed to delete comment', 500);
		}
	}
}
