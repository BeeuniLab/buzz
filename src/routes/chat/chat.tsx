import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type FormEvent,
} from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { LoaderCircle, MoreHorizontal, RotateCcw, MessageSquare, Eye } from 'lucide-react';
import clsx from 'clsx';
import { UserMessage, AIMessage } from './components/messages';
import { PhaseTimeline } from './components/phase-timeline';
import { type DebugMessage } from './components/debug-panel';
import { useChat } from './hooks/use-chat';
import {
	type BlueprintType,
	type PhasicBlueprint,
	SUPPORTED_CHAT_MEDIA_MIME_TYPES,
	type ProjectType,
	type FileType,
} from '@/api-types';
import { featureRegistry } from '@/features';
import { useFileContentStream } from './hooks/use-file-content-stream';
import { logger } from '@/utils/logger';
import { useApp } from '@/hooks/use-app';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { useImageUpload } from '@/hooks/use-image-upload';
import { useDragDrop } from '@/hooks/use-drag-drop';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { sendWebSocketMessage } from './utils/websocket-helpers';
import { detectContentType, isDocumentationPath, isMarkdownFile } from './utils/content-detector';
import { mergeFiles } from '@/utils/file-helpers';
import { ChatModals } from './components/chat-modals';
import { MainContentPanel } from './components/main-content-panel';
import { ChatInput } from './components/chat-input';
import { useVault } from '@/hooks/use-vault';
import { VaultUnlockModal } from '@/components/vault';
import { useIsMobile } from '@/hooks/use-mobile';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
	buildOptimisticChatAttachments,
	type ChatAttachmentPreview,
	type ChatAssetSelectionTarget,
} from './utils/chat-attachments';

const isPhasicBlueprint = (blueprint?: BlueprintType | null): blueprint is PhasicBlueprint =>
	!!blueprint && 'implementationRoadmap' in blueprint;

