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
}

export const FeedItem = React.forwardRef<FeedItemHandle, FeedItemProps>(
	function FeedItem({ app, isActive = true }, ref) {
		const [imgError, setImgError] = React.useState(false);
		const [playing, setPlaying] = React.useState(false);
		const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
		const [deploying, setDeploying] = React.useState(false);
		const [iframeKey, setIframeKey] = React.useState(0);
		const containerRef = React.useRef<HTMLDivElement>(null);
		const [scale, setScale] = React.useState(1);

		// Calculate scale to fit game resolution into container
		React.useEffect(() => {
			const container = containerRef.current;
			if (!container) return;

			const updateScale = () => {
				const { clientWidth, clientHeight } = container;
				const scaleX = clientWidth / GAME_WIDTH;
				const scaleY = clientHeight / GAME_HEIGHT;
				setScale(Math.max(scaleX, scaleY));
			};

			updateScale();
			const observer = new ResizeObserver(updateScale);
			observer.observe(container);
			return () => observer.disconnect();
		}, []);

		const startPlay = async () => {
			if (deploying) return;

			if (playing && previewUrl) {
				setIframeKey((k) => k + 1);
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

		return (
			<div className="h-full w-full snap-start snap-always relative flex-shrink-0 bg-black">
				<div
					ref={containerRef}
					className="absolute inset-0 cursor-pointer group overflow-hidden"
					onClick={!playing ? startPlay : undefined}
				>
					{playing && previewUrl && isActive ? (
						<iframe
							key={iframeKey}
							src={previewUrl}
							title={`Play ${app.title}`}
							allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
							style={{
								position: 'absolute',
								top: 0,
								left: 0,
								border: 'none',
								width: GAME_WIDTH,
								height: GAME_HEIGHT,
								transform: `scale(${scale})`,
								transformOrigin: 'top left',
							}}
						/>
					) : (
						<>
							{hasImage ? (
								<img
									src={app.screenshotUrl!}
									alt={app.title}
									className="absolute inset-0 w-full h-full object-cover"
									onError={() => setImgError(true)}
									loading="lazy"
								/>
							) : (
								<div className="absolute inset-0 bg-gradient-to-br from-bg-3 to-bg-2 flex items-center justify-center">
									<Code2 className="h-16 w-16 text-text-tertiary/30" />
								</div>
							)}

							{/* Play button overlay */}
							<div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
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
								<div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 text-white text-sm">
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
