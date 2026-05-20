import { CommentController } from '../controllers/comments/controller';
import { Hono } from 'hono';
import { AppEnv } from '../../types/appenv';
import { adaptController } from '../honoAdapter';
import { AuthConfig, setAuthLevel } from '../../middleware/auth/routeAuth';

export function setupCommentRoutes(app: Hono<AppEnv>): void {
	// List comments for an app (public, optional auth for userLiked)
	app.get(
		'/api/apps/:appId/comments',
		setAuthLevel(AuthConfig.public),
		adaptController(CommentController, CommentController.getComments),
	);

	// Create a comment (authenticated)
	app.post(
		'/api/apps/:appId/comments',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(CommentController, CommentController.createComment),
	);

	// Upload media used inside comments (authenticated, stored in BuzzPlay R2)
	app.post(
		'/api/apps/:appId/comments/media',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(CommentController, CommentController.uploadCommentMedia),
	);

	// Serve uploaded comment media (public)
	app.get(
		'/api/comment-media/*',
		setAuthLevel(AuthConfig.public),
		adaptController(CommentController, CommentController.serveCommentMedia),
	);

	// Toggle like on a comment (authenticated)
	app.post(
		'/api/comments/:commentId/like',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(CommentController, CommentController.toggleLike),
	);

	// Delete own comment (authenticated, soft delete)
	app.delete(
		'/api/comments/:commentId',
		setAuthLevel(AuthConfig.authenticated),
		adaptController(CommentController, CommentController.deleteComment),
	);
}
