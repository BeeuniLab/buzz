import clsx from 'clsx';
import { Eye, FileText, Presentation, Image } from 'lucide-react';
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
	hasDocumentation = false,
	previewUrl,
	projectType,
}: {
	view: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets'
	onChange: (mode: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets') => void;
	previewAvailable: boolean;
	hasDocumentation: boolean;
	previewUrl?: string;
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

	if (!previewAvailable) {
		return null;
	}

	return (
		<div className="flex items-center gap-1 bg-bg-1 rounded-md p-0.5 relative">
			{/* Preview button - show when app has preview URL */}
			{previewUrl && (
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

			{/* Docs button - show when documentation exists */}
			{hasDocumentation && (
				<button
					onClick={() => onChange('docs')}
					className={clsx(
						'p-1 flex items-center justify-between h-full rounded-md transition-colors',
						view === 'docs'
							? 'bg-bg-4 text-text-primary'
							: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
					)}
					title="Docs"
				>
					<FileText className="size-4" />
				</button>
			)}
		</div>
	);
}
