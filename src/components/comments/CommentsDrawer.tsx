import React from 'react';
import { Drawer, DrawerContent, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';
import { cn } from '@/lib/utils';
import { X, Heart, ArrowUp, ChevronDown, ChevronUp, Trash2, SmilePlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { CommentData } from '@/api-types';
import {
	KlipyMediaPicker,
	type KlipyMediaKind,
	type KlipySelectedMedia,
} from '@/components/klipy-media-picker';

interface CommentsDrawerProps {
	appId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	direction?: 'right' | 'bottom';
}

const COMMENT_KLIPY_KINDS: KlipyMediaKind[] = ['gifs', 'stickers', 'static-memes', 'emojis'];
const COMMENT_MEDIA_PATTERN = /\[buzzplay-media:([^\]\s]+)(?:\s+"([^"]*)")?\]/g;
type CommentMediaSelection = Pick<KlipySelectedMedia, 'previewUrl' | 'url' | 'title'>;

function isAllowedCommentMediaUrl(url: string): boolean {
	if (url.startsWith('/api/comment-media/')) return true;
	if (url.startsWith('/api/projects/') && url.includes('/assets/file/')) return true;
	try {
		const parsed = new URL(url, window.location.origin);
		return parsed.origin === window.location.origin && (
			parsed.pathname.startsWith('/api/comment-media/') ||
			(parsed.pathname.startsWith('/api/projects/') && parsed.pathname.includes('/assets/file/'))
		);
	} catch {
		return false;
	}
}

function encodeCommentMedia(media: CommentMediaSelection): string {
	const title = media.title.replace(/["\n\r]/g, ' ').trim().slice(0, 120);
	return `[buzzplay-media:${encodeURIComponent(media.previewUrl || media.url)} "${title}"]`;
}

function buildCommentContent(text: string, media: CommentMediaSelection | null): string {
	const trimmedText = text.trim();
	if (!media) return trimmedText;
	const encodedMedia = encodeCommentMedia(media);
	return trimmedText ? `${trimmedText}\n${encodedMedia}` : encodedMedia;
}

function CommentContent({ content, compact = false }: { content: string; compact?: boolean }) {
	const parts: React.ReactNode[] = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	COMMENT_MEDIA_PATTERN.lastIndex = 0;
	while ((match = COMMENT_MEDIA_PATTERN.exec(content)) !== null) {
		const [raw, encodedUrl, rawTitle] = match;
		const before = content.slice(lastIndex, match.index);
		if (before) {
			parts.push(
				<span key={`text-${match.index}`} className="whitespace-pre-wrap break-words">
					{before}
				</span>,
			);
		}

		try {
			const url = decodeURIComponent(encodedUrl);
			if (!isAllowedCommentMediaUrl(url)) {
				parts.push(raw);
				lastIndex = match.index + raw.length;
				continue;
			}
			const title = rawTitle?.trim() || 'KLIPY media';
			parts.push(
				<img
					key={`media-${match.index}`}
					src={url}
					alt={title}
					loading="lazy"
					className={cn(
						'mt-2 block max-w-full rounded-xl border-2 border-[var(--neo-border-color)] bg-bg-2 object-contain shadow-[2px_2px_0px_0px_var(--neo-border-color)]',
						compact ? 'max-h-28' : 'max-h-40',
					)}
				/>,
			);
		} catch {
			parts.push(raw);
		}

		lastIndex = match.index + raw.length;
	}

	const rest = content.slice(lastIndex);
	if (rest) {
		parts.push(
			<span key="text-rest" className="whitespace-pre-wrap break-words">
				{rest}
			</span>,
		);
	}

	return <div className={cn('mt-1 text-sm', compact && 'text-xs')}>{parts}</div>;
}

export function CommentsDrawer({ appId, open, onOpenChange, direction = 'right' }: CommentsDrawerProps) {
	const { user } = useAuth();
	const navigate = useNavigate();
	const [comments, setComments] = React.useState<CommentData[]>([]);
	const [totalCount, setTotalCount] = React.useState(0);
	const [loading, setLoading] = React.useState(false);
	const [submitting, setSubmitting] = React.useState(false);
	const [inputValue, setInputValue] = React.useState('');
	const [isKlipyPickerOpen, setIsKlipyPickerOpen] = React.useState(false);
	const [selectedMedia, setSelectedMedia] = React.useState<CommentMediaSelection | null>(null);
	const [replyingTo, setReplyingTo] = React.useState<{ commentId: string; authorName: string } | null>(null);
	const [expandedReplies, setExpandedReplies] = React.useState<Map<string, CommentData[]>>(new Map());
	const [loadingReplies, setLoadingReplies] = React.useState<Set<string>>(new Set());
	const listRef = React.useRef<HTMLDivElement>(null);

	const fetchComments = React.useCallback(async () => {
		setLoading(true);
		try {
			const res = await apiClient.getComments(appId, { limit: 50 });
			if (res.success && res.data) {
				setComments(res.data.comments);
				setTotalCount(res.data.totalCount);
			}
		} catch {
			// silently handle
		} finally {
			setLoading(false);
		}
	}, [appId]);

	React.useEffect(() => {
		if (open && appId) {
			fetchComments();
			setExpandedReplies(new Map());
			setReplyingTo(null);
			setInputValue('');
			setSelectedMedia(null);
		}
	}, [open, appId, fetchComments]);

	const handleSubmit = async () => {
		const content = buildCommentContent(inputValue, selectedMedia);
		if (!content || submitting || !user) return;

		setSubmitting(true);
		try {
			const res = await apiClient.createComment(appId, content, replyingTo?.commentId);
			if (res.success && res.data) {
				const newComment = res.data.comment;
				if (replyingTo) {
					// Add to expanded replies
					setExpandedReplies((prev) => {
						const next = new Map(prev);
						const existing = next.get(replyingTo.commentId) || [];
						next.set(replyingTo.commentId, [...existing, newComment]);
						return next;
					});
					// Update reply count on parent
					setComments((prev) =>
						prev.map((c) =>
							c.id === replyingTo.commentId
								? { ...c, replyCount: c.replyCount + 1 }
								: c,
						),
					);
				} else {
					setComments((prev) => [newComment, ...prev]);
					setTotalCount((prev) => prev + 1);
				}
				setInputValue('');
				setSelectedMedia(null);
				setReplyingTo(null);
			}
		} catch {
			// silently handle
		} finally {
			setSubmitting(false);
		}
	};

	const handleLike = async (commentId: string, isReply: boolean, parentId?: string) => {
		// Optimistic update
		const updateComment = (c: CommentData) =>
			c.id === commentId
				? { ...c, userLiked: !c.userLiked, likeCount: c.likeCount + (c.userLiked ? -1 : 1) }
				: c;

		if (isReply && parentId) {
			setExpandedReplies((prev) => {
				const next = new Map(prev);
				const replies = next.get(parentId);
				if (replies) next.set(parentId, replies.map(updateComment));
				return next;
			});
		} else {
			setComments((prev) => prev.map(updateComment));
		}

		try {
			await apiClient.toggleCommentLike(commentId);
		} catch {
			// Revert on error
			if (isReply && parentId) {
				setExpandedReplies((prev) => {
					const next = new Map(prev);
					const replies = next.get(parentId);
					if (replies) next.set(parentId, replies.map(updateComment));
					return next;
				});
			} else {
				setComments((prev) => prev.map(updateComment));
			}
		}
	};

	const handleDelete = async (commentId: string, isReply: boolean, parentId?: string) => {
		try {
			const res = await apiClient.deleteComment(commentId);
			if (res.success && res.data?.deleted) {
				if (isReply && parentId) {
					setExpandedReplies((prev) => {
						const next = new Map(prev);
						const replies = next.get(parentId);
						if (replies) next.set(parentId, replies.filter((c) => c.id !== commentId));
						return next;
					});
					setComments((prev) =>
						prev.map((c) =>
							c.id === parentId ? { ...c, replyCount: c.replyCount - 1 } : c,
						),
					);
				} else {
					setComments((prev) => prev.filter((c) => c.id !== commentId));
					setTotalCount((prev) => prev - 1);
				}
			}
		} catch {
			// silently handle
		}
	};

	const handleToggleReplies = async (commentId: string) => {
		if (expandedReplies.has(commentId)) {
			setExpandedReplies((prev) => {
				const next = new Map(prev);
				next.delete(commentId);
				return next;
			});
			return;
		}

		setLoadingReplies((prev) => new Set(prev).add(commentId));
		try {
			const res = await apiClient.getComments(appId, { parentCommentId: commentId });
			if (res.success && res.data) {
				setExpandedReplies((prev) => {
					const next = new Map(prev);
					next.set(commentId, res.data!.comments);
					return next;
				});
			}
		} catch {
			// silently handle
		} finally {
			setLoadingReplies((prev) => {
				const next = new Set(prev);
				next.delete(commentId);
				return next;
			});
		}
	};

	const handleAvatarClick = (userId: string) => {
		onOpenChange(false);
		navigate(`/profile/${userId}`);
	};

	const handleKlipyMediaSelected = React.useCallback(async (media: KlipySelectedMedia) => {
		if (!media.file) {
			toast.error('Could not import this item');
			return;
		}

		const res = await apiClient.uploadCommentMedia(appId, media.file, media.title);
		if (!res.success || !res.data?.url) {
			throw new Error(res.message || 'Failed to upload comment media');
		}

		setSelectedMedia({
			previewUrl: res.data.url,
			url: res.data.url,
			title: media.title,
		});
	}, [appId]);

	const canSubmit = Boolean(buildCommentContent(inputValue, selectedMedia)) && !submitting;

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction={direction}>
			<DrawerContent
				className={cn(
					direction === 'bottom'
						? 'h-[75vh] z-[70]'
						: '!w-[400px] !sm:max-w-[400px] h-full rounded-none',
					'flex flex-col'
				)}
				overlayClassName={direction === 'bottom' ? 'z-[70]' : undefined}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-5 py-4 border-b border-border-primary">
					<div className="flex items-center gap-3">
						<DrawerTitle className="text-xl font-bold">Comments</DrawerTitle>
						<span className="bg-bg-2 text-text-tertiary text-sm font-medium px-2.5 py-0.5 rounded-full">
							{totalCount + comments.reduce((sum, c) => sum + (c.replyCount || 0), 0)}
						</span>
					</div>
					<DrawerClose className="p-1.5 rounded-full hover:bg-bg-2 transition-colors">
						<X className="h-5 w-5 text-text-tertiary" />
					</DrawerClose>
				</div>

				{/* Comment List */}
				<div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
					{loading ? (
						<div className="flex items-center justify-center py-12">
							<div className="h-6 w-6 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
						</div>
					) : comments.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-text-tertiary">
							<p className="font-medium">No comments yet</p>
							<p className="text-sm mt-1">Be the first to comment!</p>
						</div>
					) : (
						comments.map((comment) => (
							<CommentItem
								key={comment.id}
								comment={comment}
								currentUserId={user?.id}
								onLike={(id) => handleLike(id, false)}
								onReply={(id, name) => setReplyingTo({ commentId: id, authorName: name })}
								onDelete={(id) => handleDelete(id, false)}
								onToggleReplies={handleToggleReplies}
								onAvatarClick={handleAvatarClick}
								replies={expandedReplies.get(comment.id)}
								loadingReplies={loadingReplies.has(comment.id)}
								isExpanded={expandedReplies.has(comment.id)}
								onLikeReply={(id) => handleLike(id, true, comment.id)}
								onDeleteReply={(id) => handleDelete(id, true, comment.id)}
								onReplyToReply={(_, name) => setReplyingTo({ commentId: comment.id, authorName: name })}
							/>
						))
					)}
				</div>

				{/* Input Bar */}
				<div className="border-t-2 border-[var(--neo-border-color)] p-3">
					{replyingTo && (
						<div className="flex items-center gap-2 px-2 pb-2 text-sm text-text-tertiary">
							<span>Replying to <span className="font-bold text-text-primary">{replyingTo.authorName}</span></span>
							<button
								onClick={() => setReplyingTo(null)}
								className="p-0.5 rounded-lg border border-[var(--neo-border-color)] hover:bg-neo-yellow/30"
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</div>
					)}
					{user ? (
						<div className="space-y-2">
							{selectedMedia && (
								<div className="flex items-center gap-2 rounded-xl border-2 border-[var(--neo-border-color)] bg-bg-3 p-2 shadow-[2px_2px_0px_0px_var(--neo-border-color)]">
									<img
										src={selectedMedia.previewUrl || selectedMedia.url}
										alt={selectedMedia.title}
										className="size-14 rounded-lg border border-[var(--neo-border-color)] bg-bg-2 object-contain"
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate text-xs font-black text-text-primary">{selectedMedia.title}</p>
										<p className="text-[11px] font-medium text-text-tertiary">KLIPY</p>
									</div>
									<button
										type="button"
										onClick={() => setSelectedMedia(null)}
										className="grid size-7 place-items-center rounded-full border-2 border-[var(--neo-border-color)] bg-bg-4 text-text-primary shadow-[1px_1px_0px_0px_var(--neo-border-color)]"
										aria-label="Remove KLIPY sticker"
									>
										<X className="size-3.5" />
									</button>
								</div>
							)}
							<div className="flex items-center gap-2">
								<input
									value={inputValue}
									onChange={(e) => setInputValue(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											handleSubmit();
										}
									}}
									placeholder="Write a comment..."
									className="flex-1 bg-bg-4 rounded-lg border-2 border-[var(--neo-border-color)] px-4 py-2.5 text-sm font-medium text-text-primary placeholder:text-text-tertiary shadow-[2px_2px_0px_0px_var(--neo-border-color)] outline-none focus:shadow-[3px_3px_0px_0px_var(--neo-border-color)] transition-all"
									disabled={submitting}
								/>
								<button
									type="button"
									onClick={() => setIsKlipyPickerOpen(true)}
									disabled={submitting}
									aria-label="Add KLIPY sticker"
									className="rounded-lg border-2 border-[var(--neo-border-color)] bg-neo-pink p-2.5 text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
								>
									<SmilePlus className="h-4 w-4" />
								</button>
								<button
									onClick={handleSubmit}
									disabled={!canSubmit}
									className={cn(
										'p-2.5 rounded-lg border-2 border-[var(--neo-border-color)] transition-all',
										canSubmit
											? 'bg-neo-orange text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)] hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none'
											: 'bg-bg-2 text-text-tertiary',
									)}
								>
									<ArrowUp className="h-4 w-4" />
								</button>
							</div>
						</div>
					) : (
						<p className="text-center text-sm text-text-tertiary font-bold py-2">
							Sign in to comment
						</p>
					)}
				</div>
				<KlipyMediaPicker
					open={isKlipyPickerOpen}
					onOpenChange={setIsKlipyPickerOpen}
					onMediaSelected={handleKlipyMediaSelected}
					allowedKinds={COMMENT_KLIPY_KINDS}
					initialKind="emojis"
					disabled={submitting}
				/>
			</DrawerContent>
		</Drawer>
	);
}

