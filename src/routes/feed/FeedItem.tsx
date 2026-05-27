import React from 'react';
import { Play, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { AppWithUserAndStats, PlayableAspectRatio } from '@/api-types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { useNavigate } from 'react-router';
import { useAppI18n } from '@/i18n';
import { useIsMobile } from '@/hooks/use-mobile';
import {
	getPlayableAspectRatio,
	getPlayableFrameTransform,
	PLAYABLE_DIMENSIONS,
	PORTRAIT_PLAYABLE_DIMENSIONS,
} from '@/components/playable-frame';
const DEFAULT_APP_COVER_URL = '/game_cover.png';
let feedPlayAuthPromptedThisPage = false;

export interface FeedItemHandle {
	play: () => void;
	replay: () => void;
	stop: () => void;
	isPlaying: () => boolean;
}

interface FeedItemProps {
	app: AppWithUserAndStats;
	isActive?: boolean;
	shouldWarmFrame?: boolean;
	onPlayStateChange?: (playing: boolean) => void;
	containMode?: boolean;
	preloadedPreviewUrl?: string | null;
}

export const FeedItem = React.forwardRef<FeedItemHandle, FeedItemProps>(
	function FeedItem({
		app,
		isActive = true,
		shouldWarmFrame = false,
		onPlayStateChange,
		containMode = false,
		preloadedPreviewUrl = null,
	}, ref) {
		const [imgError, setImgError] = React.useState(false);
		const [playing, setPlaying] = React.useState(false);
		const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
		const [iframeKey, setIframeKey] = React.useState(0);
		const containerRef = React.useRef<HTMLDivElement>(null);
		const iframeRef = React.useRef<HTMLIFrameElement>(null);
		const [scale, setScale] = React.useState(1);
		const [offset, setOffset] = React.useState({ x: 0, y: 0 });
		const [rotateLandscape, setRotateLandscape] = React.useState(false);
		const [iframeLoaded, setIframeLoaded] = React.useState(false);
		const [isFollowingAuthor, setIsFollowingAuthor] = React.useState(Boolean(app.userFollowingAuthor));
		const [followLoading, setFollowLoading] = React.useState(false);
		const navigate = useNavigate();
		const { user, requireAuth, isAuthenticated, isLoading: isAuthLoading } = useAuthGuard();
		const { t } = useAppI18n();
		const isMobile = useIsMobile();
		const playableAspectRatio: PlayableAspectRatio = getPlayableAspectRatio(app.playableAspectRatio);
		const dimensions = PLAYABLE_DIMENSIONS[playableAspectRatio];

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

		const stopPreview = React.useCallback(() => {
			if (iframeRef.current) {
				iframeRef.current.src = 'about:blank';
			}
			setPlaying(false);
			setIframeLoaded(false);
			onPlayStateChange?.(false);
		}, [onPlayStateChange]);

		React.useEffect(() => {
			if (shouldWarmFrame && preloadedPreviewUrl) {
				setPreviewUrl(preloadedPreviewUrl);
			}
		}, [preloadedPreviewUrl, shouldWarmFrame]);

		// Stop audio when game becomes inactive or unmounts. The iframe owns any
		// generated-game WebAudio/HTMLAudio state, so blanking it is the reliable kill switch.
		React.useEffect(() => {
			if (!isActive && !shouldWarmFrame && (playing || iframeRef.current)) {
				stopPreview();
			}
		}, [isActive, playing, shouldWarmFrame, stopPreview]);

		React.useEffect(() => stopPreview, [stopPreview]);

		// Calculate scale to fit game resolution into container
		React.useEffect(() => {
			const container = containerRef.current;
			if (!container) return;

			const updateScale = () => {
				const { clientWidth, clientHeight } = container;
				const shouldRotateLandscape = isMobile && playableAspectRatio === '16:9' && clientHeight >= clientWidth;
				const frameDimensions = shouldRotateLandscape ? PORTRAIT_PLAYABLE_DIMENSIONS : dimensions;
				const scaleX = clientWidth / frameDimensions.width;
				const scaleY = clientHeight / frameDimensions.height;
				const shouldContainPreview = containMode && (playing || shouldWarmFrame);
				setRotateLandscape(shouldRotateLandscape);
				if (shouldContainPreview) {
					const s = Math.min(scaleX, scaleY);
					setScale(s);
					setOffset({
						x: (clientWidth - frameDimensions.width * s) / 2,
						y: (clientHeight - frameDimensions.height * s) / 2,
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
		}, [containMode, dimensions.height, dimensions.width, isMobile, playableAspectRatio, playing, shouldWarmFrame]);

		const startPlay = async () => {
			if (!isAuthenticated && !isAuthLoading) {
				if (!feedPlayAuthPromptedThisPage) {
					feedPlayAuthPromptedThisPage = true;
					requireAuth({
						actionContext: 'to save, comment, and share your playable history',
						intendedUrl: `/feed/${app.id}`,
					});
				}
			}

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
			stop: stopPreview,
			isPlaying: () => playing,
		}));

		const coverUrl = !imgError && app.screenshotUrl ? app.screenshotUrl : DEFAULT_APP_COVER_URL;
		const warmFrameActive = Boolean(previewUrl && isActive && shouldWarmFrame && !playing);
		const shouldRenderPreviewFrame = Boolean(previewUrl && (playing || shouldWarmFrame));
		const creatorName = app.userName || 'Creator';
		const isOwnAuthor = Boolean(app.userId && app.userId === user?.id);
		const showCreatorCta = Boolean(!playing && app.userId && !isOwnAuthor && !isFollowingAuthor);
		const warmPortraitPosterClassName = 'absolute left-1/2 top-1/2 z-10 aspect-[9/16] w-[44%] max-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/25 object-cover shadow-[0_20px_70px_rgba(0,0,0,0.55)]';
		const posterClassName = warmFrameActive
			? playableAspectRatio === '16:9' && !isMobile
				? 'absolute left-1/2 top-1/2 z-10 aspect-video w-[72%] max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/25 object-cover shadow-[0_20px_70px_rgba(0,0,0,0.55)]'
				: warmPortraitPosterClassName
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
								width: dimensions.width,
								height: dimensions.height,
								transform: getPlayableFrameTransform({ scale, rotateLandscape }, dimensions),
								transformOrigin: 'top left',
								opacity: playing || iframeLoaded ? 1 : 0,
								pointerEvents: playing ? 'auto' : 'none',
								transition: 'opacity 420ms ease',
							}}
						/>
					)}

					{playing && !iframeLoaded && (
						<div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black/45">
							<Loader2 className="h-8 w-8 animate-spin text-white/80" />
						</div>
					)}

					{!playing && (
						<>
							{warmFrameActive && (
								<>
									<div className="pointer-events-none absolute inset-0 z-[4] bg-black" />
									<img
										src={coverUrl}
										alt=""
										aria-hidden="true"
										className="pointer-events-none absolute inset-0 z-[5] h-full w-full scale-110 object-cover opacity-45 blur-2xl"
										onError={() => setImgError(true)}
										loading="lazy"
									/>
									<div className="pointer-events-none absolute inset-0 z-[6] bg-black/75 transition-opacity duration-500" />
								</>
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
											<div className="truncate text-xs font-semibold text-white/75">{t('Browse their games')}</div>
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
											t('Follow')
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
