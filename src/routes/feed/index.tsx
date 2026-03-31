import React from 'react';
import { ChevronUp, ChevronDown, Loader2, Heart, Bookmark, Send, RotateCcw, MessageCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiClient } from '@/lib/api-client';
import { FeedItem } from './FeedItem';
import type { FeedItemHandle } from './FeedItem';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate, useParams } from 'react-router';
import type { AppWithUserAndStats } from '@/api-types';
import { CommentsDrawer } from '@/components/comments/CommentsDrawer';

export default function FeedPage() {
	const { appId } = useParams<{ appId?: string }>();
	const [apps, setApps] = React.useState<AppWithUserAndStats[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [page, setPage] = React.useState(1);
	const [hasMore, setHasMore] = React.useState(true);
	const [currentIndex, setCurrentIndex] = React.useState(0);
	const [initialAppLoaded, setInitialAppLoaded] = React.useState(!appId);
	const [commentsOpen, setCommentsOpen] = React.useState(false);
	const [commentCount, setCommentCount] = React.useState(0);

	const containerRef = React.useRef<HTMLDivElement>(null);
	const observerRef = React.useRef<IntersectionObserver | null>(null);
	const lastItemRef = React.useRef<HTMLDivElement | null>(null);
	const feedItemRefs = React.useRef<Map<number, FeedItemHandle>>(new Map());
	const navigate = useNavigate();

	// Load the specific app first if appId is provided
	React.useEffect(() => {
		if (!appId) return;

		(async () => {
			try {
				const res = await apiClient.getAppDetails(appId);
				if (res.success && res.data) {
					const detail = res.data;
					const initialApp: AppWithUserAndStats = {
						id: detail.id,
						title: detail.title ?? '',
						description: detail.description ?? null,
						screenshotUrl: detail.screenshotUrl ?? null,
						userId: detail.userId ?? null,
						userName: detail.userName ?? null,
						userAvatar: detail.userAvatar ?? null,
						starCount: detail.starCount ?? 0,
						userStarred: detail.userStarred ?? false,
						userFavorited: detail.userFavorited ?? false,
						viewCount: detail.viewCount ?? 0,
						updatedAtFormatted: '',
						createdAt: detail.createdAt ?? '',
						updatedAt: detail.updatedAt ?? '',
						isPublic: true,
						cloudflareUrl: detail.cloudflareUrl ?? null,
						previewUrl: detail.previewUrl ?? null,
					} as unknown as AppWithUserAndStats;
					setApps([initialApp]);
				}
			} catch {
				// fall through to normal load
			} finally {
				setInitialAppLoaded(true);
			}
		})();
	}, [appId]);

	const fetchApps = React.useCallback(async (pageNum: number) => {
		if (pageNum === 1 && !appId) setLoading(true);
		else setLoadingMore(true);

		try {
			const res = await apiClient.getPublicApps({
				sort: 'popular',
				limit: 10,
				page: pageNum,
				period: 'all',
			});
			if (res.success && res.data) {
				const newApps = res.data.apps;
				setApps((prev) => {
					if (pageNum === 1 && !appId) return newApps;
					const existingIds = new Set(prev.map((a) => a.id));
					const deduped = newApps.filter((a) => !existingIds.has(a.id));
					return [...prev, ...deduped];
				});
				setHasMore(newApps.length === 10);
			}
		} catch {
			// silently handle
		} finally {
			setLoading(false);
			setLoadingMore(false);
		}
	}, [appId]);

	React.useEffect(() => {
		if (!initialAppLoaded) return;
		fetchApps(1);
	}, [fetchApps, initialAppLoaded]);

	// Infinite scroll observer
	React.useEffect(() => {
		if (observerRef.current) observerRef.current.disconnect();

		observerRef.current = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting && hasMore && !loadingMore) {
					const nextPage = page + 1;
					setPage(nextPage);
					fetchApps(nextPage);
				}
			},
			{ threshold: 0.5 },
		);

		if (lastItemRef.current) {
			observerRef.current.observe(lastItemRef.current);
		}

		return () => observerRef.current?.disconnect();
	}, [apps.length, hasMore, loadingMore, page, fetchApps]);

	// Track current index from scroll position
	React.useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleScroll = () => {
			const scrollTop = container.scrollTop;
			const itemHeight = container.clientHeight;
			if (itemHeight > 0) {
				setCurrentIndex(Math.round(scrollTop / itemHeight));
			}
		};

		container.addEventListener('scroll', handleScroll, { passive: true });
		return () => container.removeEventListener('scroll', handleScroll);
	}, []);

	// Keyboard navigation
	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const container = containerRef.current;
			if (!container) return;

			if (e.key === 'ArrowDown' || e.key === 'j') {
				e.preventDefault();
				const next = Math.min(currentIndex + 1, apps.length - 1);
				const items = container.children;
				if (items[next]) {
					(items[next] as HTMLElement).scrollIntoView({ behavior: 'smooth' });
				}
			} else if (e.key === 'ArrowUp' || e.key === 'k') {
				e.preventDefault();
				const prev = Math.max(currentIndex - 1, 0);
				const items = container.children;
				if (items[prev]) {
					(items[prev] as HTMLElement).scrollIntoView({ behavior: 'smooth' });
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [currentIndex, apps.length]);

	const handleStarUpdate = (appId: string, starred: boolean, newCount: number) => {
		setApps((prev) =>
			prev.map((a) =>
				a.id === appId ? { ...a, userStarred: starred, starCount: newCount } : a,
			),
		);
	};

	const handleFavoriteUpdate = (appId: string, favorited: boolean) => {
		setApps((prev) =>
			prev.map((a) =>
				a.id === appId ? { ...a, userFavorited: favorited } : a,
			),
		);
	};

	const scrollTo = (direction: 'up' | 'down') => {
		const container = containerRef.current;
		if (!container) return;
		const target = direction === 'up'
			? Math.max(currentIndex - 1, 0)
			: Math.min(currentIndex + 1, apps.length - 1);
		const items = container.children;
		if (items[target]) {
			(items[target] as HTMLElement).scrollIntoView({ behavior: 'smooth' });
		}
	};

	const currentApp = apps[currentIndex];

	// Update URL and fetch comment count when current app changes
	React.useEffect(() => {
		if (currentApp) {
			window.history.replaceState(null, '', `/feed/${currentApp.id}`);
			apiClient.getComments(currentApp.id, { limit: 50 }).then((res) => {
				if (res.success && res.data) {
					const replyTotal = res.data.comments.reduce((sum, c) => sum + (c.replyCount || 0), 0);
					setCommentCount(res.data.totalCount + replyTotal);
				}
			}).catch(() => {});
		}
		setCommentsOpen(false);
	}, [currentApp]);

	const handleReplay = () => {
		const handle = feedItemRefs.current.get(currentIndex);
		if (handle) handle.replay();
	};

	const handleShare = () => {
		if (!currentApp) return;
		const url = `${window.location.origin}/feed/${currentApp.id}`;
		navigator.clipboard.writeText(url).then(() => {
			toast.success('Link copied to clipboard');
		});
	};

	const handleStar = async () => {
		if (!currentApp) return;
		const wasStarred = currentApp.userStarred;
		handleStarUpdate(currentApp.id, !wasStarred, currentApp.starCount + (wasStarred ? -1 : 1));
		try {
			await apiClient.toggleAppStar(currentApp.id);
		} catch {
			handleStarUpdate(currentApp.id, wasStarred, currentApp.starCount);
		}
	};

	const handleFavorite = async () => {
		if (!currentApp) return;
		const wasFavorited = currentApp.userFavorited;
		handleFavoriteUpdate(currentApp.id, !wasFavorited);
		try {
			await apiClient.toggleFavorite(currentApp.id);
		} catch {
			handleFavoriteUpdate(currentApp.id, wasFavorited);
		}
	};

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center bg-bg-1">
				<Loader2 className="h-8 w-8 text-text-tertiary animate-spin" />
			</div>
		);
	}

	if (apps.length === 0) {
		return (
			<div className="h-full flex items-center justify-center bg-bg-1">
				<p className="text-text-tertiary">No apps to show</p>
			</div>
		);
	}

	return (
		<div className="h-full flex items-center justify-center bg-bg-1 overflow-hidden">
			<div className="relative flex items-end gap-4">
				{/* Phone frame — 9:16 aspect ratio */}
				<div className="relative h-[calc(100vh-64px)] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl border border-border-primary bg-black">
					<div
						ref={containerRef}
						className="h-full overflow-y-auto snap-y snap-mandatory"
						style={{ scrollbarWidth: 'none' }}
					>
						{apps.map((app, i) => (
							<div
								key={app.id}
								ref={i === apps.length - 2 ? lastItemRef : undefined}
								className="h-full"
							>
								<FeedItem
									app={app}
									ref={(handle) => {
										if (handle) feedItemRefs.current.set(i, handle);
										else feedItemRefs.current.delete(i);
									}}
								/>
							</div>
						))}
						{loadingMore && (
							<div className="h-16 flex items-center justify-center">
								<Loader2 className="h-5 w-5 text-white/60 animate-spin" />
							</div>
						)}
					</div>
				</div>

				{/* Right side: action buttons + avatar */}
				<div className="flex flex-col items-center gap-5 pb-4">
					{/* Replay */}
					<button onClick={handleReplay} className="flex flex-col items-center gap-1 group">
						<div className="bg-bg-3 rounded-full p-3 text-text-primary group-hover:bg-bg-3/80 transition-colors">
							<RotateCcw className="h-6 w-6" />
						</div>
						<span className="text-text-tertiary text-xs">Replay</span>
					</button>

					{/* Share */}
					<button onClick={handleShare} className="flex flex-col items-center gap-1 group">
						<div className="bg-bg-3 rounded-full p-3 text-text-primary group-hover:bg-bg-3/80 transition-colors">
							<Send className="h-6 w-6" />
						</div>
						<span className="text-text-tertiary text-xs">Share</span>
					</button>

					{/* Comments */}
					<button onClick={() => setCommentsOpen(true)} className="flex flex-col items-center gap-1 group">
						<div className="bg-bg-3 rounded-full p-3 text-text-primary group-hover:bg-bg-3/80 transition-colors">
							<MessageCircle className="h-6 w-6" />
						</div>
						<span className="text-text-tertiary text-xs">{commentCount > 0 ? commentCount : 'Comments'}</span>
					</button>

					{/* Star (Heart) */}
					<button onClick={handleStar} className="flex flex-col items-center gap-1 group">
						<div className={cn(
							'rounded-full p-3 transition-colors',
							currentApp?.userStarred
								? 'bg-red-500/20 text-red-500'
								: 'bg-bg-3 text-text-primary group-hover:bg-bg-3/80'
						)}>
							<Heart className={cn('h-6 w-6', currentApp?.userStarred && 'fill-current')} />
						</div>
						<span className="text-text-tertiary text-xs">{currentApp?.starCount || 0}</span>
					</button>

					{/* Favorite */}
					<button onClick={handleFavorite} className="flex flex-col items-center gap-1 group">
						<div className={cn(
							'rounded-full p-3 transition-colors',
							currentApp?.userFavorited
								? 'bg-accent/20 text-accent'
								: 'bg-bg-3 text-text-primary group-hover:bg-bg-3/80'
						)}>
							<Bookmark className={cn('h-6 w-6', currentApp?.userFavorited && 'fill-current')} />
						</div>
						<span className="text-text-tertiary text-xs">Favorite</span>
					</button>

					{/* Author avatar */}
					{currentApp && (
						<button
							onClick={() => navigate(currentApp.userId ? `/profile/${currentApp.userId}` : '/profile')}
							className="group"
							title={currentApp.userName || 'Anonymous'}
						>
							<Avatar className="h-10 w-10 ring-2 ring-bg-3 group-hover:ring-accent transition-colors">
								<AvatarImage src={currentApp.userAvatar ?? undefined} />
								<AvatarFallback className="text-xs bg-bg-3 text-text-primary font-semibold">
									{currentApp.userName?.charAt(0).toUpperCase() || '?'}
								</AvatarFallback>
							</Avatar>
						</button>
					)}
				</div>
			</div>

			{/* Navigation arrows — fixed far right, vertically centered */}
			<div className="fixed right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2">
				<button
					onClick={() => scrollTo('up')}
					disabled={currentIndex === 0}
					className="bg-bg-3 rounded-full p-2.5 text-text-primary hover:bg-bg-3/80 transition-colors disabled:opacity-30"
				>
					<ChevronUp className="h-5 w-5" />
				</button>
				<button
					onClick={() => scrollTo('down')}
					disabled={currentIndex === apps.length - 1}
					className="bg-bg-3 rounded-full p-2.5 text-text-primary hover:bg-bg-3/80 transition-colors disabled:opacity-30"
				>
					<ChevronDown className="h-5 w-5" />
				</button>
			</div>

			{/* Comments Drawer */}
			{currentApp && (
				<CommentsDrawer
					appId={currentApp.id}
					open={commentsOpen}
					onOpenChange={(open) => {
						setCommentsOpen(open);
						if (!open) {
							apiClient.getComments(currentApp.id, { limit: 50 }).then((res) => {
								if (res.success && res.data) {
									const replyTotal = res.data.comments.reduce((sum, c) => sum + (c.replyCount || 0), 0);
									setCommentCount(res.data.totalCount + replyTotal);
								}
							}).catch(() => {});
						}
					}}
				/>
			)}
		</div>
	);
}
