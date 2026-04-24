import clsx from 'clsx';
import { Eye, Presentation, Image } from 'lucide-react';
import { featureRegistry } from '@/features';
import type { ProjectType } from '@/api-types';

// Map icon names to components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
	Eye,
	Presentation,
};

export function ViewModeSwitch({
	view,
	onChange,
	previewAvailable = false,
	projectType,
}: {
	view: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets'
	onChange: (mode: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets') => void;
	previewAvailable: boolean;
	projectType?: ProjectType;
}) {
	// Get feature definition to determine icon and label
	const featureDefinition = projectType ? featureRegistry.getDefinition(projectType) : null;

	// Get the preview view definition to find the icon
	const featureModule = projectType ? featureRegistry.getModule(projectType) : null;
	const views = featureModule?.getViews() ?? [];
	const previewView = views.find(v => v.id === 'preview');
	const iconName = previewView?.iconName;
	const PreviewIcon = (iconName && ICON_MAP[iconName]) || Eye;

	const showPreviewButton = previewAvailable || view === 'preview' || view === 'presentation';
	const showAssetsButton = previewAvailable || view === 'assets';

	if (!showPreviewButton && !showAssetsButton) {
		return null;
	}

	return (
		<div className="flex items-center gap-1 bg-bg-1 rounded-md p-0.5 relative">
			{/* Preview button */}
			{showPreviewButton && (
				<button
					onClick={() => onChange('preview')}
					className={clsx(
						'p-1 flex items-center justify-between h-full rounded-md transition-colors',
						view === 'preview' || view === 'presentation'
							? 'bg-bg-4 text-text-primary'
							: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
					)}
					title={featureDefinition?.name ?? 'Preview'}
				>
					<PreviewIcon className="size-4" />
				</button>
			)}

			{showAssetsButton && (
				<button
					onClick={() => onChange('assets')}
					className={clsx(
						'p-1 flex items-center justify-between h-full rounded-md transition-colors',
						view === 'assets'
							? 'bg-bg-4 text-text-primary'
							: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
					)}
					title="Assets"
				>
					<Image className="size-4" />
				</button>
			)}
		</div>
	);
}
