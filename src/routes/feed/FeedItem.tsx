import React from 'react';
import { Code2, Play, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { AppWithUserAndStats } from '@/api-types';

// Game design resolution — iframe renders at this size, then scales to fit
const GAME_WIDTH = 720;
const GAME_HEIGHT = 1280;

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
		const [deploying, setDeploying] = React.useState(false);
		const [iframeKey, setIframeKey] = React.useState(0);
		const containerRef = React.useRef<HTMLDivElement>(null);
		const iframeRef = React.useRef<HTMLIFrameElement>(null);
		const [scale, setScale] = React.useState(1);
		const [offset, setOffset] = React.useState({ x: 0, y: 0 });
		const [iframeLoaded, setIframeLoaded] = React.useState(false);

		React.useEffect(() => {
			if (preloadedPreviewUrl) {
				setPreviewUrl(preloadedPreviewUrl);
			}
		}, [preloadedPreviewUrl]);

		React.useEffect(() => {
			setIframeLoaded(false);
		}, [previewUrl]);

		// Stop audio when game becomes inactive — blank the iframe src before React unmounts it
		React.useEffect(() => {
			if (!isActive && playing && iframeRef.current) {
				iframeRef.current.src = 'about:blank';
			}
		}, [isActive, playing]);

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
			if (deploying) return;
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

			setDeploying(true);
			try {
				const res = await apiClient.deployPreview(app.id);
				if (res.success && res.data) {
					const url = res.data.previewURL || res.data.tunnelURL;
					if (url) {
						setPreviewUrl(url);
						setPlaying(true);
						onPlayStateChange?.(true);
					} else {
						toast.error('No preview available for this app');
					}
				} else {
					toast.error('No preview available for this app');
				}
			} catch {
				toast.error('Failed to load game');
			} finally {
				setDeploying(false);
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

		const hasImage = app.screenshotUrl && !imgError;
		const warmFrameActive = Boolean(previewUrl && isActive && shouldWarmFrame && !playing);
		const shouldRenderPreviewFrame = Boolean(previewUrl && isActive && (playing || shouldWarmFrame));
		const posterClassName = warmFrameActive
			? 'absolute left-1/2 top-1/2 z-10 aspect-[9/16] w-[44%] max-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/25 object-cover shadow-[0_20px_70px_rgba(0,0,0,0.55)]'
			: 'absolute inset-0 h-full w-full object-cover';
		const fallbackClassName = warmFrameActive
			? 'absolute left-1/2 top-1/2 z-10 aspect-[9/16] w-[44%] max-w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/25 bg-gradient-to-br from-bg-3 to-bg-2 flex items-center justify-center shadow-[0_20px_70px_rgba(0,0,0,0.55)]'
			: 'absolute inset-0 bg-gradient-to-br from-bg-3 to-bg-2 flex items-center justify-center';

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

							{hasImage ? (
								<img
									src={app.screenshotUrl!}
									alt={app.title}
									className={posterClassName}
									onError={() => setImgError(true)}
									loading="lazy"
								/>
							) : (
								<div className={fallbackClassName}>
									<Code2 className="h-16 w-16 text-text-tertiary/30" />
								</div>
							)}

							{/* Play button overlay */}
							<div className="absolute inset-0 z-20 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20">
								{deploying ? (
									<Loader2 className="h-14 w-14 text-white animate-spin drop-shadow-lg" />
								) : (
									<div className="bg-black/40 backdrop-blur-sm rounded-full p-4 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all">
										<Play className="h-10 w-10 text-white fill-white" />
									</div>
								)}
							</div>

							{/* View count badge */}
							{app.viewCount != null && app.viewCount > 0 && (
								<div className="absolute bottom-3 left-3 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-sm">
									<Play className="h-3.5 w-3.5 fill-white" />
									<span>{app.viewCount.toLocaleString()}</span>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		);
	},
);
