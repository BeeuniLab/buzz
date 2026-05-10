import { type RefObject, type ReactNode, Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { WebSocket } from 'partysocket';
import { motion } from 'framer-motion';
import { Play, RefreshCw } from 'lucide-react';
import { PreviewIframe } from './preview-iframe';
import { ViewContainer } from './view-container';
import { ViewHeader } from './view-header';
import { PreviewHeaderActions } from './preview-header-actions';
import { UpdatePlayableAction } from './update-playable-action';
import { AssetsPanel } from './assets-panel';
import { Button } from '@/components/ui/button';
import { featureRegistry } from '@/features';
import type { FileType, BlueprintType, BehaviorType, TemplateDetails, ProjectType } from '@/api-types';
import type { Edit } from '../hooks/use-chat';
import type { ChatAssetSelectionTarget } from '../utils/chat-attachments';

const GAME_WIDTH = 720;
const GAME_HEIGHT = 1280;

function PhoneFrame({ children }: { children: ReactNode }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const updateScale = () => {
			const { clientWidth, clientHeight } = container;
			const scaleX = clientWidth / GAME_WIDTH;
			const scaleY = clientHeight / GAME_HEIGHT;
			setScale(Math.max(scaleX, scaleY));
		};
		updateScale();
		const observer = new ResizeObserver(updateScale);
		observer.observe(container);
		return () => observer.disconnect();
	}, []);

	return (
		<div className="flex-1 flex items-center justify-center bg-bg-3 overflow-hidden p-4">
			<div
				ref={containerRef}
				className="h-full aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl border border-border-primary bg-black relative"
			>
				<div style={{
					position: 'absolute',
					top: 0,
					left: 0,
					width: GAME_WIDTH,
					height: GAME_HEIGHT,
					transform: `scale(${scale})`,
					transformOrigin: 'top left',
				}}>
					{children}
				</div>
			</div>
		</div>
	);
}

function PreviewLoadingPlaceholder({
	isActive,
	isGeneratingBlueprint,
	queuePosition,
}: {
	isActive: boolean;
	isGeneratingBlueprint: boolean;
	queuePosition?: number;
}) {
	const title = queuePosition
		? 'Waiting for Preview'
		: isGeneratingBlueprint ? 'Shaping Your Idea' : 'Loading Preview';
	const statusText = queuePosition
			? `You're #${queuePosition} in line.`
		: isGeneratingBlueprint
			? 'Turning the idea into a playable direction.'
		: isActive
			? 'Making your preview playable.'
			: 'Preview will load here as soon as it is ready.';

	return (
		<div className="flex-1 flex items-center justify-center bg-bg-3" role="status" aria-live="polite">
			<div className="text-center p-8 max-w-md">
				<div className="relative mx-auto mb-5 flex size-16 items-center justify-center">
					<div className="absolute inset-0 rounded-full bg-accent/10 animate-ping" />
					<div className="relative flex size-14 items-center justify-center rounded-full bg-bg-4 border border-border-primary shadow-neo-sm">
						<RefreshCw className="size-9 text-accent animate-spin" />
					</div>
				</div>
				<h3 className="text-2xl font-semibold text-text-primary mb-2">
					{title}
				</h3>
				<p className="text-text-primary/70 text-sm mb-4">
					{statusText}
				</p>
				<div className="flex items-center justify-center gap-1.5" aria-hidden="true">
					<span className="size-2 rounded-full bg-accent animate-bounce [animation-delay:-0.2s]" />
					<span className="size-2 rounded-full bg-accent animate-bounce [animation-delay:-0.1s]" />
					<span className="size-2 rounded-full bg-accent animate-bounce" />
				</div>
			</div>
		</div>
	);
}

function PreviewPausedPlaceholder({
	onRestartPreview,
}: {
	onRestartPreview: () => void;
}) {
	return (
		<div className="flex-1 flex items-center justify-center bg-bg-3" role="status" aria-live="polite">
			<div className="text-center p-8 max-w-sm">
				<div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-bg-4 border border-border-primary shadow-neo-sm">
					<Play className="ml-0.5 size-7 text-accent" />
				</div>
				<h3 className="text-2xl font-semibold text-text-primary mb-2">
					Preview paused
				</h3>
				<p className="text-text-primary/70 text-sm mb-5">
					This preview was paused to free workspace resources.
				</p>
				<Button
					type="button"
					onClick={onRestartPreview}
				>
					<Play className="size-4" />
					Restart preview
				</Button>
			</div>
		</div>
	);
}

