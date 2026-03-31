import { BaseService } from './BaseService';
import * as schema from '../schema';
import { eq, and, sql, desc, isNull } from 'drizzle-orm';
import { generateId } from '../../utils/idGenerator';
import type { CommentData, CommentAuthor } from '../../api/controllers/comments/types';

export class CommentService extends BaseService {

	async getComments(
		appId: string,
		options: { limit?: number; offset?: number; userId?: string }
	): Promise<{ comments: CommentData[]; totalCount: number }> {
		const limit = options.limit ?? 20;
		const offset = options.offset ?? 0;

		const [rows, countResult] = await Promise.all([
			this.database
				.select({
					id: schema.appComments.id,
					appId: schema.appComments.appId,
					content: schema.appComments.content,
					parentCommentId: schema.appComments.parentCommentId,
					isEdited: schema.appComments.isEdited,
					createdAt: schema.appComments.createdAt,
					authorId: schema.users.id,
					authorDisplayName: schema.users.displayName,
					authorUsername: schema.users.username,
					authorAvatarUrl: schema.users.avatarUrl,
					likeCount: sql<number>`(SELECT COUNT(*) FROM comment_likes WHERE comment_likes.comment_id = ${schema.appComments.id})`.as('like_count'),
					replyCount: sql<number>`(SELECT COUNT(*) FROM app_comments AS r WHERE r.parent_comment_id = ${schema.appComments.id} AND r.is_deleted = 0)`.as('reply_count'),
					userLiked: options.userId
						? sql<number>`(SELECT COUNT(*) FROM comment_likes WHERE comment_likes.comment_id = ${schema.appComments.id} AND comment_likes.user_id = ${options.userId})`.as('user_liked')
						: sql<number>`0`.as('user_liked'),
				})
				.from(schema.appComments)
				.innerJoin(schema.users, eq(schema.appComments.userId, schema.users.id))
				.where(and(
					eq(schema.appComments.appId, appId),
					eq(schema.appComments.isDeleted, false),
					isNull(schema.appComments.parentCommentId),
				))
				.orderBy(desc(schema.appComments.createdAt))
				.limit(limit)
				.offset(offset),

			this.database
				.select({ count: sql<number>`COUNT(*)` })
				.from(schema.appComments)
				.where(and(
					eq(schema.appComments.appId, appId),
					eq(schema.appComments.isDeleted, false),
					isNull(schema.appComments.parentCommentId),
				))
				.get(),
		]);

		const comments = rows.map((row) => this.mapRowToComment(row));
		return { comments, totalCount: countResult?.count ?? 0 };
	}

	async getReplies(
		parentCommentId: string,
		userId?: string
	): Promise<CommentData[]> {
		const rows = await this.database
			.select({
				id: schema.appComments.id,
				appId: schema.appComments.appId,
				content: schema.appComments.content,
				parentCommentId: schema.appComments.parentCommentId,
				isEdited: schema.appComments.isEdited,
				createdAt: schema.appComments.createdAt,
				authorId: schema.users.id,
				authorDisplayName: schema.users.displayName,
				authorUsername: schema.users.username,
				authorAvatarUrl: schema.users.avatarUrl,
				likeCount: sql<number>`(SELECT COUNT(*) FROM comment_likes WHERE comment_likes.comment_id = ${schema.appComments.id})`.as('like_count'),
				replyCount: sql<number>`0`.as('reply_count'),
				userLiked: userId
					? sql<number>`(SELECT COUNT(*) FROM comment_likes WHERE comment_likes.comment_id = ${schema.appComments.id} AND comment_likes.user_id = ${userId})`.as('user_liked')
					: sql<number>`0`.as('user_liked'),
			})
			.from(schema.appComments)
			.innerJoin(schema.users, eq(schema.appComments.userId, schema.users.id))
			.where(and(
				eq(schema.appComments.parentCommentId, parentCommentId),
				eq(schema.appComments.isDeleted, false),
			))
			.orderBy(schema.appComments.createdAt);

		return rows.map((row) => this.mapRowToComment(row));
	}

