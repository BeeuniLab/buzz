import clsx from 'clsx';
import { AlertCircle, CheckCircle2, LoaderCircle, Play, Upload } from 'lucide-react';
import { useAppI18n } from '@/i18n';

interface UpdatePlayableActionProps {
	isDeploying: boolean;
	isTaskRunning?: boolean;
	hasStablePlayable: boolean;
	isUpdateAvailable: boolean;
	canUpdate: boolean;
	deploymentError?: string;
	unavailableTitle?: string;
	showLabelOnMobile?: boolean;
	onUpdate: () => void;
}

export function UpdatePlayableAction({
	isDeploying,
	isTaskRunning = false,
	hasStablePlayable,
	isUpdateAvailable,
	canUpdate,
	deploymentError,
	unavailableTitle,
	showLabelOnMobile = false,
	onUpdate,
}: UpdatePlayableActionProps) {
	const { t } = useAppI18n();
	const isReady = hasStablePlayable && !isUpdateAvailable && !deploymentError;
	const disabled = isDeploying || isTaskRunning || !canUpdate || isReady;
	const Icon = isDeploying
		? LoaderCircle
		: deploymentError && isUpdateAvailable
			? AlertCircle
			: isReady
				? CheckCircle2
				: hasStablePlayable
					? Upload
					: Play;
	const label = isDeploying
		? t('Sharing')
		: isReady
			? t('Shared')
			: hasStablePlayable
				? t('Update')
				: t('Share');
	const title = isDeploying
		? t('Sharing playable')
		: isTaskRunning
			? t('Please wait for the current task to finish before sharing')
			: !canUpdate
			? unavailableTitle || t('Preview needs to be ready first')
			: isReady
				? t('Playable is already shared')
				: hasStablePlayable
					? t('Update playable')
					: t('Share playable');

	return (
		<button
			type="button"
			onClick={onUpdate}
			disabled={disabled}
			title={deploymentError || title}
			aria-label={title}
			className={clsx(
				'inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors sm:h-8 sm:gap-1.5 sm:px-2.5 sm:text-xs',
				disabled
					? 'cursor-not-allowed border-border-primary bg-bg-3 text-text-primary/45'
					: 'border-border-primary bg-bg-4 text-text-primary shadow-neo-sm hover:bg-bg-1 hover:text-brand-primary',
			)}
		>
			<Icon className={clsx('size-3 sm:size-3.5', isDeploying && 'animate-spin')} />
			<span className={clsx(!showLabelOnMobile && 'hidden sm:inline')}>{label}</span>
		</button>
	);
}
