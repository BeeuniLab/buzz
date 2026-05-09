import type { WebSocket } from 'partysocket';
import type { WebSocketMessage, BlueprintType, ConversationMessage, AgentState, PhasicState, BehaviorType, ProjectType, TemplateDetails } from '@/api-types';
import { deduplicateMessages, isAssistantMessageDuplicate } from './deduplicate-messages';
import { logger } from '@/utils/logger';
import { getFileType } from '@/utils/string';
import { getPreviewUrl } from '@/lib/utils';
import {
    setFileGenerating,
    appendFileChunk,
    setFileCompleted,
    setAllFilesCompleted,
    updatePhaseFileStatus,
} from './file-state-helpers';
import {
    createAIMessage,
    handleRateLimitError,
    handleStreamingMessage,
    appendToolEvent,
    type ChatMessage,
} from './message-helpers';
import { buildInitialChatAttachments, parseUserMessageForDisplay } from './chat-attachments';
import { completeStages, type ProjectStage } from './project-stage-helpers';
import { sendWebSocketMessage } from './websocket-helpers';
import type { PhaseTimelineItem } from '../hooks/use-chat';
import type { FileType } from '@/api-types';
import { toast } from 'sonner';
import { createRepairingJSONParser } from '@/utils/ndjson-parser/ndjson-parser';
import { appEvents } from '@/lib/app-events';
import { getTaskBusyWarningTitle, isTaskBusyWarning } from '@/lib/task-warning';

const ACTIVE_APP_TASK_STALE_MS = 30 * 60 * 1000;
const GENERATION_WORKFLOW_KINDS = new Set(['create_project', 'generate_all', 'resume_generation', 'user_input']);

const isGenerationWorkflow = (workflow: AgentState['activeWorkflow']): boolean =>
	Boolean(workflow && GENERATION_WORKFLOW_KINDS.has(workflow.kind));

const isDeployProjectWorkflow = (workflow: AgentState['activeWorkflow']): boolean =>
	workflow?.kind === 'deploy_project';

const isDeployPreviewWorkflow = (workflow: AgentState['activeWorkflow']): boolean =>
	workflow?.kind === 'deploy_preview';

const isPhasicState = (state: AgentState): state is PhasicState => {
	const record = state as unknown as Record<string, unknown>;
	const behaviorType = record.behaviorType;
	if (behaviorType === 'phasic') return true;
	if (behaviorType === undefined || behaviorType === null) {
		return Array.isArray(record.generatedPhases);
	}
	return false;
};

const getFreshActiveTask = (state: AgentState) => {
	const startedAt = state.activeAppTask?.startedAt;
	const isFresh =
		!state.lastUserStopAt &&
		typeof startedAt === 'number' &&
		Date.now() - startedAt < ACTIVE_APP_TASK_STALE_MS;

	return isFresh ? state.activeAppTask : undefined;
};

const getFreshActiveWorkflow = (state: AgentState) => {
	const workflow = state.activeWorkflow;
	const updatedAt = workflow?.updatedAt ?? workflow?.startedAt;
	const isFresh =
		!state.lastUserStopAt &&
		workflow?.status !== 'failed' &&
		typeof updatedAt === 'number' &&
		Date.now() - updatedAt < ACTIVE_APP_TASK_STALE_MS;

	return isFresh ? workflow : undefined;
};

const hasGeneratedFiles = (state: AgentState): boolean =>
	Object.keys(state.generatedFilesMap ?? {}).length > 0;

const hasPlayableChangesSinceLastDeployment = (state: AgentState): boolean => {
	if (!hasGeneratedFiles(state)) return false;

	const currentRevision = state.generatedFilesRevision;
	const deployedRevision = state.lastPlayableDeploymentRevision;

	if (typeof currentRevision === 'number' && typeof deployedRevision === 'number') {
		return currentRevision > deployedRevision;
	}

	return deployedRevision === undefined;
};

const hasCompletedPlayable = (state: AgentState): boolean =>
	Boolean(state.mvpGenerated && hasGeneratedFiles(state) && (state.pendingUserInputs?.length ?? 0) === 0);

const hasMeaningfulBlueprint = (state: AgentState): boolean =>
	Boolean(state.blueprint && Object.keys(state.blueprint).length > 0);

const shouldSkipBlueprintStage = (state: AgentState): boolean =>
	Boolean(
		state.shouldBeGenerating ||
		state.mvpGenerated ||
		hasGeneratedFiles(state) ||
		state.activeWorkflow ||
		getFreshActiveWorkflow(state),
	);

const INTERNAL_GENERATOR_TOKEN = ['co', 'dex'].join('');
const INTERNAL_GENERATOR_ENV_PREFIX = ['CO', 'DEX'].join('');
const INTERNAL_GENERATOR_TOKEN_RE = new RegExp(`\\b${INTERNAL_GENERATOR_TOKEN}\\b`, 'gi');
const INTERNAL_GENERATOR_ENV_RE = new RegExp(`\\b${INTERNAL_GENERATOR_ENV_PREFIX}_[A-Z0-9_]+\\b`, 'g');

const redactInternalGeneratorName = (message: string): string =>
	message
		.replace(INTERNAL_GENERATOR_ENV_RE, 'LLM setting')
		.replace(INTERNAL_GENERATOR_TOKEN_RE, 'background generator');

const BACKGROUND_UPDATE_MESSAGE_PREFIX = 'background-update-';
const BACKGROUND_UPDATE_RUNNING_MESSAGE = 'Working on your project...';
const BACKGROUND_UPDATE_RESTORED_MESSAGE = 'Still working on your project...';
const BACKGROUND_UPDATE_COMPLETE_MESSAGE = 'Project is ready.';
const BACKGROUND_UPDATE_FAILED_MESSAGE = 'The project agent ran into a problem. Please try again.';
const LEGACY_GENERIC_BUG_PROMPT = 'there might be some bugs in the app. do you want me to try to fix them?';
const LEGACY_GENERIC_BUG_PROMPT_RE = /^there might be some bugs in the app\.?\s+do you want me to try to fix them\??$/i;
const RETRY_LAST_FAILED_WORKFLOW_ACTION: ChatMessage['action'] = {
	type: 'retry_last_failed_workflow',
	label: 'Retry',
};

const normalizeAssistantContent = (content: string | undefined): string =>
	(content ?? '').replace(/\s+/g, ' ').trim();

const shouldHideLegacyAssistantPrompt = (content: string | undefined): boolean =>
	LEGACY_GENERIC_BUG_PROMPT_RE.test(normalizeAssistantContent(content));

const shouldHoldLegacyAssistantStream = (content: string | undefined): boolean => {
	const normalized = normalizeAssistantContent(content).toLowerCase();
	return normalized.length > 0 && LEGACY_GENERIC_BUG_PROMPT.startsWith(normalized);
};

const filterHiddenAssistantPrompts = (messages: readonly ChatMessage[]): ChatMessage[] =>
	messages.filter((message) => message.role !== 'assistant' || !shouldHideLegacyAssistantPrompt(message.content));

const isBackgroundUpdateMessage = (message: ChatMessage): boolean =>
	message.role === 'assistant' &&
	message.conversationId.startsWith(BACKGROUND_UPDATE_MESSAGE_PREFIX);

