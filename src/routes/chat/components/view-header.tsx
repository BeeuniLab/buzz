import type { ReactNode } from 'react';
import { ViewModeSwitch } from './view-mode-switch';
import { HEADER_STYLES } from './view-header-styles';
import type { ProjectType } from '@/api-types';

interface ViewHeaderProps {
	view: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets';
	onViewChange: (mode: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets') => void;
	previewAvailable: boolean;
	hasDocumentation: boolean;
	previewUrl?: string;
	centerContent?: ReactNode;
	rightActions?: ReactNode;
	projectType?: ProjectType;
}

export function ViewHeader({
	view,
	onViewChange,
	previewAvailable,
    hasDocumentation,
	previewUrl,
	centerContent,
	rightActions,
	projectType,
}: ViewHeaderProps) {
	return (
		<div
			className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center min-h-10 bg-bg-2 border-b ${HEADER_STYLES.padding}`}
		>
			<div className="flex min-w-0 items-center">
				<ViewModeSwitch
					view={view}
					onChange={onViewChange}
					previewAvailable={previewAvailable}
					hasDocumentation={hasDocumentation}
					previewUrl={previewUrl}
					projectType={projectType}
				/>
			</div>
			<div className="flex min-w-0 items-center justify-center overflow-hidden px-0.5">
				<div className="w-full min-w-0 max-w-full">{centerContent}</div>
			</div>
			<div className="flex min-w-0 items-center justify-end">
				{rightActions}
			</div>
		</div>
	);
}
