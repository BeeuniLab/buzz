import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import type { PlayableAspectRatio } from '@/api-types';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export const PORTRAIT_PLAYABLE_DIMENSIONS = { width: 720, height: 1280 } as const;

export const PLAYABLE_DIMENSIONS: Record<PlayableAspectRatio, { width: number; height: number }> = {
	'9:16': PORTRAIT_PLAYABLE_DIMENSIONS,
	'16:9': { width: 1280, height: 720 },
};

export interface PlayableFrameState {
	width: number;
	height: number;
	scale: number;
	rotateLandscape: boolean;
}

export function getPlayableAspectRatio(value: unknown): PlayableAspectRatio {
	return value === '16:9' ? '16:9' : '9:16';
}

export function getPlayableFrameTransform(
	frame: Pick<PlayableFrameState, 'scale' | 'rotateLandscape'>,
	dimensions: { width: number; height: number },
) {
	return frame.rotateLandscape
		? `scale(${frame.scale}) translateX(${dimensions.height}px) rotate(90deg)`
		: `scale(${frame.scale})`;
}

export function usePlayableFrame({
	aspectRatio,
	containerRef,
	lockDesktopPortraitWidth = false,
	maxDesktopFrameHeight,
	maxDesktopFrameWidth,
}: {
	aspectRatio: PlayableAspectRatio;
	containerRef: React.RefObject<HTMLElement | null>;
	lockDesktopPortraitWidth?: boolean;
	maxDesktopFrameHeight?: number;
	maxDesktopFrameWidth?: number;
}) {
	const isMobile = useIsMobile();
	const dimensions = PLAYABLE_DIMENSIONS[aspectRatio];
	const [frame, setFrame] = useState<PlayableFrameState>({
		width: 0,
		height: 0,
		scale: 1,
		rotateLandscape: false,
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateFrame = () => {
			const { clientWidth, clientHeight } = container;
			if (!clientWidth || !clientHeight) return;

			const rotateLandscape = isMobile && aspectRatio === '16:9' && clientHeight >= clientWidth;
			const frameDimensions = rotateLandscape ? PORTRAIT_PLAYABLE_DIMENSIONS : dimensions;
			const widthBudget = lockDesktopPortraitWidth && !isMobile
				? Math.min(clientWidth, PORTRAIT_PLAYABLE_DIMENSIONS.width)
				: clientWidth;
			const desktopWidthBudget = !isMobile && maxDesktopFrameWidth
				? Math.min(widthBudget, maxDesktopFrameWidth)
				: widthBudget;
			const heightBudget = !isMobile && maxDesktopFrameHeight
				? Math.min(clientHeight, maxDesktopFrameHeight)
				: clientHeight;
			const scale = Math.min(
				desktopWidthBudget / frameDimensions.width,
				heightBudget / frameDimensions.height,
			);

			setFrame({
				width: frameDimensions.width * scale,
				height: frameDimensions.height * scale,
				scale,
				rotateLandscape,
			});
		};

		updateFrame();
		const observer = new ResizeObserver(updateFrame);
		observer.observe(container);
		return () => observer.disconnect();
	}, [
		aspectRatio,
		containerRef,
		dimensions.height,
		dimensions.width,
		isMobile,
		lockDesktopPortraitWidth,
		maxDesktopFrameHeight,
		maxDesktopFrameWidth,
	]);

	return { dimensions, frame };
}

export function PlayableFrame({
	aspectRatio,
	children,
	className,
	frameClassName,
	lockDesktopPortraitWidth = false,
	maxDesktopFrameHeight,
	maxDesktopFrameWidth,
}: {
	aspectRatio: PlayableAspectRatio;
	children: ReactNode;
	className?: string;
	frameClassName?: string;
	lockDesktopPortraitWidth?: boolean;
	maxDesktopFrameHeight?: number;
	maxDesktopFrameWidth?: number;
}) {
	const outerRef = useRef<HTMLDivElement>(null);
	const { dimensions, frame } = usePlayableFrame({
		aspectRatio,
		containerRef: outerRef,
		lockDesktopPortraitWidth,
		maxDesktopFrameHeight,
		maxDesktopFrameWidth,
	});

	const innerStyle: CSSProperties = {
		position: 'absolute',
		top: 0,
		left: 0,
		width: dimensions.width,
		height: dimensions.height,
		transform: getPlayableFrameTransform(frame, dimensions),
		transformOrigin: 'top left',
	};

	return (
		<div ref={outerRef} className={cn('flex items-center justify-center overflow-hidden', className)}>
			<div
				className={cn('relative overflow-hidden rounded-2xl border border-border-primary bg-black shadow-2xl', frameClassName)}
				style={{
					width: frame.width || undefined,
					height: frame.height || undefined,
				}}
			>
				<div style={innerStyle}>
					{children}
				</div>
			</div>
		</div>
	);
}
