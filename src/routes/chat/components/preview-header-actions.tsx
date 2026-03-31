import type { RefObject } from 'react';
import { BaseHeaderActions } from '@/components/shared/BaseHeaderActions';

interface PreviewHeaderActionsProps {
	previewRef: RefObject<HTMLIFrameElement | null>;
}

export function PreviewHeaderActions({
	previewRef,
}: PreviewHeaderActionsProps) {
	return (
		<BaseHeaderActions
			containerRef={previewRef}
		/>
	);
}