// ---- Comment Item ----

interface CommentItemProps {
	comment: CommentData;
	currentUserId?: string;
	onLike: (commentId: string) => void;
	onReply: (commentId: string, authorName: string) => void;
	onDelete: (commentId: string) => void;
	onToggleReplies: (commentId: string) => void;
	onAvatarClick: (userId: string) => void;
	replies?: CommentData[];
	loadingReplies: boolean;
	isExpanded: boolean;
	onLikeReply: (commentId: string) => void;
	onDeleteReply: (commentId: string) => void;
	onReplyToReply: (commentId: string, authorName: string) => void;
}

function CommentItem({
	comment,
	currentUserId,
	onLike,
	onReply,
	onDelete,
	onToggleReplies,
	onAvatarClick,
	replies,
	loadingReplies,
	isExpanded,
	onLikeReply,
	onDeleteReply,
	onReplyToReply,
}: CommentItemProps) {
	const authorName = comment.author.displayName || comment.author.username || 'Anonymous';
	const isOwnComment = currentUserId === comment.author.id;

	return (
		<div className="space-y-3">
			<div className="flex gap-3 items-start">
				<button onClick={() => onAvatarClick(comment.author.id)} className="flex-shrink-0 mt-0.5">
					<Avatar className="h-8 w-8 hover:ring-2 hover:ring-accent transition-all">
						<AvatarImage src={comment.author.avatarUrl ?? undefined} />
						<AvatarFallback className="text-xs bg-bg-2 font-semibold">
							{authorName.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				</button>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className="font-semibold text-sm leading-tight">{authorName}</span>
						<span className="text-xs text-text-tertiary">
							{comment.createdAt
								? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: false })
								: ''}
						</span>
					</div>

					<CommentContent content={comment.content} />

					<div className="flex items-center gap-4 mt-2">
						<button
							onClick={() => onLike(comment.id)}
							className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
						>
							<Heart
								className={cn(
									'h-3.5 w-3.5',
									comment.userLiked && 'fill-red-500 text-red-500',
								)}
							/>
							{comment.likeCount > 0 && <span>{comment.likeCount}</span>}
						</button>

						<button
							onClick={() => onReply(comment.id, authorName)}
							className="text-xs text-text-tertiary hover:text-text-primary transition-colors font-medium"
						>
							Reply
						</button>

						{isOwnComment && (
							<button
								onClick={() => onDelete(comment.id)}
								className="text-xs text-text-tertiary hover:text-red-500 transition-colors"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</button>
						)}
					</div>

					{/* Replies toggle */}
					{comment.replyCount > 0 && (
						<button
							onClick={() => onToggleReplies(comment.id)}
							className="flex items-center gap-1 mt-2 text-xs text-accent font-medium hover:opacity-80 transition-opacity"
						>
							{isExpanded ? (
								<ChevronUp className="h-3.5 w-3.5" />
							) : (
								<ChevronDown className="h-3.5 w-3.5" />
							)}
							{comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
						</button>
					)}

					{/* Loading replies */}
					{loadingReplies && (
						<div className="mt-3 pl-2">
							<div className="h-4 w-4 border-2 border-text-tertiary/30 border-t-text-tertiary rounded-full animate-spin" />
						</div>
					)}

					{/* Expanded replies */}
					{isExpanded && replies && (
						<div className="mt-3 space-y-3 pl-2 border-l-2 border-border-primary">
							{replies.map((reply) => (
								<ReplyItem
									key={reply.id}
									comment={reply}
									currentUserId={currentUserId}
									onLike={onLikeReply}
									onReply={onReplyToReply}
									onDelete={onDeleteReply}
									onAvatarClick={onAvatarClick}
								/>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// ---- Reply Item ----

interface ReplyItemProps {
	comment: CommentData;
	currentUserId?: string;
	onLike: (commentId: string) => void;
	onReply: (commentId: string, authorName: string) => void;
	onDelete: (commentId: string) => void;
	onAvatarClick: (userId: string) => void;
}

function ReplyItem({ comment, currentUserId, onLike, onReply, onDelete, onAvatarClick }: ReplyItemProps) {
	const authorName = comment.author.displayName || comment.author.username || 'Anonymous';
	const isOwnComment = currentUserId === comment.author.id;

	return (
		<div className="flex gap-2.5 pl-3 items-start">
			<button onClick={() => onAvatarClick(comment.author.id)} className="flex-shrink-0 mt-0.5">
				<Avatar className="h-6 w-6 hover:ring-2 hover:ring-accent transition-all">
					<AvatarImage src={comment.author.avatarUrl ?? undefined} />
					<AvatarFallback className="text-[10px] bg-bg-2 font-semibold">
						{authorName.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
			</button>

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="font-semibold text-xs leading-tight">{authorName}</span>
					<span className="text-[11px] text-text-tertiary">
						{comment.createdAt
							? formatDistanceToNow(new Date(comment.createdAt), { addSuffix: false })
							: ''}
					</span>
				</div>

				<CommentContent content={comment.content} compact />

				<div className="flex items-center gap-3 mt-1.5">
					<button
						onClick={() => onLike(comment.id)}
						className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary transition-colors"
					>
						<Heart
							className={cn(
								'h-3 w-3',
								comment.userLiked && 'fill-red-500 text-red-500',
							)}
						/>
						{comment.likeCount > 0 && <span>{comment.likeCount}</span>}
					</button>

					<button
						onClick={() => onReply(comment.id, authorName)}
						className="text-[11px] text-text-tertiary hover:text-text-primary transition-colors font-medium"
					>
						Reply
					</button>

					{isOwnComment && (
						<button
							onClick={() => onDelete(comment.id)}
							className="text-[11px] text-text-tertiary hover:text-red-500 transition-colors"
						>
							<Trash2 className="h-3 w-3" />
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