const isActiveBackgroundUpdateMessage = (message: ChatMessage): boolean =>
	isBackgroundUpdateMessage(message) &&
	message.ui?.isThinking === true;

const appendBackgroundUpdateMessage = (
	messages: ChatMessage[],
	content = BACKGROUND_UPDATE_RUNNING_MESSAGE,
): ChatMessage[] => {
	if (messages.some(isActiveBackgroundUpdateMessage)) return messages;
	return [
		...messages,
		createAIMessage(`${BACKGROUND_UPDATE_MESSAGE_PREFIX}${Date.now()}`, content, true),
	];
};

const finishBackgroundUpdateMessage = (
	messages: ChatMessage[],
	content: string,
): ChatMessage[] => {
	let didUpdate = false;
	const next = [...messages];

	for (let index = next.length - 1; index >= 0; index -= 1) {
		const message = next[index];
		if (!isActiveBackgroundUpdateMessage(message)) continue;

		next[index] = {
			...message,
			content,
			ui: {
				...message.ui,
				isThinking: false,
			},
		};
		didUpdate = true;
		break;
	}

	return didUpdate ? next : messages;
};

const replaceLatestBackgroundUpdateMessage = (
	messages: ChatMessage[],
	content: string,
): ChatMessage[] => {
	const next = [...messages];
	for (let index = next.length - 1; index >= 0; index -= 1) {
		const message = next[index];
		if (!isBackgroundUpdateMessage(message)) continue;

		next[index] = {
			...message,
			content,
			ui: {
				...message.ui,
				isThinking: false,
			},
		};
		return next;
	}
	return messages;
};

const removeActiveBackgroundUpdateMessage = (messages: ChatMessage[]): ChatMessage[] => {
	let index = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (isActiveBackgroundUpdateMessage(messages[i])) {
			index = i;
			break;
		}
	}
	if (index < 0) return messages;

	const next = [...messages];
	next.splice(index, 1);
	return next;
};

const finishOrAppendGenerationCompleteMessage = (messages: ChatMessage[]): ChatMessage[] => {
	const finished = finishBackgroundUpdateMessage(messages, BACKGROUND_UPDATE_COMPLETE_MESSAGE);
	if (finished !== messages) return finished;
	if (isAssistantMessageDuplicate(messages, BACKGROUND_UPDATE_COMPLETE_MESSAGE)) return messages;
	return [
		...messages,
		createAIMessage(`generation-complete-${Date.now()}`, BACKGROUND_UPDATE_COMPLETE_MESSAGE),
	];
};

const isRetryableProjectFailureMessage = (content: string): boolean =>
	content.startsWith('The project agent ');

const attachRetryActionToLatestFailure = (
	messages: ChatMessage[],
	agentState?: AgentState,
): ChatMessage[] => {
	if (!agentState?.lastFailedWorkflow || getFreshActiveWorkflow(agentState)) {
		return messages;
	}

	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (
			message.role === 'assistant' &&
			(message.conversationId.endsWith('-failed') || isRetryableProjectFailureMessage(message.content))
		) {
			return messages.map((item, itemIndex) => itemIndex === index
				? { ...item, action: RETRY_LAST_FAILED_WORKFLOW_ACTION }
				: item);
		}
	}

	return [
		...messages,
		createAIMessage('retry-available', BACKGROUND_UPDATE_FAILED_MESSAGE, false, RETRY_LAST_FAILED_WORKFLOW_ACTION),
	];
};

const summarizeErrorForChat = (error: string | undefined): string => {
	const fallback = 'Something went wrong while updating the project.';
	if (!error) return fallback;

	if (!error.includes('{"type":')) {
		return redactInternalGeneratorName(error);
	}

	const events: Array<{ message?: string; error?: { message?: string } }> = [];
	let start = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = 0; index < error.length; index += 1) {
		const char = error[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === '\\') {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === '{') {
			if (depth === 0) start = index;
			depth += 1;
			continue;
		}
		if (char === '}' && depth > 0) {
			depth -= 1;
			if (depth === 0 && start >= 0) {
				const chunk = error.slice(start, index + 1);
				start = -1;
				if (!chunk.includes('"type"')) continue;
				try {
					events.push(JSON.parse(chunk));
				} catch {
					// Keep chat clean even if debug output contains partial JSON.
				}
			}
		}
	}

	const messages = events
		.map((event) => event.error?.message || event.message || null)
		.filter((message): message is string => Boolean(message));

	const summary = messages[messages.length - 1] || fallback;
	const safeSummary = redactInternalGeneratorName(summary);
	return safeSummary.length > 500 ? `${safeSummary.slice(0, 500)}...` : safeSummary;
};

const isStateActivelyGenerating = (state: AgentState): boolean => {
	const freshActiveTask = getFreshActiveTask(state);
	const freshActiveWorkflow = getFreshActiveWorkflow(state);
	return !state.lastUserStopAt && (
		(state.shouldBeGenerating === true && !hasCompletedPlayable(state)) ||
		Boolean(freshActiveTask) ||
		isGenerationWorkflow(freshActiveWorkflow) ||
		isDeployProjectWorkflow(freshActiveWorkflow) ||
		isDeployPreviewWorkflow(freshActiveWorkflow)
	);
};

const shouldRestoreCodeGeneration = (state: AgentState): boolean => {
	const freshActiveTask = getFreshActiveTask(state);
	const freshActiveWorkflow = getFreshActiveWorkflow(state);
	return !state.lastUserStopAt && (
		(state.shouldBeGenerating === true && !hasCompletedPlayable(state)) ||
		freshActiveTask?.type === 'generation' ||
		isGenerationWorkflow(freshActiveWorkflow)
	);
};

const shouldRequestGenerationResume = (state: AgentState): boolean =>
	!getFreshActiveWorkflow(state) &&
	state.shouldBeGenerating === true &&
	!hasCompletedPlayable(state);

const getRestoredAppStatus = (state: AgentState): 'generating' | 'completed' =>
	isStateActivelyGenerating(state) ? 'generating' : 'completed';

const isRestoredBuildPaused = (state: AgentState): boolean =>
	!state.lastFailedWorkflow && !isStateActivelyGenerating(state) && !state.mvpGenerated;

