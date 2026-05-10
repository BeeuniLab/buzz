import clsx from 'clsx';
import { Loader, Check, AlertCircle, XCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PhaseTimelineItem } from '../hooks/use-chat';
import type { FileType } from '@/api-types';
import { ThinkingIndicator } from './thinking-indicator';

import type { ProjectStage } from '../utils/project-stage-helpers';

// Unified status type for consistency
type UnifiedStatus = 'pending' | 'active' | 'completed' | 'error' | 'generating' | 'validating' | 'cancelled';

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

// Centralized phase status utilities
const getPhaseByStatus = (phases: PhaseTimelineItem[], status: PhaseTimelineItem['status']) =>
	phases.find(p => p.status === status);

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

// Unified StatusIcon component to eliminate DRY
interface StatusIconProps {
	status: UnifiedStatus;
	size?: 'sm' | 'md';
	className?: string;
}

function StatusIcon({ status, size = 'md', className }: StatusIconProps) {
	const sizeClasses = {
		sm: 'w-3 h-3',
		md: 'w-4 h-4',
	};

	const iconClasses = sizeClasses[size];

	switch (status) {
		case 'generating':
			return <Loader className={clsx(iconClasses, 'animate-spin text-accent', className)} />;
		case 'validating':
			return <Loader className={clsx(iconClasses, 'animate-spin text-blue-400', className)} />;
		case 'completed':
			return <Check className={clsx(iconClasses, 'text-green-500', className)} />;
		case 'cancelled':
			return <XCircle className={clsx(iconClasses, 'text-orange-400', className)} />;
		case 'error':
			return <AlertCircle className={clsx(iconClasses, 'text-red-500', className)} />;
		case 'active':
			return <Loader className={clsx(iconClasses, 'animate-spin text-accent', className)} />;
		case 'pending':
		default:
			return <div className={clsx(iconClasses, 'bg-bg-3-foreground/40 dark:bg-bg-3-foreground/30 rounded-full', className)} />;
	}
}

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

interface PhaseTimelineProps {
	projectStages: ProjectStage[];
	phaseTimeline: PhaseTimelineItem[];
	files: FileType[];
	view: string;
	isThinkingNext?: boolean;
	isPreviewDeploying?: boolean;
	progress: number;
	total: number;
	parentScrollRef?: RefObject<HTMLDivElement | null>;
	onViewChange?: (view: 'blueprint') => void;
	// Issue tracking and debugging
	runtimeErrorCount?: number;
	staticIssueCount?: number;
	isDebugging?: boolean;
	// Activity state
	isGenerating?: boolean;
	isThinking?: boolean;
	taskRuntimeEstimate?: string;
}