export default function Chat() {
	const { chatId: urlChatId } = useParams();

	const [searchParams] = useSearchParams();
	const userQuery = searchParams.get('query');
	const urlProjectType = searchParams.get('projectType') || 'app';

	// Extract images from URL params if present
	const userImages = useMemo(() => {
		const imagesParam = searchParams.get('images');
		if (!imagesParam) return undefined;
		try {
			return JSON.parse(decodeURIComponent(imagesParam));
		} catch (error) {
			console.error('Failed to parse images from URL:', error);
			return undefined;
		}
	}, [searchParams]);

	// Load existing app data if chatId is provided
	const { app, loading: appLoading } = useApp(urlChatId);

	// If we have an existing app, use its data
	const displayQuery = app ? app.originalPrompt || app.title : userQuery || '';
	const appTitle = app?.title;

	// Manual refresh trigger for preview
	const [manualRefreshTrigger, setManualRefreshTrigger] = useState(0);
	const isMobile = useIsMobile();
	const [mobilePanel, setMobilePanel] = useState<'chat' | 'preview'>('chat');

	// Debug message utilities
	const addDebugMessage = useCallback(
		(
			type: DebugMessage['type'],
			message: string,
			details?: string,
			source?: string,
			messageType?: string,
			rawMessage?: unknown,
		) => {
			const debugMessage: DebugMessage = {
				id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
				timestamp: Date.now(),
				type,
				message,
				details,
				source,
				messageType,
				rawMessage,
			};

			setDebugMessages((prev) => [...prev, debugMessage]);
		},
		[],
	);

	const clearDebugMessages = useCallback(() => {
		setDebugMessages([]);
	}, []);

	const { state: vaultState, requestUnlock, clearUnlockRequest } = useVault();
	const handleVaultUnlockRequired = useCallback(
		(reason: string) => {
			requestUnlock(reason);
		},
		[requestUnlock],
	);

	const {
		messages,
		edit,
		bootstrapFiles,
		chatId,
		query,
		files,
		isGeneratingBlueprint,
		isBootstrapping,
		totalFiles,
		websocket,
		sendUserMessage,
		blueprint,
		previewUrl,
		clearEdit,
		projectStages,
		phaseTimeline,
		isThinking,
		// Deployment and generation control
		isGenerating,
		// Preview refresh control
		shouldRefreshPreview,
		// Preview deployment state
		isPreviewDeploying,
		// Issue tracking and debugging state
		runtimeErrorCount,
		staticIssueCount,
		isDebugging,
		// Behavior type from backend
		behaviorType,
		projectType,
		// Template metadata
		templateDetails,
	} = useChat({
		chatId: urlChatId,
		query: userQuery,
		images: userImages,
		projectType: urlProjectType as ProjectType,
		onDebugMessage: addDebugMessage,
		onVaultUnlockRequired: handleVaultUnlockRequired,
	});

	const navigate = useNavigate();

	const [activeFilePath, setActiveFilePath] = useState<string>();
	const [view, setView] = useState<'editor' | 'preview' | 'docs' | 'blueprint' | 'presentation' | 'assets'>(
		'preview',
	);
	const [selectedAssetTarget, setSelectedAssetTarget] = useState<ChatAssetSelectionTarget | null>(null);

	// Debug panel state
	const [debugMessages, setDebugMessages] = useState<DebugMessage[]>([]);

	const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

	type AgentWebSocket = {
		send: (data: string) => void;
		readyState: number;
		addEventListener: (type: 'open', listener: () => void) => void;
		removeEventListener: (type: 'open', listener: () => void) => void;
	};

	const WS_OPEN = 1;

	const sendVaultStatusToAgent = useCallback(
		(ws: AgentWebSocket) => {
			if (vaultState.status === 'unlocked') {
				ws.send(JSON.stringify({ type: 'vault_unlocked' }));
			} else if (vaultState.status === 'locked') {
				ws.send(JSON.stringify({ type: 'vault_locked' }));
			}
		},
		[vaultState.status],
	);

	useEffect(() => {
		if (!websocket) return;

		const ws = websocket as unknown as AgentWebSocket;
		const handleOpen = () => sendVaultStatusToAgent(ws);
		ws.addEventListener('open', handleOpen);

		if (ws.readyState === WS_OPEN) {
			sendVaultStatusToAgent(ws);
		}

		return () => {
			ws.removeEventListener('open', handleOpen);
		};
	}, [sendVaultStatusToAgent, websocket]);

	useEffect(() => {
		if (!websocket) return;
		const ws = websocket as unknown as AgentWebSocket;
		if (ws.readyState !== WS_OPEN) return;
		sendVaultStatusToAgent(ws);
	}, [sendVaultStatusToAgent, vaultState.status, websocket]);

	const hasSeenPreview = useRef(false);
	const prevMarkdownCountRef = useRef(0);
	const hasSwitchedFile = useRef(false);
	// const wasChatDisabled = useRef(true);
	// const hasShownWelcome = useRef(false);

	const editorRef = useRef<HTMLDivElement>(null);
	const previewRef = useRef<HTMLIFrameElement>(null);
	const messagesContainerRef = useRef<HTMLDivElement>(null);

	const [newMessage, setNewMessage] = useState('');

	const { images, addImages, removeImage, clearImages, isProcessing } = useImageUpload({
		mode: 'chat-media',
		onError: (error) => {
			console.error('Chat attachment error:', error);
		},
	});

	// Fake stream bootstrap files
	const { streamedFiles: streamedBootstrapFiles } =
		useFileContentStream(bootstrapFiles, {
			tps: 600,
			enabled: isBootstrapping,
		});

	// Merge streamed bootstrap files with generated files
	const allFiles = useMemo(() => {
		let result: FileType[];

		if (templateDetails?.allFiles) {
			const templateFiles = Object.entries(templateDetails.allFiles).map(
				([filePath, fileContents]) => ({
					filePath,
					fileContents,
				})
			);
			result = mergeFiles(templateFiles, files);
		} else {
			result = files;
		}

		// Use feature module's processFiles if available (e.g., for presentations to filter demo slides)
		const featureModule = featureRegistry.getModule(projectType);
		if (featureModule?.processFiles) {
			result = featureModule.processFiles(result, templateDetails);
		}

		// Only show src/ files in the editor — other files are template defaults the AI cannot modify
		result = result.filter(f => f.filePath.startsWith('src/'));

		return result;
	}, [files, templateDetails, projectType]);

	const handleFileClick = useCallback((file: FileType) => {
		logger.debug('handleFileClick()', file);
		clearEdit();
		setActiveFilePath(file.filePath);
		setView('editor');
		if (!hasSwitchedFile.current) {
			hasSwitchedFile.current = true;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleViewModeChange = useCallback((mode: 'preview' | 'editor' | 'docs' | 'blueprint' | 'presentation' | 'assets') => {
		setView(mode);
	}, []);

	const handleMessageAttachmentClick = useCallback((attachment: ChatAttachmentPreview) => {
		setSelectedAssetTarget({
			assetKey: attachment.assetKey,
			filename: attachment.filename,
			category: attachment.category,
			nonce: Date.now(),
		});
		setView('assets');
		hasSwitchedFile.current = true;
		if (isMobile) {
			setMobilePanel('preview');
		}
	}, [isMobile]);

	const handleResetConversation = useCallback(() => {
		if (!websocket) return;
		sendWebSocketMessage(websocket, 'clear_conversation');
		setIsResetDialogOpen(false);
	}, [websocket]);

	const generatingCount = useMemo(
		() =>
			files.reduce(
				(count, file) => (file.isGenerating ? count + 1 : count),
				0,
			),
		[files],
	);

	const codeGenState = useMemo(() => {
		return projectStages.find((stage) => stage.id === 'code')?.status;
	}, [projectStages]);

	const generatingFile = useMemo(() => {
		// code gen status should be active
		if (codeGenState === 'active') {
			for (let i = files.length - 1; i >= 0; i--) {
				if (files[i].isGenerating) return files[i];
			}
		}
		return undefined;
	}, [files, codeGenState]);

	const activeFile = useMemo(() => {
		if (!hasSwitchedFile.current && generatingFile) {
			return generatingFile;
		}
		if (!hasSwitchedFile.current && isBootstrapping) {
			return streamedBootstrapFiles.find(
				(file) => file.filePath === activeFilePath,
			);
		}
		return (
			files.find((file) => file.filePath === activeFilePath) ??
			streamedBootstrapFiles.find(
				(file) => file.filePath === activeFilePath,
			) ??
			// Fallback to allFiles for template files that were merged in
			allFiles.find((file) => file.filePath === activeFilePath)
		);
	}, [
		activeFilePath,
		generatingFile,
		files,
		streamedBootstrapFiles,
		isBootstrapping,
		allFiles,
	]);

	const isPhase1Complete = useMemo(() => {
		return phaseTimeline.length > 0 && phaseTimeline[0].status === 'completed';
	}, [phaseTimeline]);

	// Detect if agentic mode is showing static content (docs, markdown)
	const isStaticContent = useMemo(() => {
		if (behaviorType !== 'agentic' || files.length === 0) return false;
		return files.every(file => isDocumentationPath(file.filePath.toLowerCase()));
	}, [behaviorType, files]);

	// Detect content type (documentation detection - works in any projectType)
	const contentDetection = useMemo(() => {
		return detectContentType(files);
	}, [files]);

    const hasDocumentation = useMemo(() => {
        return Object.values(contentDetection.Contents).some(bundle => bundle.type === 'markdown');
    }, [contentDetection]);

	// Preview available based on projectType and content
	const previewAvailable = useMemo(() => {
		if (hasDocumentation || !!previewUrl) return true;
		return false;
	}, [hasDocumentation, previewUrl]);

	const showMainView = useMemo(() => {
		// For agentic mode: show preview panel when files exist or preview URL exists
		if (behaviorType === 'agentic') {
			const hasFiles = files.length > 0;
			const hasPreview = !!previewUrl;
			const result = hasFiles || hasPreview;
			return result;
		}
		// For phasic mode: keep existing logic
		const result = streamedBootstrapFiles.length > 0 || !!blueprint || files.length > 0;
		return result;
	}, [behaviorType, blueprint, files.length, previewUrl, streamedBootstrapFiles.length]);

	const [mainMessage, ...otherMessages] = useMemo(() => messages, [messages]);

	const { scrollToBottom } = useAutoScroll(messagesContainerRef, { behavior: 'smooth', watch: [messages] });

	const prevMessagesLengthRef = useRef(0);

	useEffect(() => {
		// Force scroll when a new message is appended (length increase)
		if (messages.length > prevMessagesLengthRef.current) {
			requestAnimationFrame(() => scrollToBottom());
		}
		prevMessagesLengthRef.current = messages.length;
	}, [messages.length, scrollToBottom]);

	useEffect(() => {
		if (hasSeenPreview.current) return;

		const markdownFiles = files.filter(isMarkdownFile);
		const isGeneratingMarkdown = markdownFiles.some(f => f.isGenerating);
		const newMarkdownAdded = markdownFiles.length > prevMarkdownCountRef.current;

		// Auto-switch to docs ONLY when NEW markdown is being generated
		if (hasDocumentation && newMarkdownAdded && isGeneratingMarkdown) {
			setView('docs');
			hasSeenPreview.current = true;
		} else if (isStaticContent && files.length > 0 && !hasDocumentation) {
			// For other static content (non-documentation), show preview view
			setView('preview');
			hasSeenPreview.current = true;
		} else if (previewUrl) {
			const isExistingChat = urlChatId !== 'new';
			const shouldSwitch =
				behaviorType === 'agentic' ||
				(behaviorType === 'phasic' && isPhase1Complete) ||
				(isExistingChat && behaviorType !== 'phasic');

			if (shouldSwitch) {
				setView('preview');
				hasSeenPreview.current = true;
			}
		}

		// Update ref for next comparison
		prevMarkdownCountRef.current = markdownFiles.length;
	}, [previewUrl, isPhase1Complete, isStaticContent, files, activeFilePath, behaviorType, hasDocumentation, projectType, urlChatId]);

	useEffect(() => {
		if (chatId) {
			navigate(`/chat/${chatId}`, {
				replace: true,
			});
		}
	}, [chatId, navigate]);

	useEffect(() => {
		if (!edit) return;
		if (files.some((file) => file.filePath === edit.filePath)) {
			setActiveFilePath(edit.filePath);
			setView('editor');
		}
	}, [edit, files]);

	useEffect(() => {
		if (
			isBootstrapping &&
			streamedBootstrapFiles.length > 0 &&
			!hasSwitchedFile.current
		) {
			setActiveFilePath(streamedBootstrapFiles.at(-1)!.filePath);
		} else if (
			view === 'editor' &&
			!activeFile &&
			files.length > 0 &&
			!hasSwitchedFile.current
		) {
			setActiveFilePath(files.at(-1)!.filePath);
		}
	}, [view, activeFile, files, isBootstrapping, streamedBootstrapFiles]);

	// Preserve active file when generation completes
	useEffect(() => {
		if (!generatingFile && activeFile && !hasSwitchedFile.current) {
			// Generation just ended, preserve the current active file
			setActiveFilePath(activeFile.filePath);
		}
	}, [generatingFile, activeFile]);

	useEffect(() => {
		if (view !== 'blueprint' && isGeneratingBlueprint) {
			setView('blueprint');
		} else if (
			!hasSwitchedFile.current &&
			view === 'blueprint' &&
			!isGeneratingBlueprint
		) {
			setView('preview');
		}
	}, [isGeneratingBlueprint, view]);
    
	const isRunning = useMemo(() => {
		return (
			isBootstrapping || isGeneratingBlueprint // || codeGenState === 'active'
		);
	}, [isBootstrapping, isGeneratingBlueprint]);

	// Check if chat input should be disabled (before blueprint completion, or during debugging)
	const isChatDisabled = useMemo(() => {
		const blueprintStage = projectStages.find(
			(stage) => stage.id === 'blueprint',
		);
		const blueprintNotCompleted = !blueprintStage || blueprintStage.status !== 'completed';

		return blueprintNotCompleted || isDebugging;
	}, [projectStages, isDebugging]);

	const chatFormRef = useRef<HTMLFormElement>(null);
	const { isDragging: isChatDragging, dragHandlers: chatDragHandlers } = useDragDrop({
		onFilesDropped: addImages,
		accept: [...SUPPORTED_CHAT_MEDIA_MIME_TYPES],
		disabled: isChatDisabled,
	});

	const onNewMessage = useCallback(
		(e: FormEvent) => {
			e.preventDefault();

			if (isChatDisabled || (!newMessage.trim() && images.length === 0)) {
				return;
			}

			const text = newMessage.trim();
			websocket?.send(
				JSON.stringify({
					type: 'user_suggestion',
					message: text,
					images: images.length > 0 ? images : undefined,
				}),
			);
			sendUserMessage(
				text || '(Attached media)',
				images.length > 0 ? buildOptimisticChatAttachments(images) : undefined,
			);
			setNewMessage('');
			// Clear images after sending
			if (images.length > 0) {
				clearImages();
			}
			// Ensure we scroll after sending our own message
			requestAnimationFrame(() => scrollToBottom());
		},
		[newMessage, websocket, sendUserMessage, isChatDisabled, scrollToBottom, images, clearImages],
	);

	const [progress, total] = useMemo((): [number, number] => {
		// Calculate phase progress instead of file progress
		const completedPhases = phaseTimeline.filter(p => p.status === 'completed').length;

		// Get predicted phase count from blueprint, fallback to current phase count
		const predictedPhaseCount = isPhasicBlueprint(blueprint)
			? blueprint.implementationRoadmap.length
			: 0;
		const totalPhases = Math.max(predictedPhaseCount, phaseTimeline.length, 1);

		return [completedPhases, totalPhases];
	}, [phaseTimeline, blueprint]);

	if (import.meta.env.DEV) {
		logger.debug({
			messages,
			files,
			blueprint,
			query,
			userQuery,
			chatId,
			previewUrl,
			generatingFile,
			activeFile,
			bootstrapFiles,
			streamedBootstrapFiles,
			isGeneratingBlueprint,
			view,
			totalFiles,
			generatingCount,
			isBootstrapping,
			activeFilePath,
			progress,
			total,
			isRunning,
			projectStages,
		});
	}

	return (
		<div className="size-full flex flex-col min-h-0 text-text-primary">
			<div className="flex-1 flex min-h-0 overflow-hidden justify-center">
				<motion.div
					layout="position"
					className={clsx(
						"flex-1 shrink-0 flex flex-col basis-0 max-w-lg relative z-10 h-full min-h-0",
						isMobile && mobilePanel !== 'chat' && 'hidden'
					)}
				>
					<div 
					className={clsx(
						'flex-1 overflow-y-auto min-h-0 chat-messages-scroll',
						isDebugging && 'animate-debug-pulse'
					)} 
					ref={messagesContainerRef}
				>
						<div className="pt-5 px-4 pb-4 text-sm flex flex-col gap-5">
							{appLoading ? (
								<div className="flex items-center gap-2 text-text-tertiary">
									<LoaderCircle className="size-4 animate-spin" />
									Loading app...
								</div>
							) : (
								<>
									{(appTitle || chatId) && (
								<div className="flex items-center justify-between mb-2">
									<div className="text-lg font-semibold">{appTitle}</div>
								</div>
							)}
									<UserMessage
										message={query ?? displayQuery}
									/>
								</>
							)}

							{mainMessage && (
							<div className="relative">
								<AIMessage
									message={mainMessage.content}
									isThinking={mainMessage.ui?.isThinking}
									toolEvents={mainMessage.ui?.toolEvents}
								/>
								{chatId && (
									<div className="absolute right-1 top-1">
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button
													variant="ghost"
													size="icon"
													className="hover:bg-bg-3/80 cursor-pointer"
												>
													<MoreHorizontal className="h-4 w-4" />
													<span className="sr-only">Chat actions</span>
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent align="end" className="w-56">
												<DropdownMenuItem
														onClick={(e) => {
															e.preventDefault();
															setIsResetDialogOpen(true);
														}}
												>
													<RotateCcw className="h-4 w-4 mr-2" />
													Reset conversation
												</DropdownMenuItem>
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								)}
							</div>
						)}

							{otherMessages
								.filter(message => message.role === 'assistant' && message.ui?.isThinking)
								.map((message) => (
									<div key={message.conversationId} className="mb-4">
										<AIMessage
											message={message.content}
											isThinking={true}
											toolEvents={message.ui?.toolEvents}
										/>
									</div>
								))}

							{isThinking && !otherMessages.some(m => m.ui?.isThinking) && (
								<div className="mb-4">
									<AIMessage
										message="Planning next phase..."
										isThinking={true}
									/>
								</div>
							)}

							{/* Only show PhaseTimeline for phasic mode */}
							{behaviorType !== 'agentic' && (
								<PhaseTimeline
									projectStages={projectStages}
									phaseTimeline={phaseTimeline}
									files={files}
									view={view}
									isThinkingNext={isThinking}
									isPreviewDeploying={isPreviewDeploying}
									progress={progress}
									total={total}
									parentScrollRef={messagesContainerRef}
									onViewChange={(viewMode) => {
										setView(viewMode);
										hasSwitchedFile.current = true;
									}}
									runtimeErrorCount={runtimeErrorCount}
									staticIssueCount={staticIssueCount}
									isDebugging={isDebugging}
									isGenerating={isGenerating}
									isThinking={isThinking}
								/>
							)}

	
							{otherMessages
								.filter(message => !message.ui?.isThinking)
								.map((message) => {
									if (message.role === 'assistant') {
										return (
											<AIMessage
												key={message.conversationId}
												message={message.content}
												isThinking={message.ui?.isThinking}
												toolEvents={message.ui?.toolEvents}
											/>
										);
									}
									return (
										<UserMessage
											key={message.conversationId}
											message={message.content}
											attachments={message.attachments}
											onAttachmentClick={handleMessageAttachmentClick}
										/>
									);
								})}

						</div>
					</div>


				<ChatInput
					newMessage={newMessage}
					onMessageChange={setNewMessage}
					onSubmit={onNewMessage}
					images={images}
					onAddImages={addImages}
					onRemoveImage={removeImage}
					isProcessing={isProcessing}
					isChatDragging={isChatDragging}
					chatDragHandlers={chatDragHandlers}
					isChatDisabled={isChatDisabled}
					isRunning={isRunning}
					isGenerating={isGenerating}
					isGeneratingBlueprint={isGeneratingBlueprint}
					isDebugging={isDebugging}
					websocket={websocket}
					chatFormRef={chatFormRef}
				/>
				</motion.div>

				<AnimatePresence mode="wait">
					{showMainView && (!isMobile || mobilePanel === 'preview') && (
						<motion.div
							key="main-content-panel"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className={clsx(
								"flex-1 flex shrink-0 basis-0 z-30 min-h-0",
								isMobile ? "p-0" : "p-4 pl-0 ml-2"
							)}
						>
							<MainContentPanel
								view={view}
								onViewChange={handleViewModeChange}
								hasDocumentation={hasDocumentation}
								contentDetection={contentDetection}
								projectType={projectType}
								previewUrl={previewUrl}
								previewAvailable={previewAvailable}
								shouldRefreshPreview={shouldRefreshPreview}
								manualRefreshTrigger={manualRefreshTrigger}
								onManualRefresh={() => setManualRefreshTrigger(Date.now())}
								blueprint={blueprint}
								activeFile={activeFile}
								allFiles={allFiles}
								edit={edit}
								onFileClick={handleFileClick}
								isGenerating={isGenerating}
								isGeneratingBlueprint={isGeneratingBlueprint}
								behaviorType={behaviorType}
								websocket={websocket}
								previewRef={previewRef}
								editorRef={editorRef}
								templateDetails={templateDetails}
								agentId={chatId}
								selectedAssetTarget={selectedAssetTarget}
							/>
						</motion.div>
					)}
				</AnimatePresence>
			</div>

			{isMobile && showMainView && (
				<div className="flex items-center gap-1 py-1.5 px-2 bg-bg-3 border-t border-border-primary">
					<SidebarTrigger className="h-8 w-8 shrink-0 text-text-primary bg-bg-3 rounded-lg border-2 border-[var(--neo-border-color)] shadow-[2px_2px_0px_0px_var(--neo-border-color)]" />
					<div className="flex-1 flex items-center justify-center gap-1">
						<button
							onClick={() => setMobilePanel('chat')}
							className={clsx(
								'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors',
								mobilePanel === 'chat'
									? 'bg-text-primary text-bg-1'
									: 'text-text-tertiary hover:text-text-primary'
							)}
						>
							<MessageSquare className="h-3.5 w-3.5" />
							Chat
						</button>
						<button
							onClick={() => setMobilePanel('preview')}
							className={clsx(
								'flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium transition-colors',
								mobilePanel === 'preview'
									? 'bg-text-primary text-bg-1'
									: 'text-text-tertiary hover:text-text-primary'
							)}
						>
							<Eye className="h-3.5 w-3.5" />
							Preview
						</button>
					</div>
				</div>
			)}

			<ChatModals
				debugMessages={debugMessages}
				chatId={chatId}
				onClearDebugMessages={clearDebugMessages}
				isResetDialogOpen={isResetDialogOpen}
				onResetDialogChange={setIsResetDialogOpen}
				onResetConversation={handleResetConversation}
			/>

			<VaultUnlockModal
				open={vaultState.unlockRequested && vaultState.status === 'locked'}
				onOpenChange={(open) => {
					if (!open) clearUnlockRequest();
				}}
				reason={vaultState.unlockReason ?? undefined}
			/>
		</div>
	);
}