export interface HandleMessageDeps {
    // State setters
    setFiles: React.Dispatch<React.SetStateAction<FileType[]>>;
    setPhaseTimeline: React.Dispatch<React.SetStateAction<PhaseTimelineItem[]>>;
    setProjectStages: React.Dispatch<React.SetStateAction<any[]>>;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setBlueprint: React.Dispatch<React.SetStateAction<BlueprintType | undefined>>;
    setQuery: React.Dispatch<React.SetStateAction<string | undefined>>;
    setPreviewUrl: React.Dispatch<React.SetStateAction<string | undefined>>;
    setTotalFiles: React.Dispatch<React.SetStateAction<number | undefined>>;
    setIsRedeployReady: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPreviewDeploying: React.Dispatch<React.SetStateAction<boolean>>;
    setIsGeneratingBlueprint: React.Dispatch<React.SetStateAction<boolean>>;
    setIsThinking: React.Dispatch<React.SetStateAction<boolean>>;
    setIsInitialStateRestored: React.Dispatch<React.SetStateAction<boolean>>;
    setShouldRefreshPreview: React.Dispatch<React.SetStateAction<boolean>>;
    setIsDeploying: React.Dispatch<React.SetStateAction<boolean>>;
    setCloudflareDeploymentUrl: React.Dispatch<React.SetStateAction<string>>;
    setDeploymentError: React.Dispatch<React.SetStateAction<string | undefined>>;
    setInitialPromptAttachments: React.Dispatch<React.SetStateAction<import('./chat-attachments').ChatAttachmentPreview[]>>;
    setIsGenerationPaused: React.Dispatch<React.SetStateAction<boolean>>;
    setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
    setIsConversationProcessing: React.Dispatch<React.SetStateAction<boolean>>;
    setIsPhaseProgressActive: React.Dispatch<React.SetStateAction<boolean>>;
    setRuntimeErrorCount: React.Dispatch<React.SetStateAction<number>>;
    setStaticIssueCount: React.Dispatch<React.SetStateAction<number>>;
    setIsDebugging: React.Dispatch<React.SetStateAction<boolean>>;
    setBehaviorType: React.Dispatch<React.SetStateAction<BehaviorType>>;
    setInternalProjectType: React.Dispatch<React.SetStateAction<ProjectType>>;
    setTemplateDetails: React.Dispatch<React.SetStateAction<TemplateDetails | null>>;
    onPresentationFileEvent?: (event: { type: 'file_generating' | 'file_chunk' | 'file_generated'; path: string; chunk?: string; contents?: string }) => void;
    clearDeploymentTimeout?: () => void;

    // Current state
    isInitialStateRestored: boolean;
    blueprint: BlueprintType | undefined;
    query: string | undefined;
    bootstrapFiles: FileType[];
    files: FileType[];
    phaseTimeline: PhaseTimelineItem[];
    previewUrl: string | undefined;
    projectStages: ProjectStage[];
    isGenerating: boolean;
    urlChatId: string | undefined;
    behaviorType: BehaviorType;
    
    // Functions
    updateStage: (stageId: ProjectStage['id'], updates: Partial<Omit<ProjectStage, 'id'>>) => void;
    sendMessage: (message: ConversationMessage) => void;
    loadBootstrapFiles: (files: FileType[]) => void;
    onDebugMessage?: (
        type: 'error' | 'warning' | 'info' | 'websocket',
        message: string,
        details?: string,
        source?: string,
        messageType?: string,
        rawMessage?: unknown
    ) => void;
    onVaultUnlockRequired?: (reason: string) => void;
}

function preserveExistingUserAttachments(
    restoredMessages: ChatMessage[],
    existingMessages: ChatMessage[],
): ChatMessage[] {
    const existingAttachmentBuckets = new Map<string, ChatMessage[]>();

    for (const message of existingMessages) {
        if (message.role !== 'user' || !message.attachments || message.attachments.length === 0) continue;

        const bucket = existingAttachmentBuckets.get(message.content) ?? [];
        bucket.push(message);
        existingAttachmentBuckets.set(message.content, bucket);
    }

    return restoredMessages.map((message) => {
        if (message.role !== 'user' || (message.attachments && message.attachments.length > 0)) {
            return message;
        }

        const bucket = existingAttachmentBuckets.get(message.content);
        const existingMatch = bucket?.shift();

        if (!existingMatch?.attachments || existingMatch.attachments.length === 0) {
            return message;
        }

        return {
            ...message,
            attachments: existingMatch.attachments,
        };
    });
}

