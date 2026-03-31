export interface CommentAuthor {
	id: string;
	displayName: string | null;
	username: string | null;
	avatarUrl: string | null;
}

export interface CommentData {
	id: string;
	appId: string;
	content: string;
	parentCommentId: string | null;
	isEdited: boolean;
	createdAt: string;
	author: CommentAuthor;
	likeCount: number;
	userLiked: boolean;
	replyCount: number;
}

export interface CommentsListData {
	comments: CommentData[];
	totalCount: number;
}

export interface CommentCreateData {
	comment: CommentData;
}

export interface CommentLikeToggleData {
	liked: boolean;
	likeCount: number;
}
