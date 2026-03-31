import { BaseController } from '../baseController';
import { CommentService } from '../../../database/services/CommentService';
import type { RouteContext } from '../../types/route-context';
import type { ControllerResponse, ApiResponse } from '../types';
import type {
	CommentsListData,
	CommentCreateData,
	CommentLikeToggleData,
} from './types';

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