export function createWebSocketMessageHandler(deps: HandleMessageDeps) {
    const extractTextContent = (content: ConversationMessage['content']): string => {
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .map(c => (c && 'type' in c && c.type === 'text') ? c.text : '')
                .join(' ')
                .trim();
        }
        return '';
    };

    // Blueprint chunk parser (maintained across chunks)
    let blueprintParser: ReturnType<typeof createRepairingJSONParser> | null = null;

    return (websocket: WebSocket, message: WebSocketMessage) => {
        const {
            setFiles,
            setPhaseTimeline,
            setProjectStages,
            setMessages,
            setBlueprint,
            setQuery,
            setPreviewUrl,
            setTotalFiles,
            setIsRedeployReady,
            setIsPreviewDeploying,
            setIsGeneratingBlueprint,
            setIsThinking,
            setIsInitialStateRestored,
            setShouldRefreshPreview,
            setIsDeploying,
            setCloudflareDeploymentUrl,
            setDeploymentError,
            setInitialPromptAttachments,
            setIsGenerationPaused,
            setIsGenerating,
            setIsConversationProcessing,
            setIsPhaseProgressActive,
            setIsDebugging,
            setBehaviorType,
            setInternalProjectType,
            setTemplateDetails,
            isInitialStateRestored,
            blueprint,
            query,
            bootstrapFiles,
            files,
            phaseTimeline,
            previewUrl,
            projectStages,
            isGenerating,
            urlChatId,
            behaviorType,
            updateStage,
            sendMessage,
            loadBootstrapFiles,
            onDebugMessage,
            clearDeploymentTimeout,
        } = deps;

        // Log messages except for frequent ones
        if (message.type !== 'file_chunk_generated' && message.type !== 'cf_agent_state' && message.type.length <= 50) {
            logger.info('received message', message.type, message);
            onDebugMessage?.('websocket', 
                `${message.type}`,
                JSON.stringify(message, null, 2),
                'WebSocket',
                message.type,
                message
            );
        }
        
        switch (message.type) {
            case 'conversation_cleared': {
                // Reset chat messages to a subtle tool-event entry indicating success
                setMessages(() => appendToolEvent([], 'conversation_cleared', {
                    name: message.message || 'conversation reset',
                    status: 'success'
                }));
                break;
            }
            case 'agent_connected': {
                const { state, templateDetails, previewUrl } = message;
                if (!isInitialStateRestored) {
                    logger.debug('📥 Performing initial state restoration');

                    if (urlChatId && urlChatId !== 'new') {
                        appEvents.emitAppUpdated(urlChatId, {
                            status: getRestoredAppStatus(state),
                        });
                    }

                    setIsGenerationPaused(isRestoredBuildPaused(state));

                    const restoredBehaviorType = state.behaviorType ?? 'phasic';
                    if (restoredBehaviorType !== behaviorType) {
                        setBehaviorType(restoredBehaviorType);
                        logger.debug('🔄 Restored behaviorType from backend:', restoredBehaviorType);
                    }

                    const restoredProjectType = state.projectType ?? 'app';
                    if (restoredProjectType) {
                        setInternalProjectType(restoredProjectType);
                        logger.debug('🔄 Restored projectType from backend:', restoredProjectType);
                    }

                    if (hasMeaningfulBlueprint(state) && !blueprint) {
                        setBlueprint(state.blueprint);
                        updateStage('blueprint', { status: 'completed' });
                    } else if (shouldSkipBlueprintStage(state)) {
                        updateStage('blueprint', { status: 'completed' });
                    }

                    if (state.query && !query) {
                        setQuery(state.query);
                    }

                    const initialUserAttachments = state.initialUserAttachments ?? [];
                    if (initialUserAttachments.length > 0) {
                        const fallbackAgentId = state.metadata?.agentId
                            || (urlChatId && urlChatId !== 'new' ? urlChatId : undefined);
                        setInitialPromptAttachments(
                            buildInitialChatAttachments(initialUserAttachments, fallbackAgentId),
                        );
                    }

                    if (previewUrl) {
                        setPreviewUrl(previewUrl);
                    }

                    if (templateDetails) {
                        // Store template details for manifest parsing and validation
                        setTemplateDetails(templateDetails);
                        logger.debug('📥 Stored template details:', {
                            renderMode: templateDetails.renderMode,
                            slideDirectory: templateDetails.slideDirectory,
                            fileCount: Object.keys(templateDetails.allFiles || {}).length,
                        });

                        if (templateDetails.allFiles && bootstrapFiles.length === 0) {
                            const importantFilesSet = new Set(templateDetails.importantFiles);
                            const files = Object.entries(templateDetails.allFiles).map(([filePath, fileContents]) => ({
                                filePath,
                                fileContents,
                            })).filter((file) => importantFilesSet.has(file.filePath));
                            logger.debug('📥 Restoring bootstrap files:', files);
                            loadBootstrapFiles(files);
                        }
                    }

                    if (state.generatedFilesMap && files.length === 0) {
                        setFiles(
                            Object.values(state.generatedFilesMap).map((file: { filePath: string; fileContents: string }) => ({
                                filePath: file.filePath,
                                fileContents: file.fileContents,
                                isGenerating: false,
                                needsFixing: false,
                                hasErrors: false,
                                language: getFileType(file.filePath),
                            })),
                        );
                    }

                    if (isPhasicState(state) && state.generatedPhases.length > 0 && phaseTimeline.length === 0) {
                        logger.debug('📋 Restoring phase timeline:', state.generatedPhases);
                        const isActivelyGenerating = isStateActivelyGenerating(state);
                        const wasExplicitlyStopped = Boolean(state.lastUserStopAt);
                        
                        const timeline = state.generatedPhases.map((phase, index: number) => {
                            // Determine phase status:
                            // - completed if explicitly marked complete
                            // - cancelled only when the user explicitly stopped the task
                            // - generating if incomplete and actively generating
                            // - error if incomplete and no active task is present
                            const phaseStatus = phase.completed 
                                ? 'completed' as const 
                                : wasExplicitlyStopped
                                    ? 'cancelled' as const 
                                    : isActivelyGenerating
                                        ? 'generating' as const
                                        : 'error' as const;
                            
                            return {
                                id: `phase-${index}`,
                                name: phase.name,
                                description: phase.description,
                                status: phaseStatus,
                                files: phase.files.map(filesConcept => {
                                    const file = state.generatedFilesMap?.[filesConcept.path];
                                    // File status:
                                    // - completed if it exists in generated files
                                    // - cancelled if missing and not actively generating (interrupted)
                                    // - generating if missing and actively generating
                                    const fileStatus = file 
                                        ? 'completed' as const 
                                        : wasExplicitlyStopped
                                            ? 'cancelled' as const 
                                            : isActivelyGenerating
                                                ? 'generating' as const
                                                : 'error' as const;
                                    return {
                                        path: filesConcept.path,
                                        purpose: filesConcept.purpose,
                                        status: fileStatus,
                                        contents: file?.fileContents
                                    };
                                }),
                                timestamp: Date.now(),
                            };
                        });
                        setPhaseTimeline(timeline);
                    }
                    
                    updateStage('bootstrap', { status: 'completed' });

                    if (hasMeaningfulBlueprint(state) || shouldSkipBlueprintStage(state)) {
                        setIsGeneratingBlueprint(false);
                        updateStage('blueprint', { status: 'completed' });
                    }
                    
                    if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0) {
                        updateStage('code', { status: 'completed' });
                        setIsRedeployReady(hasPlayableChangesSinceLastDeployment(state));
                        if (urlChatId !== 'new' && !getFreshActiveWorkflow(state)) {
                            logger.debug('🚀 Requesting preview deployment for existing chat with files');
                            sendWebSocketMessage(websocket, 'preview');
                        }
                    }

                    const freshActiveWorkflow = getFreshActiveWorkflow(state);
                    if (isDeployProjectWorkflow(freshActiveWorkflow)) {
                        setIsDeploying(true);
                        setDeploymentError('');
                    }
                    if (isDeployPreviewWorkflow(freshActiveWorkflow)) {
                        setIsPreviewDeploying(true);
                    }

                    // Display queued user messages from state
                    const queuedInputs = state.pendingUserInputs || [];
                    if (queuedInputs.length > 0) {
                        logger.debug('📋 Restoring queued user messages:', queuedInputs);
                        const queuedMessages: ChatMessage[] = queuedInputs.map((msg, idx) => ({
                            role: 'user',
                            content: msg,
                            conversationId: `queued-${idx}`,
                            status: 'queued' as const,
                            queuePosition: idx + 1
                        }));
                        setMessages(prev => [...prev, ...queuedMessages]);
                    }

                    setIsInitialStateRestored(true);
                    
                    if (shouldRestoreCodeGeneration(state) && !isGenerating) {
                        logger.debug('🔄 Reconnected with active generation intent, restoring generation UI');
                        setIsGenerating(true); 
                        updateStage('code', { status: 'active' });
                        const activeWorkflow = getFreshActiveWorkflow(state);
                        if (activeWorkflow?.kind === 'user_input') {
                            setIsConversationProcessing(true);
                            setMessages(prev => appendBackgroundUpdateMessage(prev, BACKGROUND_UPDATE_RESTORED_MESSAGE));
                        }
                        if (shouldRequestGenerationResume(state)) {
                            sendWebSocketMessage(websocket, 'generate_all');
                        }
	                    }
	                }
                break;
            }
            case 'template_updated': {
                const { templateDetails } = message;
                // Update stored template details
                setTemplateDetails(templateDetails);
                logger.debug('📥 Template details updated:', {
                    renderMode: templateDetails.renderMode,
                    slideDirectory: templateDetails.slideDirectory,
                    fileCount: Object.keys(templateDetails.allFiles || {}).length,
                });

                if (templateDetails.allFiles && bootstrapFiles.length === 0) {
                    const importantFilesSet = new Set(templateDetails.importantFiles);
                    const files = Object.entries(templateDetails.allFiles).map(([filePath, fileContents]) => ({
                        filePath,
                        fileContents,
                    })).filter((file) => importantFilesSet.has(file.filePath));
                    logger.debug('📥 Restoring bootstrap files:', files);
                    loadBootstrapFiles(files);
                }
                break;
            }
            case 'cf_agent_state': {
                const { state } = message;
                logger.debug('🔄 Agent state update received:', state);
                
                // Sync projectType from backend if it changed
                if (state.projectType) {
                    setInternalProjectType(state.projectType);
                }

                if (hasPlayableChangesSinceLastDeployment(state)) {
                    setIsRedeployReady(true);
                }

                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, {
                        status: getRestoredAppStatus(state),
                    });
                }

                setIsGenerationPaused(isRestoredBuildPaused(state));

                if (hasMeaningfulBlueprint(state) || shouldSkipBlueprintStage(state)) {
                    setIsGeneratingBlueprint(false);
                    updateStage('bootstrap', { status: 'completed' });
                    updateStage('blueprint', { status: 'completed' });
                }

                if (shouldRestoreCodeGeneration(state) && !isGenerating) {
                    logger.debug('🔄 Active generation intent detected, updating UI to active state');
                    updateStage('code', { status: 'active' });
                } else if (!isStateActivelyGenerating(state)) {
                    const codeStage = projectStages.find((stage) => stage.id === 'code');
                    if (codeStage?.status === 'active' && !isGenerating) {
                        if (state.generatedFilesMap && Object.keys(state.generatedFilesMap).length > 0) {
                            updateStage('code', { status: 'completed' });

                            if (!previewUrl && !getFreshActiveWorkflow(state)) {
                                logger.debug('🚀 Generated files exist but no preview URL - auto-deploying preview');
                                sendWebSocketMessage(websocket, 'preview');
                            }
                        }
                    }
                }

                const freshActiveWorkflow = getFreshActiveWorkflow(state);
                if (isGenerationWorkflow(freshActiveWorkflow)) {
                    setIsGenerating(true);
                    if (freshActiveWorkflow?.kind === 'user_input') {
                        setIsConversationProcessing(true);
                        setMessages(prev => appendBackgroundUpdateMessage(prev, BACKGROUND_UPDATE_RESTORED_MESSAGE));
                    }
                } else if (!isStateActivelyGenerating(state)) {
                    setIsGenerating(false);
                    setIsConversationProcessing(false);
                }

                if (isDeployProjectWorkflow(freshActiveWorkflow)) {
                    setIsDeploying(true);
                    setDeploymentError('');
                } else if (!freshActiveWorkflow) {
                    setIsDeploying(false);
                }
                if (isDeployPreviewWorkflow(freshActiveWorkflow)) {
                    setIsPreviewDeploying(true);
                } else if (!freshActiveWorkflow) {
                    setIsPreviewDeploying(false);
                }

                logger.debug('✅ Agent state update processed');
                break;
            }

            case 'conversation_state': {
                if (message.type !== 'conversation_state') break;
                const { state, agentState, deepDebugSession } = message;
                const history: ReadonlyArray<ConversationMessage> = state?.runningHistory ?? [];
                logger.debug('Received conversation_state with messages:', history.length, 'deepDebugSession:', deepDebugSession);

                const restoredMessages: ChatMessage[] = [];
                let currentAssistant: ChatMessage | null = null;
                
                const ensureToolEvents = (assistant: ChatMessage) => {
                    if (!assistant.ui) assistant.ui = { toolEvents: [] };
                    if (!assistant.ui.toolEvents) assistant.ui.toolEvents = [];
                };
                
                for (const msg of history) {
                    const text = extractTextContent(msg.content);
                    if (text?.includes('<Internal Memo>')) continue;
                    
                    if (msg.role === 'user') {
                        const fallbackAgentId = urlChatId && urlChatId !== 'new' ? urlChatId : undefined;
                        const parsedUserMessage = parseUserMessageForDisplay(msg.content, fallbackAgentId);
                        restoredMessages.push({
                            role: 'user',
                            conversationId: msg.conversationId,
                            content: parsedUserMessage.text || (parsedUserMessage.attachments.length > 0 ? '(Attached media)' : ''),
                            attachments: parsedUserMessage.attachments,
                        });
                        currentAssistant = null;
                    } else if (msg.role === 'assistant') {
                        const content = msg.conversationId.startsWith('archive-')
                            ? 'previous history was compacted'
                            : (text || '');
                        if (shouldHideLegacyAssistantPrompt(content)) {
                            currentAssistant = null;
                            continue;
                        }

                        const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
                        
                        // Merge all consecutive assistant messages into one bubble
                        if (currentAssistant) {
                            // Append content if present
                            if (content) {
                                currentAssistant.content += (currentAssistant.content ? '\n\n' : '') + content;
                            }
                            // Append tool_calls if present
                            if (hasToolCalls) {
                                if (!currentAssistant.tool_calls) {
                                    currentAssistant.tool_calls = [];
                                }
                                currentAssistant.tool_calls.push(...msg.tool_calls!);
                                ensureToolEvents(currentAssistant);
                            }
                        } else {
                            // Create new assistant message
                            currentAssistant = {
                                role: 'assistant',
                                conversationId: msg.conversationId,
                                content,
                                ui: hasToolCalls ? { toolEvents: [] } : undefined,
                                tool_calls: hasToolCalls ? [...msg.tool_calls!] : undefined,
                            };
                            restoredMessages.push(currentAssistant);
                        }
                    } else if (msg.role === 'tool' && 'name' in msg && msg.name && currentAssistant) {
                        ensureToolEvents(currentAssistant);
                        currentAssistant.ui!.toolEvents!.push({
                            name: msg.name,
                            status: 'success',
                            timestamp: Date.now(),
                            result: text || undefined,
                            contentLength: currentAssistant.content.length,
                        });
                    }
                }

                // Restore active debug session if one is running
                if (deepDebugSession?.conversationId) {
                    setIsDebugging(true);
                    
                    // Find if there's already a message with this conversationId
                    const existingMessageIndex = restoredMessages.findIndex(
                        m => m.role === 'assistant' && m.conversationId === deepDebugSession.conversationId
                    );
                    
                    if (existingMessageIndex !== -1) {
                        // Update existing message to show as active debug
                        const existingMessage = restoredMessages[existingMessageIndex];
                        if (!existingMessage.ui) existingMessage.ui = {};
                        if (!existingMessage.ui.toolEvents) existingMessage.ui.toolEvents = [];
                        
                        const debugEventIndex = existingMessage.ui.toolEvents.findIndex(e => e.name === 'deep_debug');
                        if (debugEventIndex === -1) {
                            existingMessage.ui.toolEvents.push({
                                name: 'deep_debug',
                                status: 'start',
                                timestamp: Date.now(),
                                contentLength: 0
                            });
                        } else {
                            existingMessage.ui.toolEvents[debugEventIndex].status = 'start';
                            existingMessage.ui.toolEvents[debugEventIndex].contentLength = 0;
                        }
                    } else {
                        // Create new placeholder message with the active conversationId
                        const debugBubble: ChatMessage = {
                            role: 'assistant',
                            conversationId: deepDebugSession.conversationId,
                            content: 'Deep debug session in progress...',
                            ui: {
                                toolEvents: [{
                                    name: 'deep_debug',
                                    status: 'start',
                                    timestamp: Date.now(),
                                    contentLength: 0
                                }]
                            }
                        };
                        restoredMessages.push(debugBubble);
                    }
                }

                const fallbackMessages = restoredMessages.length === 0 && agentState?.mvpGenerated && !getFreshActiveWorkflow(agentState)
                    ? [createAIMessage('generation-complete-restored', BACKGROUND_UPDATE_COMPLETE_MESSAGE)]
                    : [];
                const messagesToRestore = restoredMessages.length > 0 ? restoredMessages : fallbackMessages;

                if (messagesToRestore.length > 0) {
                    // Deduplicate assistant messages with identical content (even if separated by tool messages)
                    const deduplicated = attachRetryActionToLatestFailure(
                        deduplicateMessages(filterHiddenAssistantPrompts(messagesToRestore)),
                        agentState,
                    );
                    
                    logger.debug('Merging conversation_state with', deduplicated.length, 'messages (', messagesToRestore.length - deduplicated.length, 'duplicates removed)');
                    setMessages(prev => {
                        const restoredWithPreservedAttachments = preserveExistingUserAttachments(deduplicated, prev);
                        const hasFetching = prev.some(m => m.role === 'assistant' && m.conversationId === 'fetching-chat');
                        
                        if (hasFetching) {
                            const next = appendToolEvent(prev, 'fetching-chat', { 
                                name: 'fetching your latest conversations', 
                                status: 'success' 
                            });
                            return [...next, ...restoredWithPreservedAttachments];
                        }
                        
                        return restoredWithPreservedAttachments;
                    });
                }
                break;
            }

			case 'file_generating': {
				setFiles((prev) => setFileGenerating(prev, message.filePath));
				deps.onPresentationFileEvent?.({ type: 'file_generating', path: message.filePath });
				break;
			}

			case 'file_chunk_generated': {
				setFiles((prev) => appendFileChunk(prev, message.filePath, message.chunk));
				deps.onPresentationFileEvent?.({ type: 'file_chunk', path: message.filePath, chunk: message.chunk });
				break;
			}

			case 'file_generated': {
				setFiles((prev) => setFileCompleted(prev, message.file.filePath, message.file.fileContents));
				setPhaseTimeline((prev) => updatePhaseFileStatus(
					prev,
					message.file.filePath,
					'completed',
					message.file.fileContents
				));
				deps.onPresentationFileEvent?.({ type: 'file_generated', path: message.file.filePath, contents: message.file.fileContents });
				break;
			}

            case 'file_regenerated': {
                setIsRedeployReady(true);
                setFiles((prev) => setFileCompleted(prev, message.file.filePath, message.file.fileContents));
                setPhaseTimeline((prev) => updatePhaseFileStatus(
                    prev,
                    message.file.filePath,
                    'completed',
                    message.file.fileContents
                ));
                break;
            }

            case 'file_regenerating': {
                setFiles((prev) => setFileGenerating(prev, message.filePath, 'File being regenerated...'));
                setPhaseTimeline((prev) => updatePhaseFileStatus(prev, message.filePath, 'generating'));
                break;
            }

            case 'generation_started': {
                setIsGeneratingBlueprint(false);
                setIsThinking(false);
                updateStage('bootstrap', { status: 'completed' });
                updateStage('blueprint', { status: 'completed' });
                updateStage('code', { status: 'active' });
                setTotalFiles(message.totalFiles);
                setIsGenerating(true);
                if (message.workflowKind && message.workflowKind !== 'create_project') {
                    setMessages(prev => appendBackgroundUpdateMessage(prev));
                }
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'generating' });
                }
                break;
            }

            case 'generation_complete': {
                setIsConversationProcessing(false);
                setIsRedeployReady(true);
                setFiles((prev) => setAllFilesCompleted(prev));
                setProjectStages((prev) => completeStages(prev, ['code']));
                
                // Reset all phase indicators
                setIsPhaseProgressActive(false);
                setIsThinking(false);
                setIsGenerating(false);
                setMessages(prev => finishOrAppendGenerationCompleteMessage(prev));
                if (message.previewURL) {
                    setPreviewUrl(message.previewURL);
                }
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'completed' });
                }
                break;
            }

            case 'deployment_started': {
                setIsPreviewDeploying(true);
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'generating' });
                }
                break;
            }

            case 'deployment_completed': {
                setIsPreviewDeploying(false);
                const finalPreviewURL = getPreviewUrl(message.previewURL, message.tunnelURL);
                setPreviewUrl(finalPreviewURL);
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'completed' });
                }
                break;
            }

            case 'deployment_failed': {
                setIsPreviewDeploying(false);
                if (isTaskBusyWarning(message.error)) {
                    toast.warning(getTaskBusyWarningTitle(message.error), {
                        description: message.error,
                    });
                    onDebugMessage?.('warning',
                        getTaskBusyWarningTitle(message.error),
                        message.error,
                        'Preview Deployment'
                    );
                } else {
                    toast.error(message.error);
                }
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'completed' });
                }
                break;
            }

            case 'code_reviewed': {
                const reviewData = message.review;
                const totalIssues = reviewData?.filesToFix?.reduce((count: number, file: { issues: unknown[] }) =>
                    count + file.issues.length, 0) || 0;

                let reviewMessage = 'Code review complete';
                if (reviewData?.issuesFound) {
                    reviewMessage = `Code review complete - ${totalIssues} issue${totalIssues !== 1 ? 's' : ''} found across ${reviewData.filesToFix?.length || 0} file${reviewData.filesToFix?.length !== 1 ? 's' : ''}`;
                } else {
                    reviewMessage = 'Code review complete - no issues found';
                }

                sendMessage(createAIMessage('code_reviewed', reviewMessage));
                break;
            }

            case 'runtime_error_found': {
                logger.info('Runtime error found', message.errors);
                
                // Update runtime error count
                deps.setRuntimeErrorCount(message.count || message.errors?.length || 0);
                
                onDebugMessage?.('error', 
                    `Runtime Error (${message.count} errors)`,
                    message.errors.map((e: { message: string; stack?: string }) => `${e.message}\nStack: ${e.stack || 'N/A'}`).join('\n\n'),
                    'Runtime Detection'
                );
                break;
            }

            case 'code_reviewing': {
                const lintIssues = message.staticAnalysis?.lint?.issues?.length || 0;
                const typecheckIssues = message.staticAnalysis?.typecheck?.issues?.length || 0;
                const runtimeErrors = message.runtimeErrors?.length || 0;
                const totalIssues = lintIssues + typecheckIssues + runtimeErrors;

                // Update issue counts
                deps.setStaticIssueCount(lintIssues + typecheckIssues);
                deps.setRuntimeErrorCount(runtimeErrors);

                // Show review start message
                sendMessage(createAIMessage('review_start', 'App generation complete, now reviewing code indepth'));

                if (totalIssues > 0) {
                    const errorDetails = [
                        `Lint Issues: ${JSON.stringify(message.staticAnalysis?.lint?.issues)}`,
                        `Type Errors: ${JSON.stringify(message.staticAnalysis?.typecheck?.issues)}`,
                        `Runtime Errors: ${JSON.stringify(message.runtimeErrors)}`,
                    ].filter(Boolean).join('\n');

                    onDebugMessage?.('warning',
                        `Generation Issues Found (${totalIssues} total)`,
                        errorDetails,
                        'Code Generation'
                    );
                }
                break;
            }

            case 'phase_generating': {
                sendMessage(createAIMessage('phase_generating', message.message));
                setIsThinking(true);
                setIsPhaseProgressActive(true);
                break;
            }

            case 'phase_generated': {
                sendMessage(createAIMessage('phase_generated', message.message));
                setIsThinking(false);
                setIsPhaseProgressActive(false);
                break;
            }

            case 'phase_implementing': {
                sendMessage(createAIMessage('phase_implementing', message.message));
                updateStage('code', { status: 'active' });
                
                if (message.phase) {
                    setPhaseTimeline(prev => {
                        const existingPhase = prev.find(p => p.name === message.phase.name);
                        if (existingPhase) {
                            logger.debug('Phase already exists in timeline:', message.phase.name);
                            return prev;
                        }
                        
                        const newPhase = {
                            id: `${message.phase.name}-${Date.now()}`,
                            name: message.phase.name,
                            description: message.phase.description,
                            files: message.phase.files?.map((f: { path: string; purpose: string }) => ({
                                path: f.path,
                                purpose: f.purpose,
                                status: 'generating' as const,
                            })) || [],
                            status: 'generating' as const,
                            timestamp: Date.now()
                        };
                        
                        logger.debug('Added new phase to timeline:', message.phase.name);
                        return [...prev, newPhase];
                    });
                }
                break;
            }

            case 'phase_validating': {
                sendMessage(createAIMessage('phase_validating', message.message));
                
                setPhaseTimeline(prev => {
                    const updated = [...prev];
                    if (updated.length > 0) {
                        const lastPhase = updated[updated.length - 1];
                        lastPhase.status = 'validating';
                        logger.debug(`Phase validating: ${lastPhase.name}`);
                    }
                    return updated;
                });
                setIsPreviewDeploying(false);
                setIsPhaseProgressActive(false);
                break;
            }

            case 'phase_validated': {
                sendMessage(createAIMessage('phase_validated', message.message));
                break;
            }

            case 'phase_implemented': {
                sendMessage(createAIMessage('phase_implemented', message.message));

                updateStage('code', { status: 'completed' });
                setIsRedeployReady(true);
                setIsPhaseProgressActive(false);
                
                if (message.phase) {
                    setPhaseTimeline(prev => {
                        const updated = [...prev];
                        if (updated.length > 0) {
                            const lastPhase = updated[updated.length - 1];
                            lastPhase.status = 'completed';
                            lastPhase.files = lastPhase.files.map(f => ({ ...f, status: 'completed' as const }));
                            logger.debug(`Phase completed: ${lastPhase.name}`);
                        }
                        return updated;
                    });
                }

                logger.debug('🔄 Scheduling preview refresh in 1 second after deployment completion');
                setTimeout(() => {
                    logger.debug('🔄 Triggering preview refresh after deployment completion');
                    setShouldRefreshPreview(true);
                    
                    setTimeout(() => {
                        setShouldRefreshPreview(false);
                    }, 100);
                    
                    onDebugMessage?.('info',
                        'Preview Auto-Refresh Triggered',
                        `Preview refreshed 1 second after deployment completion`,
                        'Preview Auto-Refresh'
                    );
                }, 1000);
                break;
            }

            case 'preview_force_refresh': {
                setShouldRefreshPreview(true);
                setTimeout(() => {
                    setShouldRefreshPreview(false);
                }, 100);
                break;
            }

            case 'generation_stopped': {
                clearDeploymentTimeout?.();
                setIsConversationProcessing(false);
                setIsGenerating(false);
                setIsGenerationPaused(isGenerating);
                setIsDebugging(false);
                setIsDeploying(false);
                setIsPreviewDeploying(false);
                
                // Reset phase indicators
                setIsPhaseProgressActive(false);
                setIsThinking(false);
                setMessages(prev => finishBackgroundUpdateMessage(prev, 'Update paused.'));
                
                // Mark any active phases as cancelled (not completed, since they were interrupted)
                setPhaseTimeline((prev) => 
                    prev.map(phase => 
                        (phase.status === 'generating' || phase.status === 'validating')
                            ? { 
                                ...phase, 
                                status: 'cancelled' as const,
                                files: phase.files.map(file => 
                                    file.status === 'generating' || file.status === 'validating'
                                        ? { ...file, status: 'cancelled' as const }
                                        : file
                                )
                            }
                            : phase
                    )
                );
                
                // Show toast notification for user-initiated stop
                toast.info('Task stopped', {
                    description: message.message || 'The running task has been stopped'
                });

                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'completed' });
                }
                
                sendMessage(createAIMessage('generation_stopped', message.message));
                break;
            }

            case 'generation_resumed': {
                setIsGenerating(true);
                setIsGenerationPaused(false);
                sendMessage(createAIMessage('generation_resumed', message.message));
                break;
            }

            case 'cloudflare_deployment_started': {
                setIsDeploying(true);
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'generating' });
                }
                onDebugMessage?.('info',
                    'Playable Update Started',
                    message.message,
                    'Playable Update'
                );
                break;
            }

            case 'cloudflare_deployment_completed': {
                clearDeploymentTimeout?.();
                setIsDeploying(false);
                setCloudflareDeploymentUrl(message.deploymentUrl);
                setDeploymentError('');
                setIsRedeployReady(false);
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'completed' });
                }
                toast.success('Playable updated');

                onDebugMessage?.('info',
                    'Playable Update Completed',
                    `Prepared URL: ${message.deploymentUrl}\nPhase count at preparation: ${phaseTimeline.length}`,
                    'Playable Update'
                );
                break;
            }

            case 'cloudflare_deployment_error': {
                clearDeploymentTimeout?.();
                setIsDeploying(false);
                const isTaskWarning = isTaskBusyWarning(message.error || message.message);
                if (!isTaskWarning) {
                    setDeploymentError(message.error || 'Unknown deployment error');
                } else {
                    setDeploymentError('');
                }
                setCloudflareDeploymentUrl('');
                setIsRedeployReady(true);
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, { status: 'completed' });
                }
                if (isTaskWarning) {
                    toast.warning(getTaskBusyWarningTitle(message.error || message.message), {
                        description: message.error || message.message,
                    });
                } else {
                    toast.error(message.message || 'Playable update failed', {
                        description: message.error,
                    });
                }

                onDebugMessage?.(isTaskWarning ? 'warning' : 'error',
                    isTaskWarning ? getTaskBusyWarningTitle(message.error || message.message) : 'Playable Update Failed',
                    isTaskWarning ? (message.error || message.message) : `Error: ${message.error}`,
                    'Playable Update'
                );
                break;
            }

            case 'conversation_response': {
                if (message.isStreaming || message.tool) {
                    setIsConversationProcessing(true);
                }
                // Use concrete conversationId when available; otherwise use placeholder id
                let conversationId = message.conversationId ?? 'conversation_response';

                // If a concrete id arrives later, update placeholder once
                if (message.conversationId) {
                    const convId = message.conversationId;
                    setMessages(prev => {
                        const genericIdx = prev.findIndex(m => m.role === 'assistant' && m.conversationId === 'conversation_response');
                        if (genericIdx !== -1) {
                            return prev.map((m, i) => i === genericIdx ? { ...m, conversationId: convId } : m);
                        }
                        return prev;
                    });
                    conversationId = convId;
                }

                const isArchive = conversationId.startsWith('archive-');
                const placeholder = 'previous history was compacted';

                if (message.tool) {
                    const tool = message.tool;
                    setMessages(prev => appendToolEvent(prev, conversationId, {
                        name: tool.name,
                        status: tool.status,
                        result: tool.result
                    }));
                    break;
                }

                if (!message.isStreaming && shouldHideLegacyAssistantPrompt(message.message)) {
                    setMessages(prev => prev.filter((item) => item.conversationId !== conversationId));
                    break;
                }

                if (message.isStreaming) {
                    const chunk = isArchive ? placeholder : message.message;
                    setMessages(prev => {
                        const existing = prev.find(
                            item => item.role === 'assistant' && item.conversationId === conversationId,
                        );
                        const nextContent = `${existing?.content ?? ''}${chunk}`;
                        if (shouldHoldLegacyAssistantStream(nextContent)) {
                            return prev.filter(item => item.conversationId !== conversationId);
                        }
                        return filterHiddenAssistantPrompts(
                            handleStreamingMessage(prev, conversationId, chunk, false),
                        );
                    });
                    break;
                }

                setMessages(prev => {
                    const withoutActiveStatus = !message.isStreaming && !message.tool
                        ? removeActiveBackgroundUpdateMessage(prev)
                        : prev;
                    const idx = withoutActiveStatus.findIndex(m => m.role === 'assistant' && m.conversationId === conversationId);
                    if (idx !== -1) {
                        return withoutActiveStatus.map((m, i) => i === idx
                            ? { ...m, content: (isArchive ? placeholder : message.message), action: message.action }
                            : m);
                    }

                    // Deduplicate: Don't add if last assistant message has identical content
                    const newContent = isArchive ? placeholder : message.message;
                    if (isAssistantMessageDuplicate(withoutActiveStatus, newContent)) {
                        logger.debug('Skipping duplicate assistant message');
                        return withoutActiveStatus; // Skip duplicate
                    }

                    return [...withoutActiveStatus, createAIMessage(conversationId, newContent, false, message.action)];
                });
                break;
            }

	            case 'user_suggestions_processing': {
	                const isProcessing = message.status !== 'complete' && message.status !== 'error';
	                setIsConversationProcessing(isProcessing);
	                setIsThinking(isProcessing);
	                if (isProcessing) {
	                    setIsGenerating(true);
	                    setIsGenerationPaused(false);
	                    updateStage('bootstrap', { status: 'completed' });
                    updateStage('blueprint', { status: 'completed' });
                    updateStage('code', { status: 'active' });
                    setMessages(prev => appendBackgroundUpdateMessage(prev));
                } else {
                    if (message.status === 'error') {
                        setIsGenerating(false);
                        updateStage('code', { status: 'error' });
                    }
                    setMessages(prev => finishBackgroundUpdateMessage(
                        prev,
                        message.status === 'error'
                            ? BACKGROUND_UPDATE_FAILED_MESSAGE
                            : BACKGROUND_UPDATE_COMPLETE_MESSAGE,
                    ));
                }
                if (deps.urlChatId) {
                    appEvents.emitAppUpdated(deps.urlChatId, {
                        status: isProcessing ? 'generating' : 'completed',
                    });
                }
                break;
            }

            case 'server_log': {
                const safeMessage = redactInternalGeneratorName(message.message);
                onDebugMessage?.(
                    message.level === 'error' ? 'error' : message.level === 'warn' ? 'warning' : 'info',
                    safeMessage,
                    message.source,
                    'Server',
                    'server_log',
                    { ...message, message: safeMessage },
                );
                break;
            }

            case 'blueprint_chunk': {
                // Initialize parser on first chunk
                if (!blueprintParser) {
                    blueprintParser = createRepairingJSONParser();
                    logger.debug('Blueprint streaming started');
                    setIsGeneratingBlueprint(true);
                    updateStage('bootstrap', { status: 'completed' });
                    updateStage('blueprint', { status: 'active' });
                }

                // Feed chunk to parser
                blueprintParser.feed(message.chunk);

                // Try to parse partial blueprint
                try {
                    const partial = blueprintParser.finalize();
                    setBlueprint(partial);
                    updateStage('bootstrap', { status: 'completed' });
                    updateStage('blueprint', { status: 'completed' });
                    setIsGeneratingBlueprint(false);
                    logger.debug('Blueprint chunk processed, partial blueprint updated');
                } catch (e) {
                    logger.debug('Blueprint chunk accumulated, waiting for more data');
                }
                break;
            }

            case 'vault_required': {
                // Agent needs access to secrets but vault is locked
                logger.info('Agent requested vault unlock:', message.reason);
                const reason = message.reason || 'Please unlock your vault to continue';

                // Trigger unlock modal via callback if available
                if (deps.onVaultUnlockRequired) {
                    deps.onVaultUnlockRequired(reason);
                } else {
                    // Fallback to toast if callback not provided
                    toast.info('Vault unlock required', {
                        description: reason,
                        duration: 5000,
                    });
                }
                break;
            }

            case 'error': {
                setIsConversationProcessing(false);
                setIsThinking(false);
                setIsGenerating(false);
                const errorData = message;
                const safeError = summarizeErrorForChat(errorData.error);
                if (isTaskBusyWarning(errorData.error)) {
                    toast.warning(getTaskBusyWarningTitle(errorData.error), {
                        description: errorData.error,
                    });
                    onDebugMessage?.(
                        'warning',
                        getTaskBusyWarningTitle(errorData.error),
                        errorData.error,
                        'WebSocket',
                        'error',
                        errorData
                    );
                    break;
                }
                setMessages(prev => {
                    const withoutActiveStatus = replaceLatestBackgroundUpdateMessage(prev, BACKGROUND_UPDATE_FAILED_MESSAGE);
                    if (isRetryableProjectFailureMessage(safeError)) {
                        if (withoutActiveStatus.some(item => item.action?.type === 'retry_last_failed_workflow')) {
                            return withoutActiveStatus;
                        }
                        return [
                            ...withoutActiveStatus,
                            createAIMessage(`error_${Date.now()}`, safeError, false, RETRY_LAST_FAILED_WORKFLOW_ACTION),
                        ];
                    }

                    return [
                        ...withoutActiveStatus,
                        createAIMessage(`error_${Date.now()}`, `❌ ${safeError}`)
                    ];
                });
                
                onDebugMessage?.(
                    'error',
                    'WebSocket Error',
                    safeError,
                    'WebSocket',
                    'error',
                    { ...errorData, error: safeError }
                );
                break;
            }

            case 'rate_limit_error': {
                setIsConversationProcessing(false);
                setIsThinking(false);
                setIsGenerating(false);
                const errorData = message.error;
                const rateLimitMessage = handleRateLimitError(
                    errorData.details,
                    onDebugMessage
	                );
	                setMessages(prev => {
	                    return [
	                        ...replaceLatestBackgroundUpdateMessage(prev, BACKGROUND_UPDATE_FAILED_MESSAGE),
	                        rateLimitMessage,
                    ];
                });
                
                break;
            }

            default:
                logger.warn('Unhandled message:', message);
        }
    };
}
