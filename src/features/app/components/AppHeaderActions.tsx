import { BaseHeaderActions } from '@/components/shared/BaseHeaderActions';
import type { HeaderActionsProps } from '../../core/types';

export function AppHeaderActions({
	previewRef,
}: HeaderActionsProps) {
	return (
		<BaseHeaderActions
			containerRef={previewRef}
		/>
	);
}
