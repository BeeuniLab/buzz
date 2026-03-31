import type { RefObject } from 'react';
import { BaseHeaderActions } from '@/components/shared/BaseHeaderActions';

interface EditorHeaderActionsProps {
	editorRef: RefObject<HTMLDivElement | null>;
}

export function EditorHeaderActions({
	editorRef,
}: EditorHeaderActionsProps) {
	return (
		<BaseHeaderActions
			containerRef={editorRef}
		/>
	);
}