	async createComment(data: {
		appId: string;
		userId: string;
		content: string;
		parentCommentId?: string;
	}): Promise<CommentData> {
		const id = generateId();
		const now = new Date();

		await this.database
			.insert(schema.appComments)
			.values({
				id,
				appId: data.appId,
				userId: data.userId,
				content: data.content,
				parentCommentId: data.parentCommentId ?? null,
				createdAt: now,
				updatedAt: now,
			});

		// Fetch the created comment with author info
		const row = await this.database
			.select({
				id: schema.appComments.id,
				appId: schema.appComments.appId,
				content: schema.appComments.content,
				parentCommentId: schema.appComments.parentCommentId,
				isEdited: schema.appComments.isEdited,
				createdAt: schema.appComments.createdAt,
				authorId: schema.users.id,
				authorDisplayName: schema.users.displayName,
				authorUsername: schema.users.username,
				authorAvatarUrl: schema.users.avatarUrl,
				likeCount: sql<number>`0`.as('like_count'),
				replyCount: sql<number>`0`.as('reply_count'),
				userLiked: sql<number>`0`.as('user_liked'),
			})
			.from(schema.appComments)
			.innerJoin(schema.users, eq(schema.appComments.userId, schema.users.id))
			.where(eq(schema.appComments.id, id))
			.get();

		if (!row) throw new Error('Failed to create comment');
		return this.mapRowToComment(row);
	}

	async toggleLike(
		commentId: string,
		userId: string
	): Promise<{ liked: boolean; likeCount: number }> {
		const existing = await this.database
			.select({ id: schema.commentLikes.id })
			.from(schema.commentLikes)
			.where(and(
				eq(schema.commentLikes.commentId, commentId),
				eq(schema.commentLikes.userId, userId),
			))
			.get();

		if (existing) {
			await this.database
				.delete(schema.commentLikes)
				.where(eq(schema.commentLikes.id, existing.id));
		} else {
			await this.database
				.insert(schema.commentLikes)
				.values({
					id: generateId(),
					commentId,
					userId,
					reactionType: 'like',
					createdAt: new Date(),
				});
		}

		const result = await this.database
			.select({ count: sql<number>`COUNT(*)` })
			.from(schema.commentLikes)
			.where(eq(schema.commentLikes.commentId, commentId))
			.get();

		return { liked: !existing, likeCount: result?.count ?? 0 };
	}

	async deleteComment(commentId: string, userId: string): Promise<boolean> {
		const result = await this.database
			.update(schema.appComments)
			.set({ isDeleted: true, updatedAt: new Date() })
			.where(and(
				eq(schema.appComments.id, commentId),
				eq(schema.appComments.userId, userId),
			))
			.returning({ id: schema.appComments.id });

		return result.length > 0;
	}

	async getCommentCount(appId: string): Promise<number> {
		const result = await this.database
			.select({ count: sql<number>`COUNT(*)` })
			.from(schema.appComments)
			.where(and(
				eq(schema.appComments.appId, appId),
				eq(schema.appComments.isDeleted, false),
			))
			.get();

		return result?.count ?? 0;
	}

	private mapRowToComment(row: {
		id: string;
		appId: string;
		content: string;
		parentCommentId: string | null;
		isEdited: boolean | null;
		createdAt: Date | null;
		authorId: string;
		authorDisplayName: string | null;
		authorUsername: string | null;
		authorAvatarUrl: string | null;
		likeCount: number;
		replyCount: number;
		userLiked: number;
	}): CommentData {
		const author: CommentAuthor = {
			id: row.authorId,
			displayName: row.authorDisplayName,
			username: row.authorUsername,
			avatarUrl: row.authorAvatarUrl,
		};

		return {
			id: row.id,
			appId: row.appId,
			content: row.content,
			parentCommentId: row.parentCommentId,
			isEdited: row.isEdited ?? false,
			createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
			author,
			likeCount: row.likeCount,
			userLiked: row.userLiked > 0,
			replyCount: row.replyCount,
		};
	}
}
