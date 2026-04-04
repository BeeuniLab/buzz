import React from 'react';
import { ChevronUp, ChevronDown, Loader2, Heart, Bookmark, Send, RotateCcw, MessageCircle, Compass, SkipBack, SkipForward, Link2, Check } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiClient } from '@/lib/api-client';
import { FeedItem } from './FeedItem';
import type { FeedItemHandle } from './FeedItem';
import { cn } from '@/lib/utils';
import { useNavigate, useParams } from 'react-router';
import type { AppWithUserAndStats } from '@/api-types';
import { CommentsDrawer } from '@/components/comments/CommentsDrawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function FeedPage() {
	const { appId } = useParams<{ appId?: string }>();
	const isMobile = useIsMobile();
	const { requireAuth } = useAuthGuard();
	const [apps, setApps] = React.useState<AppWithUserAndStats[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [loadingMore, setLoadingMore] = React.useState(false);
	const [page, setPage] = React.useState(1);
	const [hasMore, setHasMore] = React.useState(true);
	const [currentIndex, setCurrentIndex] = React.useState(0);
	const [initialAppLoaded, setInitialAppLoaded] = React.useState(!appId);
	const [commentsOpen, setCommentsOpen] = React.useState(false);
	const [commentCount, setCommentCount] = React.useState(0);
	const [isPlaying, setIsPlaying] = React.useState(false);
	const [actionsExpanded, setActionsExpanded] = React.useState(false);
	const [shareDialogOpen, setShareDialogOpen] = React.useState(false);
	const [linkCopied, setLinkCopied] = React.useState(false);

	// Stable seed per session — regenerated when user navigates to feed root
	const feedSeedRef = React.useRef(Math.floor(Math.random() * 1000000));
	const prevAppIdRef = React.useRef(appId);
	const [refreshKey, setRefreshKey] = React.useState(0);

	// Reset feed when navigating to root (no appId) from a specific app
	React.useEffect(() => {
		const prevAppId = prevAppIdRef.current;
		prevAppIdRef.current = appId;

		if (prevAppId && !appId) {
			// User navigated to "/" or "/feed" — refresh the feed
			feedSeedRef.current = Math.floor(Math.random() * 1000000);
			setApps([]);
			appsRef.current = [];
			setPage(1);
			setCurrentIndex(0);
			setHasMore(true);
			setLoading(true);
			setInitialAppLoaded(true);
			setRefreshKey((k) => k + 1);
		}
	}, [appId]);

	const containerRef = React.useRef<HTMLDivElement>(null);
	const observerRef = React.useRef<IntersectionObserver | null>(null);
	const lastItemRef = React.useRef<HTMLDivElement | null>(null);
	const feedItemRefs = React.useRef<Map<number, FeedItemHandle>>(new Map());
	const appsRef = React.useRef<AppWithUserAndStats[]>([]);
	const navigate = useNavigate();

	// Keep ref in sync with state for use in memoized callbacks
	React.useEffect(() => { appsRef.current = apps; }, [apps]);

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
			// On subsequent pages, exclude already-loaded app IDs so we get fresh content
			const currentApps = pageNum === 1 && !appId ? [] : appsRef.current;
			const excludeIds = currentApps.length > 0 ? currentApps.map((a) => a.id) : undefined;

			const res = await apiClient.getPublicApps({
				sort: 'feed',
				limit: 10,
				page: 1, // Always page 1 — excludeIds handles continuation
				seed: feedSeedRef.current,
				excludeIds,
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
	}, [fetchApps, initialAppLoaded, refreshKey]);

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
	}, [loading]);

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

	// Update URL, record view, and fetch comment count when current app changes
	React.useEffect(() => {
		if (currentApp) {
			window.history.replaceState(null, '', `/feed/${currentApp.id}`);
			apiClient.recordAppView(currentApp.id);
			apiClient.getComments(currentApp.id, { limit: 50 }).then((res) => {
				if (res.success && res.data) {
					const replyTotal = res.data.comments.reduce((sum, c) => sum + (c.replyCount || 0), 0);
					setCommentCount(res.data.totalCount + replyTotal);
				}
			}).catch(() => {});
		}
		setCommentsOpen(false);
	}, [currentApp?.id]);

	const handleReplay = () => {
		const handle = feedItemRefs.current.get(currentIndex);
		if (handle) handle.replay();
	};

	const handleShare = () => {
		if (!currentApp) return;
		setLinkCopied(false);
		setShareDialogOpen(true);
	};

	const handleCopyLink = () => {
		if (!currentApp) return;
		const url = `${window.location.origin}/feed/${currentApp.id}`;
		navigator.clipboard.writeText(url).then(() => {
			setLinkCopied(true);
			setTimeout(() => setLinkCopied(false), 2000);
		});
	};

	const shareDialog = (
		<Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen} modal={false}>
			<DialogContent className="sm:max-w-xs max-w-[calc(100%-2rem)]" showCloseButton={false} aria-describedby={undefined}>
				<DialogTitle className="sr-only">Share</DialogTitle>
				<div className="flex flex-col items-center gap-3">
					{currentApp?.screenshotUrl && (
						<div className="w-full aspect-video rounded-lg overflow-hidden border-2 border-[var(--neo-border-color)]">
							<img
								src={currentApp.screenshotUrl}
								alt={currentApp.title || 'App preview'}
								className="w-full h-full object-cover"
							/>
						</div>
					)}
					{currentApp?.title && (
						<p className="text-sm font-bold text-text-primary text-center truncate w-full">{currentApp.title}</p>
					)}
					<button
						onClick={handleCopyLink}
						className={cn(
							'w-full flex items-center justify-center gap-2 rounded-lg border-2 border-[var(--neo-border-color)] px-4 py-3 font-bold text-sm transition-all shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] hover:shadow-[4px_4px_0px_0px_var(--neo-border-color)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[0px_0px_0px_0px_var(--neo-border-color)]',
							linkCopied ? 'bg-green-500 text-white' : 'bg-bg-4 text-text-primary'
						)}
					>
						{linkCopied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
						{linkCopied ? 'Copied' : 'Copy Link'}
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);

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

	// Shared action buttons JSX
	const actionButtons = (
		<>
			<button onClick={handleReplay} className="flex flex-col items-center gap-1 group">
				<div className={cn('rounded-full p-3 transition-colors', isMobile ? 'bg-black/40 backdrop-blur-sm text-white' : 'bg-bg-3 text-text-primary group-hover:bg-bg-3/80')}>
					<RotateCcw className={cn(isMobile ? 'h-5 w-5' : 'h-6 w-6')} />
				</div>
				<span className={cn('text-xs', isMobile ? 'text-white/80' : 'text-text-tertiary')}>Replay</span>
			</button>
			<button onClick={handleShare} className="flex flex-col items-center gap-1 group">
				<div className={cn('rounded-full p-3 transition-colors', isMobile ? 'bg-black/40 backdrop-blur-sm text-white' : 'bg-bg-3 text-text-primary group-hover:bg-bg-3/80')}>
					<Send className={cn(isMobile ? 'h-5 w-5' : 'h-6 w-6')} />
				</div>
				<span className={cn('text-xs', isMobile ? 'text-white/80' : 'text-text-tertiary')}>Share</span>
			</button>
			<button onClick={() => { if (requireAuth({ actionContext: 'to comment' })) setCommentsOpen(true); }} className="flex flex-col items-center gap-1 group">
				<div className={cn('rounded-full p-3 transition-colors', isMobile ? 'bg-black/40 backdrop-blur-sm text-white' : 'bg-bg-3 text-text-primary group-hover:bg-bg-3/80')}>
					<MessageCircle className={cn(isMobile ? 'h-5 w-5' : 'h-6 w-6')} />
				</div>
				<span className={cn('text-xs', isMobile ? 'text-white/80' : 'text-text-tertiary')}>{commentCount}</span>
			</button>
			<button onClick={handleStar} className="flex flex-col items-center gap-1 group">
				<div className={cn(
					'rounded-full p-3 transition-colors',
					currentApp?.userStarred
						? 'bg-red-500/20 text-red-500'
						: isMobile ? 'bg-black/40 backdrop-blur-sm text-white' : 'bg-bg-3 text-text-primary group-hover:bg-bg-3/80'
				)}>
					<Heart className={cn(isMobile ? 'h-5 w-5' : 'h-6 w-6', currentApp?.userStarred && 'fill-current')} />
				</div>
				<span className={cn('text-xs', isMobile ? 'text-white/80' : 'text-text-tertiary')}>{currentApp?.starCount || 0}</span>
			</button>
			<button onClick={handleFavorite} className="flex flex-col items-center gap-1 group">
				<div className={cn(
					'rounded-full p-3 transition-colors',
					currentApp?.userFavorited
						? 'bg-accent/20 text-accent'
						: isMobile ? 'bg-black/40 backdrop-blur-sm text-white' : 'bg-bg-3 text-text-primary group-hover:bg-bg-3/80'
				)}>
					<Bookmark className={cn(isMobile ? 'h-5 w-5' : 'h-6 w-6', currentApp?.userFavorited && 'fill-current')} />
				</div>
				<span className={cn('text-xs', isMobile ? 'text-white/80' : 'text-text-tertiary')}>Favorite</span>
			</button>
			{currentApp && (
				<button
					onClick={() => navigate(currentApp.userId ? `/profile/${currentApp.userId}` : '/profile')}
					className="group"
					title={currentApp.userName || 'Anonymous'}
				>
					<Avatar className={cn('ring-2 group-hover:ring-accent transition-colors', isMobile ? 'h-8 w-8 ring-white/30' : 'h-10 w-10 ring-bg-3')}>
						<AvatarImage src={currentApp.userAvatar ?? undefined} />
						<AvatarFallback className={cn('text-xs font-semibold', isMobile ? 'bg-black/40 text-white' : 'bg-bg-3 text-text-primary')}>
							{currentApp.userName?.charAt(0).toUpperCase() || '?'}
						</AvatarFallback>
					</Avatar>
				</button>
			)}
		</>
	);

	// Scroll container content
	const scrollContent = (
		<div
			ref={containerRef}
			className={cn(
				'h-full overflow-y-auto',
				isMobile && isPlaying ? 'overflow-hidden' : 'snap-y snap-mandatory',
			)}
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
						isActive={i === currentIndex}
						onPlayStateChange={isMobile ? (playing) => setIsPlaying(playing) : undefined}
						containMode={isMobile && isPlaying}
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
	);

	if (isMobile) {
		const commentsDrawer = currentApp && (
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
		);

		// Always render scrollContent; when playing, wrap in fixed fullscreen + control bar
		return (
			<>
				<div className="fixed inset-0 z-[60] bg-black flex flex-col">
					{/* Game area */}
					<div className="flex-1 min-h-0 relative overflow-hidden">
						{scrollContent}
					</div>

					{/* Expandable action panel — floats above control bar */}
					{actionsExpanded && (
						<div className="absolute bottom-12 right-2 z-10 flex flex-col items-center gap-3 pb-3 animate-in slide-in-from-bottom-2 fade-in duration-200">
							<button onClick={handleReplay} className="flex flex-col items-center gap-1">
								<div className="rounded-full p-3 bg-black/60 backdrop-blur-sm text-white">
									<RotateCcw className="h-5 w-5" />
								</div>
								<span className="text-[10px] text-white/70">Replay</span>
							</button>
							<button onClick={handleShare} className="flex flex-col items-center gap-1">
								<div className="rounded-full p-3 bg-black/60 backdrop-blur-sm text-white">
									<Send className="h-5 w-5" />
								</div>
								<span className="text-[10px] text-white/70">Share</span>
							</button>
							<button onClick={() => { if (requireAuth({ actionContext: 'to comment' })) setCommentsOpen(true); }} className="flex flex-col items-center gap-1">
								<div className="rounded-full p-3 bg-black/60 backdrop-blur-sm text-white">
									<MessageCircle className="h-5 w-5" />
								</div>
								<span className="text-[10px] text-white/70">{commentCount || ''}</span>
							</button>
							<button onClick={handleStar} className="flex flex-col items-center gap-1">
								<div className={cn('rounded-full p-3', currentApp?.userStarred ? 'bg-red-500/20 text-red-500' : 'bg-black/60 backdrop-blur-sm text-white')}>
									<Heart className={cn('h-5 w-5', currentApp?.userStarred && 'fill-current')} />
								</div>
								<span className="text-[10px] text-white/70">{currentApp?.starCount || ''}</span>
							</button>
							<button onClick={handleFavorite} className="flex flex-col items-center gap-1">
								<div className={cn('rounded-full p-3', currentApp?.userFavorited ? 'bg-accent/20 text-accent' : 'bg-black/60 backdrop-blur-sm text-white')}>
									<Bookmark className={cn('h-5 w-5', currentApp?.userFavorited && 'fill-current')} />
								</div>
								<span className="text-[10px] text-white/70">Favorite</span>
							</button>
							{currentApp && (
								<button
									onClick={() => navigate(currentApp.userId ? `/profile/${currentApp.userId}` : '/profile')}
									title={currentApp.userName || 'Anonymous'}
								>
									<Avatar className="h-8 w-8 ring-2 ring-white/30">
										<AvatarImage src={currentApp.userAvatar ?? undefined} />
										<AvatarFallback className="text-xs font-semibold bg-black/60 text-white">
											{currentApp.userName?.charAt(0).toUpperCase() || '?'}
										</AvatarFallback>
									</Avatar>
								</button>
							)}
						</div>
					)}

					{/* Control bar */}
					<div className="shrink-0 h-12 bg-black/90 border-t border-white/10 flex items-center justify-between px-3">
						{/* Left: Discover */}
						<button
							onClick={() => navigate('/discover')}
							className="p-2 text-white/70 active:text-white"
						>
							<Compass className="h-5 w-5" />
						</button>

						{/* Center: prev / replay / next */}
						<div className="flex items-center gap-6">
							<button
								onClick={() => scrollTo('up')}
								disabled={currentIndex === 0}
								className="p-2 text-white/70 active:text-white disabled:text-white/20"
							>
								<SkipBack className="h-5 w-5" />
							</button>
							<button
								onClick={handleReplay}
								className="p-2 text-white/70 active:text-white"
							>
								<RotateCcw className="h-5 w-5" />
							</button>
							<button
								onClick={() => scrollTo('down')}
								disabled={currentIndex === apps.length - 1}
								className="p-2 text-white/70 active:text-white disabled:text-white/20"
							>
								<SkipForward className="h-5 w-5" />
							</button>
						</div>

						{/* Right: compact icons + expand toggle */}
						<div className="flex items-center gap-2">
							{!actionsExpanded && (
								<>
									<button onClick={handleStar} className="p-1">
										<Heart className={cn('h-4 w-4', currentApp?.userStarred ? 'text-red-500 fill-current' : 'text-white/70')} />
									</button>
									<button onClick={() => { if (requireAuth({ actionContext: 'to comment' })) setCommentsOpen(true); }} className="p-1">
										<MessageCircle className="h-4 w-4 text-white/70" />
									</button>
								</>
							)}
							<button
								onClick={() => setActionsExpanded((v) => !v)}
								className="p-1 text-white/70 active:text-white"
							>
								<ChevronUp className={cn('h-4 w-4 transition-transform duration-200', actionsExpanded && 'rotate-180')} />
							</button>
						</div>
					</div>
				</div>

				{commentsDrawer}
				{shareDialog}
			</>
		);
	}

	// Desktop: phone frame with side action buttons
	return (
		<div className="h-full flex items-center justify-center bg-bg-1 overflow-hidden">
			<div className="relative flex items-end gap-4">
				<div className="relative h-[calc(100vh-64px)] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl border border-border-primary bg-black">
					{scrollContent}
				</div>

				{/* Right side: action buttons + avatar */}
				<div className="flex flex-col items-center gap-5 pb-4">
					{actionButtons}
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
			{shareDialog}
		</div>
	);
}
