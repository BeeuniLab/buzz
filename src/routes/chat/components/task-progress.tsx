import clsx from 'clsx';
import { Loader, AlertCircle, RefreshCcw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import type { FileType } from '@/api-types';
import { ThinkingIndicator } from './thinking-indicator';
import { useAppI18n } from '@/i18n';

import type { ProjectStage } from '../utils/project-stage-helpers';

// Animation variants and transitions for consistent motion
const statusIconVariants = {
	initial: { scale: 0.2, opacity: 0.4 },
	animate: { scale: 1, opacity: 1 },
	exit: { scale: 0.2, opacity: 0.4 },
};

const commonTransitions = {
	smooth: { duration: 0.3, ease: 'easeOut' as const },
	premium: { duration: 0.4, ease: [0.23, 1, 0.32, 1] as const },
	fast: { duration: 0.2, ease: 'easeOut' as const },
	premiumShort: { duration: 0.3, ease: [0.23, 1, 0.32, 1] as const },
	smoothInOut: { duration: 0.3, ease: 'easeInOut' as const },
};

// Consolidated status-specific loader components
interface StatusLoaderProps {
	size?: 'sm' | 'md';
	color?: 'accent' | 'blue' | 'orange' | 'tertiary' | 'green';
}

const StatusLoader = ({ size = 'md', color = 'accent' }: StatusLoaderProps) => {
	const sizeClass = size === 'sm' ? 'size-3' : 'w-4 h-4';
	const colorMap = {
		accent: 'text-accent',
		blue: 'text-blue-400',
		orange: 'text-orange-400',
		tertiary: 'text-text-tertiary',
		green: 'text-green-500'
	};
	return <Loader className={`${sizeClass} animate-spin ${colorMap[color]}`} />;
};

// Animated Status Indicator for project stages
interface AnimatedStatusIndicatorProps {
	status: 'pending' | 'active' | 'completed' | 'error';
	size?: number;
}

function AnimatedStatusIndicator({ status, size = 5 }: AnimatedStatusIndicatorProps) {
	const sizeClass = `size-${size}`;

	return (
		<div className="translate-y-px z-20">
			<AnimatePresence mode="wait">
				{status === 'pending' && (
					<motion.div
						key="pending"
						variants={statusIconVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={commonTransitions.smoothInOut}
						className={clsx(sizeClass, 'flex items-center justify-center')}
					>
						<div className="size-2 rounded-full bg-zinc-300" />
					</motion.div>
				)}
				{status === 'active' && (
					<motion.div
						key="active"
						variants={statusIconVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={commonTransitions.smoothInOut}
						className={clsx(sizeClass, 'bg-bg-4 dark:bg-bg-2 flex items-center justify-center')}
					>
						<Loader className="size-3 text-accent animate-spin" />
					</motion.div>
				)}
				{status === 'completed' && (
					<motion.div
						key="completed"
						variants={statusIconVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={commonTransitions.smoothInOut}
						className={clsx(sizeClass, 'flex items-center justify-center')}
					>
						<div className="size-2 rounded-full bg-accent" />
					</motion.div>
				)}
				{status === 'error' && (
					<motion.div
						key="error"
						variants={statusIconVariants}
						initial="initial"
						animate="animate"
						exit="exit"
						transition={commonTransitions.smoothInOut}
						className={clsx(sizeClass, 'flex items-center justify-center')}
					>
						<AlertCircle className="size-3 text-red-500" />
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

interface TaskProgressProps {
	projectStages: ProjectStage[];
	files: FileType[];
	isThinkingNext?: boolean;
	isPreviewDeploying?: boolean;
	// Issue tracking and debugging
	runtimeErrorCount?: number;
	staticIssueCount?: number;
	isDebugging?: boolean;
	// Activity state
	isGenerating?: boolean;
	isThinking?: boolean;
	taskRuntimeEstimate?: string;
	onRetryFailedWorkflow?: () => void;
	retryFailedWorkflowDisabled?: boolean;
}

export function TaskProgress({
	projectStages,
	files,
	isThinkingNext,
	isPreviewDeploying,
	runtimeErrorCount = 0,
	staticIssueCount = 0,
	isDebugging = false,
	isGenerating = false,
	isThinking = false,
	taskRuntimeEstimate,
	onRetryFailedWorkflow,
	retryFailedWorkflowDisabled = false
}: TaskProgressProps) {
	const { t } = useAppI18n();
	const codeStage = projectStages.find(stage => stage.id === 'code');
	const queuePosition = codeStage?.queuePosition;
	const showFileSummary = files.length > 0 && codeStage?.status !== 'pending';
	const isCreatingPlayable = codeStage?.status === 'active' || isGenerating || isThinking || isPreviewDeploying || files.some(f => f.isGenerating);
	const canRetryFailedWorkflow = codeStage?.status === 'error' && onRetryFailedWorkflow;

	return (
		<motion.div
			layout="position"
			className="pl-9 mb-2 relative"
		>
				{/* Main Timeline Card */}
				<div className="px-2 pr-3.5 py-3 flex-1 rounded-xl border border-black/12 bg-bg-4 dark:bg-bg-2">
				{/* Calculate if Done/Debugging will show for line extension */}
				{(() => {
					const allStagesCompleted = projectStages.every(stage => stage.status === 'completed');
					const isAnythingHappening = isDebugging || isGenerating || isThinking || isPreviewDeploying;
					const willShowStatusStage = (allStagesCompleted && !isAnythingHappening) || isDebugging;
					
					return (
						<>
					{/* Project Stages */}
					{projectStages.map((stage, index) => (
						<div key={stage.id} className="flex relative w-full gap-2 pb-2.5">
						<AnimatedStatusIndicator status={stage.status} />

						<div className="flex flex-col gap-2 flex-1">
							<div className="flex">
								<span className={clsx(
									'font-medium',
									stage.status === 'pending'
										? 'text-text-tertiary'
										: 'text-text-secondary'
								)}>
									{t(stage.title)}
								</span>

								{/* Subtle inline issue indicator for completed code stage */}
								{stage.id === 'code' && stage.status === 'completed' && (runtimeErrorCount > 0 || staticIssueCount > 0) && (
									<motion.span
										initial={{ opacity: 0, scale: 0.9 }}
										animate={{ opacity: 1, scale: 1 }}
										transition={commonTransitions.premiumShort}
										className="inline-flex items-center gap-1.5 ml-1.5 text-xs"
									>
										<span className="text-zinc-300">&bull;</span>
										{runtimeErrorCount > 0 && (
											<span className="inline-flex items-center gap-1">
												<div className="w-1.5 h-1.5 rounded-full bg-red-400" />
												<span className="text-red-400/80">{t(runtimeErrorCount > 1 ? '{count} errors' : '{count} error', { count: runtimeErrorCount })}</span>
											</span>
										)}
										{runtimeErrorCount > 0 && staticIssueCount > 0 && (
											<span className="text-text-tertiary/50">,</span>
										)}
										{staticIssueCount > 0 && (
											<span className="inline-flex items-center gap-1">
												<div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
												<span className="text-orange-400/80">{t(staticIssueCount > 1 ? '{count} warnings' : '{count} warning', { count: staticIssueCount })}</span>
											</span>
										)}
									</motion.span>
								)}
								</div>

								{stage.id === 'code' && taskRuntimeEstimate && (stage.status === 'pending' || stage.status === 'active') && (
									<motion.div
										initial={{ opacity: 0, y: -2 }}
										animate={{ opacity: 1, y: 0 }}
										transition={commonTransitions.premiumShort}
										className="text-xs text-text-tertiary -mt-1"
									>
										{stage.queuePosition ? t("You're #{position} in line.", { position: stage.queuePosition }) : taskRuntimeEstimate}
									</motion.div>
								)}

								{/* Detailed task progress for the code stage */}
								{stage.id === 'code' && (
									<div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 task-progress-scroll relative">
										{queuePosition && (
											<div className="space-y-1 relative px-1 py-1">
												<div className="flex items-start gap-2 relative z-0 w-full text-left">
													<div className="flex-shrink-0 mt-0.5">
														<StatusLoader size="sm" color="blue" />
													</div>
													<span className="text-sm font-medium text-text-50 flex-1 break-words">
														{t('Waiting for an available workspace')}
													</span>
												</div>
											</div>
										)}

										{/* Validation/Preview deployment indicator */}
										{(() => {
											if (isPreviewDeploying) {
												return (
													<div className="space-y-1 relative bg-orange-50/5 border border-orange-200/20 rounded-lg p-3">
														<div className="flex items-center gap-2">
															<StatusLoader size="sm" color="orange" />
															<span className="text-sm font-medium text-orange-400">{t('Preparing preview...')}</span>
														</div>
														<span className="text-xs text-orange-300/80 ml-5">{t('Getting it ready to play')}</span>
													</div>
												);
											}
											return null;
										})()}

										{/* Thinking indicator for the next task update */}
										{isThinkingNext && (
											<div className="relative z-10">
												<ThinkingIndicator visible={isThinkingNext} />
											</div>
											)}

											{/* File count summary for generated content */}
											{showFileSummary && (
												<div className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs text-text-tertiary">
													<span>
														{codeStage?.status === 'error'
															? t('Playable version was not completed')
															: isCreatingPlayable
																? t('Creating your playable...')
																: t('Playable content created')
														}
													</span>
													{canRetryFailedWorkflow && (
														<button
															type="button"
															onClick={onRetryFailedWorkflow}
															disabled={retryFailedWorkflowDisabled}
															className={clsx(
																'inline-flex h-7 items-center gap-1 rounded-md border border-border-primary bg-bg-2 px-2 text-xs font-medium text-text-primary transition-colors',
																retryFailedWorkflowDisabled
																	? 'cursor-not-allowed opacity-50'
																	: 'hover:border-accent/60 hover:bg-bg-1',
															)}
														>
															<RefreshCcw className="size-3" />
															{t('Retry')}
														</button>
													)}
												</div>
											)}
									</div>
								)}

							{stage.metadata && (
								<span className="font-mono text-xs text-zinc-500 tracking-tighter">
									{stage.metadata}
								</span>
							)}
						</div>

						{/* Vertical connecting line */}
						{(index !== projectStages.length - 1 || (index === projectStages.length - 1 && willShowStatusStage)) && (
							<div className={clsx(
								'absolute left-[9.25px] w-px h-full top-2.5 z-10',
								stage.status === 'completed'
									? 'bg-accent'
									: 'bg-text/5'
							)} />
						)}
					</div>
				))}
				
				<AnimatePresence mode="wait">
					{/* Done stage - shows when everything is complete and nothing is happening */}
					{(() => {
						const allStagesCompleted = projectStages.every(stage => stage.status === 'completed');
						const isAnythingHappening = isDebugging || isGenerating || isThinking || isPreviewDeploying;
						const showDone = allStagesCompleted && !isAnythingHappening;
						
						if (showDone) {
							return (
								<motion.div
									key="done"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={commonTransitions.premiumShort}
									className="flex relative w-full gap-2 pb-2.5"
								>
									{/* Connecting line from previous stage */}
									<div className="absolute left-[9.25px] w-px h-[0.875rem] -top-[0.875rem] bg-accent" />

									<AnimatedStatusIndicator status="completed" />

									<div className="flex flex-col gap-2 flex-1">
										<span className="font-medium text-text-secondary">{t('Ready to play')}</span>
									</div>
								</motion.div>
							);
						}
						
						// Show debugging status when debugging
						if (isDebugging) {
							return (
								<motion.div
									key="debugging"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={commonTransitions.premiumShort}
									className="flex relative w-full gap-2 pb-2.5"
								>
									{/* Connecting line from previous stage */}
									<div className="absolute left-[9.25px] w-px h-[0.875rem] -top-[0.875rem] bg-accent" />
									
									<AnimatedStatusIndicator status="active" />
									
									<div className="flex flex-col gap-2 flex-1">
										<span className="font-medium text-text-secondary">{t('Debugging in progress...')}</span>
									</div>
								</motion.div>
							);
						}
						
						return null;
					})()}
			</AnimatePresence>
			</>
			);
			})()}
			</div>
			</motion.div>
		);
	}
