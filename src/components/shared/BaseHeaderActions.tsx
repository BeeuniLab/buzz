import type { RefObject } from 'react';
import { Expand } from 'lucide-react';
import { HeaderButton } from '@/components/shared/header-actions';

export interface BaseHeaderActionsProps {
	containerRef: RefObject<HTMLElement | null>;
}

export function BaseHeaderActions({
	containerRef,
}: BaseHeaderActionsProps) {
	return (
		<HeaderButton
			icon={Expand}
			onClick={() => containerRef.current?.requestFullscreen()}
			title="Fullscreen"
			iconOnly
		/>
	);
}