export function PhaseTimeline({
	projectStages,
	phaseTimeline,
	files,
	isThinkingNext,
	isPreviewDeploying,
	progress,
	total,
	runtimeErrorCount = 0,
	staticIssueCount = 0,
	isDebugging = false,
	isGenerating = false,
	isThinking = false,
	taskRuntimeEstimate
}: PhaseTimelineProps) {
	const lastPhaseRef = useRef<HTMLDivElement>(null);
	const hasStepProgress = phaseTimeline.length > 0 || total > 1;
	const codeStage = projectStages.find(stage => stage.id === 'code');
	const queuePosition = codeStage?.queuePosition;
	const showFileSummary = phaseTimeline.length === 0 && files.length > 0 && codeStage?.status !== 'pending';
	const isCreatingPlayable = codeStage?.status === 'active' || isGenerating || isThinking || isPreviewDeploying || files.some(f => f.isGenerating);

	// Auto-scroll to bottom when new phases are added or thinking indicator appears
	useEffect(() => {
		if (lastPhaseRef.current) {
			lastPhaseRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
		}
	}, [phaseTimeline.length, isThinkingNext]);

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
									{stage.title}
								</span>

									{/* Progress for code stage */}
									{stage.id === 'code' && stage.status !== 'pending' && hasStepProgress && (
										<motion.div
											initial={{ x: -120 }}
											animate={{ x: 0 }}
										>
											<span className="text-zinc-300 mx-1">&bull;</span>
											<span className="text-text-tertiary">
												{stage.status === 'completed' ? total : progress}/{total} steps
											</span>
										</motion.div>
									)}

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
												<span className="text-red-400/80">{runtimeErrorCount} error{runtimeErrorCount > 1 ? 's' : ''}</span>
											</span>
										)}
										{runtimeErrorCount > 0 && staticIssueCount > 0 && (
											<span className="text-text-tertiary/50">,</span>
										)}
										{staticIssueCount > 0 && (
											<span className="inline-flex items-center gap-1">
												<div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
												<span className="text-orange-400/80">{staticIssueCount} warning{staticIssueCount > 1 ? 's' : ''}</span>
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
										{stage.queuePosition ? `You're #${stage.queuePosition} in line.` : taskRuntimeEstimate}
									</motion.div>
								)}

								{/* Detailed Phase Timeline for code stage */}
								{stage.id === 'code' && (
									<div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 phase-timeline-scroll relative">
										{queuePosition && phaseTimeline.length === 0 && (
											<div className="space-y-1 relative px-1 py-1">
												<div className="flex items-start gap-2 relative z-0 w-full text-left">
													<div className="flex-shrink-0 mt-0.5">
														<StatusLoader size="sm" color="blue" />
													</div>
													<span className="text-sm font-medium text-text-50 flex-1 break-words">
														Waiting for an available workspace
													</span>
												</div>
											</div>
										)}
										{phaseTimeline.map((phase, phaseIndex) => (
											<div
												key={phase.id}
												className="space-y-1 relative"
												ref={phaseIndex === phaseTimeline.length - 1 ? lastPhaseRef : undefined}
											>
												{/* Subtle vertical line connecting phases */}
												{phaseIndex < phaseTimeline.length - 1 && (
													<div className="absolute left-[5px] w-[0.5px] h-full top-3 bg-border-primary/40" />
												)}
												{/* Phase Implementation Header */}
												<div
													className="flex items-start gap-2 relative z-0 w-full text-left px-1 py-1"
												>
													<div className="flex-shrink-0 mt-0.5">
														<StatusIcon status={phase.status} size="sm" />
													</div>
													<span className="text-sm font-medium text-text-50 flex-1 break-words">
														{phase.status === 'completed' ? 'Created a playable version' :
														 phase.status === 'cancelled' ? 'Paused this step' :
														 phase.status === 'error' ? 'Interrupted step' :
														 phase.status === 'validating' ? 'Polishing the experience' :
														 'Creating the playable experience'}
													</span>
												</div>
											</div>
										))}

										{/* Validation/Preview deployment indicator */}
										{(() => {
											const validatingPhase = getPhaseByStatus(phaseTimeline, 'validating');
											if (validatingPhase) {
												return (
													<div className="space-y-1 relative bg-blue-50/5 border border-blue-200/20 rounded-lg p-3">
														<div className="flex items-center gap-2">
															<StatusLoader size="sm" color="blue" />
															<span className="text-sm font-medium text-blue-400">Polishing the experience...</span>
														</div>
														<span className="text-xs text-blue-300/80 ml-5">Checking that it feels right</span>
													</div>
												);
											} else if (isPreviewDeploying) {
												return (
													<div className="space-y-1 relative bg-orange-50/5 border border-orange-200/20 rounded-lg p-3">
														<div className="flex items-center gap-2">
															<StatusLoader size="sm" color="orange" />
															<span className="text-sm font-medium text-orange-400">Preparing preview...</span>
														</div>
														<span className="text-xs text-orange-300/80 ml-5">Getting it ready to play</span>
													</div>
												);
											}
											return null;
										})()}

										{/* Thinking indicator for next phase */}
										{isThinkingNext && (
											<div className="relative z-10" ref={lastPhaseRef}>
												<ThinkingIndicator visible={isThinkingNext} />
											</div>
											)}

											{/* File count summary for agentic mode (no phase timeline) */}
											{showFileSummary && (
												<div className="text-xs text-text-tertiary px-2 py-1">
													{codeStage?.status === 'error'
														? 'Playable version was not completed'
														: isCreatingPlayable
															? 'Creating your playable...'
															: 'Playable content created'
													}
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
										<span className="font-medium text-text-secondary">Ready to play</span>
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
										<span className="font-medium text-text-secondary">Debugging in progress...</span>
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