interface MainContentPanelProps {
	// View state
	view: 'editor' | 'preview' | 'docs' | 'blueprint' | 'presentation' | 'assets';
	onViewChange: (mode: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets') => void;

	// Preview state
	projectType: ProjectType;
	previewUrl?: string;
	previewAvailable: boolean;
	shouldRefreshPreview: boolean;
	isPreviewPaused: boolean;
	previewQueuePosition?: number;
	manualRefreshTrigger: number;
	onManualRefresh: () => void;
	onRestartPreview: () => void;

	// Blueprint
	blueprint?: BlueprintType | null;

	// Editor state
	activeFile?: FileType;
	allFiles: FileType[];
	edit?: Edit | null;
	onFileClick: (file: FileType) => void;

	// Generation state
	isGenerating: boolean;
	isGeneratingBlueprint: boolean;
	isPreviewDeploying: boolean;
	isDeployingPlayable: boolean;
	hasStablePlayable: boolean;
	isRedeployReady: boolean;
	canUpdatePlayable: boolean;
	deploymentError?: string;
	onUpdatePlayable?: () => void;

	// Template metadata
	templateDetails?: TemplateDetails | null;

	// Other
	behaviorType?: BehaviorType;
	websocket?: WebSocket;
	agentId?: string;
	selectedAssetTarget?: ChatAssetSelectionTarget | null;

	// Refs
	previewRef: RefObject<HTMLIFrameElement | null>;
	editorRef: RefObject<HTMLDivElement | null>;
}

export function MainContentPanel(props: MainContentPanelProps) {
	const {
		view,
		onViewChange,
		projectType,
		previewUrl,
		previewAvailable,
		shouldRefreshPreview,
		isPreviewPaused,
		previewQueuePosition,
		manualRefreshTrigger,
		onManualRefresh,
		onRestartPreview,
		blueprint,
		activeFile,
		allFiles,
		isGenerating,
		isGeneratingBlueprint,
		isPreviewDeploying,
		isDeployingPlayable,
		hasStablePlayable,
		isRedeployReady,
		canUpdatePlayable,
		deploymentError,
		onUpdatePlayable,
		behaviorType,
		websocket,
		agentId,
		selectedAssetTarget,
		previewRef,
		editorRef,
		templateDetails,
	} = props;

	// Feature-specific state management
	const [featureState, setFeatureStateInternal] = useState<Record<string, unknown>>({});
	const setFeatureState = useCallback((key: string, value: unknown) => {
		setFeatureStateInternal(prev => ({ ...prev, [key]: value }));
	}, []);

	const commonHeaderProps = {
		view: view as 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets',
		onViewChange,
		previewAvailable,
		previewUrl,
		projectType,
	};

	const renderViewWithHeader = (
		centerContent: ReactNode,
		viewContent: ReactNode,
		rightActions?: ReactNode,
		headerOverrides?: Partial<typeof commonHeaderProps>
	) => (
		<ViewContainer>
			<ViewHeader
				{...commonHeaderProps}
				{...headerOverrides}
				centerContent={centerContent}
				rightActions={rightActions}
			/>
			{viewContent}
		</ViewContainer>
	);

	const renderPreviewView = () => {
		const featureDefinition = featureRegistry.getDefinition(projectType);
		const previewTitle = blueprint?.title ?? featureDefinition?.name ?? 'Preview';
		const isPreviewLoading = isGenerating || isGeneratingBlueprint || isPreviewDeploying;

		if (isPreviewPaused && !isPreviewLoading) {
			return renderViewWithHeader(
				<div className="flex w-full min-w-0 items-center gap-2">
					<span
						className="min-w-0 flex-1 truncate text-left text-sm font-mono text-text-50/70"
						title={previewTitle}
					>
						{previewTitle}
					</span>
				</div>,
				<PreviewPausedPlaceholder onRestartPreview={onRestartPreview} />
			);
		}

		if (isPreviewLoading || !previewUrl) {
			return renderViewWithHeader(
				<div className="flex w-full min-w-0 items-center gap-2">
					<span
						className="min-w-0 flex-1 truncate text-left text-sm font-mono text-text-50/70"
						title={previewTitle}
					>
						{previewTitle}
					</span>
				</div>,
				<PreviewLoadingPlaceholder
					isActive={isPreviewLoading}
					isGeneratingBlueprint={isGeneratingBlueprint}
					queuePosition={previewQueuePosition}
				/>
			);
		}

		// Get feature capabilities to determine preview behavior
		const featureCapabilities = featureRegistry.getCapabilities(projectType);

		// Check if we should show the refresh button (presentations handle refresh differently)
		const showManualRefresh = featureCapabilities?.hasLiveReload ?? true;

		// Get lazy-loaded preview component from feature registry
		const FeaturePreviewComponent = featureRegistry.getLazyPreviewComponent(projectType);

		// Fallback to default PreviewIframe if no feature-specific component
		const rawPreview = FeaturePreviewComponent ? (
			<Suspense
				fallback={
					<div className="flex-1 w-full h-full flex items-center justify-center bg-bg-3">
						<RefreshCw className="size-6 text-accent animate-spin" />
					</div>
				}
			>
				<FeaturePreviewComponent
					projectType={projectType}
					behaviorType={behaviorType ?? 'phasic'}
					previewUrl={previewUrl}
					websocket={websocket}
					files={allFiles}
					activeFile={activeFile}
					currentView={view}
					onViewChange={(v) => onViewChange(v as 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets')}
					templateDetails={templateDetails}
					blueprint={blueprint}
					previewRef={previewRef}
					editorRef={editorRef}
					shouldRefreshPreview={shouldRefreshPreview}
					manualRefreshTrigger={manualRefreshTrigger}
					onManualRefresh={onManualRefresh}
					featureState={featureState}
					setFeatureState={setFeatureState}
					className="flex-1 w-full h-full border-0"
				/>
			</Suspense>
		) : (
			<PreviewIframe
				src={previewUrl}
				ref={previewRef}
				className="flex-1 w-full h-full border-0"
				title="Preview"
				shouldRefreshPreview={shouldRefreshPreview}
				manualRefreshTrigger={manualRefreshTrigger}
				webSocket={websocket}
			/>
		);

		// Wrap preview in a phone frame with iframe scaling (720x1280 native resolution)
		const previewContent = (
			<PhoneFrame>
				{rawPreview}
			</PhoneFrame>
		);

		// Get lazy-loaded header actions component from feature registry
		const FeatureHeaderActionsComponent = featureRegistry.getLazyHeaderActionsComponent(projectType);

		// Fallback to PreviewHeaderActions if no feature-specific component
		const previewActions = FeatureHeaderActionsComponent ? (
			<Suspense fallback={null}>
				<FeatureHeaderActionsComponent
					projectType={projectType}
					behaviorType={behaviorType ?? 'phasic'}
					previewUrl={previewUrl}
					websocket={websocket}
					files={allFiles}
					activeFile={activeFile}
					currentView={view}
					onViewChange={(v) => onViewChange(v as 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets')}
					templateDetails={templateDetails}
					blueprint={blueprint}
					previewRef={previewRef}
					editorRef={editorRef}
					shouldRefreshPreview={shouldRefreshPreview}
					manualRefreshTrigger={manualRefreshTrigger}
					onManualRefresh={onManualRefresh}
					featureState={featureState}
					setFeatureState={setFeatureState}
				/>
			</Suspense>
		) : (
			<PreviewHeaderActions
				previewRef={previewRef}
			/>
		);
		const canUpdateCurrentPreview = Boolean(
			onUpdatePlayable &&
			previewUrl &&
			canUpdatePlayable,
		);
		const headerActions = (
			<div className="flex min-w-0 items-center gap-1.5">
				{onUpdatePlayable && (
					<UpdatePlayableAction
						isDeploying={isDeployingPlayable}
						hasStablePlayable={hasStablePlayable}
						isUpdateAvailable={isRedeployReady || !hasStablePlayable}
						canUpdate={canUpdateCurrentPreview}
						deploymentError={deploymentError}
						onUpdate={onUpdatePlayable}
					/>
				)}
				{previewActions}
			</div>
		);

		return renderViewWithHeader(
			<div className="flex w-full min-w-0 items-center gap-2">
				<span
					className="min-w-0 flex-1 truncate text-left text-sm font-mono text-text-50/70"
					title={previewTitle}
				>
					{previewTitle}
				</span>
				{showManualRefresh && (
					<div className="flex shrink-0 items-center gap-1">
						<button
							className="p-1 hover:bg-bg-2 rounded transition-colors"
							onClick={onManualRefresh}
							title="Refresh preview"
						>
							<RefreshCw className="size-4 text-text-primary/50" />
						</button>
					</div>
				)}
			</div>,
			previewContent,
			headerActions
		);
	};

	const renderAssetsView = () =>
		renderViewWithHeader(
			<span className="text-sm font-mono text-text-50/70">Assets</span>,
			<AssetsPanel
				agentId={agentId}
				selectedAssetTarget={selectedAssetTarget}
			/>,
		);

	const renderView = () => {
		switch (view) {
			case 'preview':
			case 'presentation': // Presentations now use preview view
			case 'blueprint':
				return renderPreviewView();
			case 'editor':
			case 'docs':
				return renderPreviewView();
			case 'assets':
				return renderAssetsView();
			default:
				return null;
		}
	};

	return (
		<motion.div
			className="flex-1 flex flex-col overflow-hidden"
			initial={{ opacity: 0, scale: 0.84 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.3, ease: 'easeInOut' }}
		>
			{renderView()}
		</motion.div>
	);
}
