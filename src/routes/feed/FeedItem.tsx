import React from 'react';
import { Play, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { AppWithUserAndStats } from '@/api-types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useNavigate } from 'react-router';

// Game design resolution — iframe renders at this size, then scales to fit
const GAME_WIDTH = 720;
const GAME_HEIGHT = 1280;
const DEFAULT_APP_COVER_URL = '/game_cover.png';

export interface FeedItemHandle {
	play: () => void;
	replay: () => void;
	isPlaying: () => boolean;
}

interface FeedItemProps {
	app: AppWithUserAndStats;
	isActive?: boolean;
	onPlayStateChange?: (playing: boolean) => void;
	containMode?: boolean;
	preloadedPreviewUrl?: string | null;
	shouldWarmFrame?: boolean;
}

export const FeedItem = React.forwardRef<FeedItemHandle, FeedItemProps>(
	function FeedItem({
		app,
		isActive = true,
		onPlayStateChange,
		containMode = false,
		preloadedPreviewUrl = null,
		shouldWarmFrame = false,
	}, ref) {
		const [imgError, setImgError] = React.useState(false);
		const [playing, setPlaying] = React.useState(false);
		const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
		const [iframeKey, setIframeKey] = React.useState(0);
		const containerRef = React.useRef<HTMLDivElement>(null);
		const iframeRef = React.useRef<HTMLIFrameElement>(null);
		const [scale, setScale] = React.useState(1);
		const [offset, setOffset] = React.useState({ x: 0, y: 0 });
		const [iframeLoaded, setIframeLoaded] = React.useState(false);
		const [isFollowingAuthor, setIsFollowingAuthor] = React.useState(Boolean(app.userFollowingAuthor));
		const [followLoading, setFollowLoading] = React.useState(false);
		const navigate = useNavigate();
		const { user, requireAuth } = useAuthGuard();

		React.useEffect(() => {
			if (preloadedPreviewUrl) {
				setPreviewUrl(preloadedPreviewUrl);
			}
		}, [preloadedPreviewUrl]);

		React.useEffect(() => {
			setIsFollowingAuthor(Boolean(app.userFollowingAuthor));
		}, [app.id, app.userFollowingAuthor]);

		React.useEffect(() => {
			setIframeLoaded(false);
		}, [previewUrl]);

		React.useEffect(() => {
			if (!playing || !isActive) return;

			const focusPreview = () => {
				iframeRef.current?.focus({ preventScroll: true });
			};

			focusPreview();
			const focusTimer = window.setTimeout(focusPreview, 120);
			return () => window.clearTimeout(focusTimer);
		}, [playing, isActive, iframeKey, previewUrl, iframeLoaded]);

		// Stop audio when game becomes inactive — blank the iframe src before React unmounts it
		React.useEffect(() => {
			if (!isActive && playing) {
				if (iframeRef.current) {
					iframeRef.current.src = 'about:blank';
				}
				setPlaying(false);
				setIframeLoaded(false);
				onPlayStateChange?.(false);
			}
		}, [isActive, onPlayStateChange, playing]);

		// Calculate scale to fit game resolution into container
		React.useEffect(() => {
			const container = containerRef.current;
			if (!container) return;

			const updateScale = () => {
				const { clientWidth, clientHeight } = container;
				const scaleX = clientWidth / GAME_WIDTH;
				const scaleY = clientHeight / GAME_HEIGHT;
				const shouldContainPreview = containMode && (playing || shouldWarmFrame);
				if (shouldContainPreview) {
					const s = Math.min(scaleX, scaleY);
					setScale(s);
					setOffset({
						x: (clientWidth - GAME_WIDTH * s) / 2,
						y: (clientHeight - GAME_HEIGHT * s) / 2,
					});
				} else {
					setScale(Math.max(scaleX, scaleY));
					setOffset({ x: 0, y: 0 });
				}
			};

			updateScale();
			const observer = new ResizeObserver(updateScale);
			observer.observe(container);
			return () => observer.disconnect();
		}, [containMode, playing, shouldWarmFrame]);

		const startPlay = async () => {
			const readyPreviewUrl = previewUrl || preloadedPreviewUrl;

			if (playing && readyPreviewUrl) {
				setIframeKey((k) => k + 1);
				return;
			}

			if (readyPreviewUrl) {
				setPreviewUrl(readyPreviewUrl);
				setPlaying(true);
				onPlayStateChange?.(true);
				return;
			}

			toast.info('This playable is still getting ready');
		};

		const openCreatorProfile = (event: React.MouseEvent) => {
			event.stopPropagation();
			if (app.userId) {
				navigate(`/profile/${app.userId}`);
			}
		};

		const handleFollowClick = async (event: React.MouseEvent) => {
			event.stopPropagation();
			if (!app.userId || followLoading) return;

			if (app.userId === user?.id) {
				navigate(`/profile/${app.userId}`);
				return;
			}

			if (!requireAuth({ actionContext: 'to follow creators', intendedUrl: `/feed/${app.id}` })) {
				return;
			}

			setFollowLoading(true);
			try {
				const res = isFollowingAuthor
					? await apiClient.unfollowUser(app.userId)
					: await apiClient.followUser(app.userId);
				if (res.success && res.data) {
					setIsFollowingAuthor(res.data.isFollowing);
				}
			} catch {
				toast.error(isFollowingAuthor ? 'Failed to unfollow creator' : 'Failed to follow creator');
			} finally {
				setFollowLoading(false);
			}
		};

		React.useImperativeHandle(ref, () => ({
			play: startPlay,
			replay: () => {
				if (playing && previewUrl) {
					setIframeKey((k) => k + 1);
				} else {
					startPlay();
				}
			},
			isPlaying: () => playing,
		}));

		const coverUrl = !imgError && app.screenshotUrl ? app.screenshotUrl : DEFAULT_APP_COVER_URL;
		const warmFrameActive = Boolean(previewUrl && isActive && shouldWarmFrame && !playing);
		const shouldRenderPreviewFrame = Boolean(previewUrl && isActive && (playing || shouldWarmFrame));
		const creatorName = app.userName || 'Creator';
		const isOwnAuthor = Boolean(app.userId && app.userId === user?.id);
		const showCreatorCta = Boolean(!playing && app.userId && !isOwnAuthor && !isFollowingAuthor);
		const posterClassName = warmFrameActive
			? 'absolute left-1/2 top-1/2 z-10 aspect-[9/16] w-[44%] max-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/25 object-cover shadow-[0_20px_70px_rgba(0,0,0,0.55)]'
			: 'absolute inset-0 h-full w-full object-cover';

		return (
			<div className="h-full w-full snap-start snap-always relative flex-shrink-0 bg-black">
				<div
					ref={containerRef}
					className="absolute inset-0 cursor-pointer group overflow-hidden"
					onClick={!playing ? startPlay : undefined}
				>
					{shouldRenderPreviewFrame && (
						<iframe
							ref={iframeRef}
							key={iframeKey}
							src={previewUrl!}
							title={`Play ${app.title}`}
							tabIndex={0}
							onLoad={() => setIframeLoaded(true)}
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
							style={{
								position: 'absolute',
								top: offset.y,
								left: offset.x,
								border: 'none',
								width: GAME_WIDTH,
								height: GAME_HEIGHT,
								transform: `scale(${scale})`,
								transformOrigin: 'top left',
								opacity: playing || iframeLoaded ? 1 : 0,
								pointerEvents: playing ? 'auto' : 'none',
								transition: 'opacity 420ms ease',
							}}
						/>
					)}

					{!playing && (
						<>
							{warmFrameActive && iframeLoaded && (
								<div className="absolute inset-0 z-[5] bg-black/25 transition-opacity duration-500" />
							)}

							<img
								src={coverUrl}
								alt={app.title}
								className={posterClassName}
								onError={() => setImgError(true)}
								loading="lazy"
							/>

							{/* Play button overlay */}
							<div className="absolute inset-0 z-20 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
								<div className="bg-black/40 backdrop-blur-sm rounded-full p-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
									<Play className="h-10 w-10 text-white fill-white" />
								</div>
							</div>

							{/* View count badge */}
							{app.viewCount != null && app.viewCount > 0 && (
								<div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-sm">
									<Play className="h-3.5 w-3.5 fill-white" />
									<span>{app.viewCount.toLocaleString()}</span>
								</div>
							)}

							{showCreatorCta && (
								<div
									className="absolute left-3 right-3 top-4 z-30 flex items-center gap-2.5 rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-white shadow-[0_12px_40px_rgba(0,0,0,0.38)] backdrop-blur-xl"
									onClick={(event) => event.stopPropagation()}
								>
									<button
										type="button"
										onClick={openCreatorProfile}
										className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
									>
										<Avatar className="h-9 w-9 flex-shrink-0 ring-2 ring-white/15">
											<AvatarImage src={app.userAvatar ?? undefined} />
											<AvatarFallback className="bg-white/10 text-xs font-bold text-white">
												{creatorName.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
										<div className="min-w-0">
											<div className="truncate text-base font-black leading-tight">{creatorName}</div>
											<div className="truncate text-xs font-semibold text-white/75">Browse their games</div>
										</div>
									</button>
									<button
										type="button"
										onClick={handleFollowClick}
										disabled={followLoading}
										className="flex h-9 min-w-[84px] items-center justify-center rounded-full bg-white px-4 text-sm font-black text-black transition-colors hover:bg-white/90 disabled:opacity-70"
									>
										{followLoading ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											'Follow'
										)}
									</button>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		);
	},
);
