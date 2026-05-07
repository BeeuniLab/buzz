import { Connection } from 'agents';
import { createLogger } from '../../logger';
import { WebSocketMessageRequests, WebSocketMessageResponses } from '../constants';
import { WebSocketMessage, WebSocketMessageData, WebSocketMessageType } from '../../api/websocketTypes';
import { MAX_CHAT_MEDIA_PER_MESSAGE, MAX_IMAGE_SIZE_BYTES } from '../../types/image-attachment';
// import { credentialsToRuntimeOverrides, type CredentialsPayload } from '../inferutils/config.types';
import type { CodeGeneratorAgent } from './codingAgent';

const logger = createLogger('CodeGeneratorWebSocket');

export function handleWebSocketMessage(
    agent: CodeGeneratorAgent, 
    connection: Connection, 
    message: string
): void {
    try {
        logger.info(`Received WebSocket message from ${connection.id}: ${message}`);
        const parsedMessage = JSON.parse(message);

        switch (parsedMessage.type) {
            case WebSocketMessageRequests.SESSION_INIT: {
                // const credentials = parsedMessage.credentials as CredentialsPayload | undefined;
                // Runtime credential overrides are disabled for Codex background execution.
                logger.info(`Received session init message from ${connection.id}, Disable for now`);
                break;
            }
            case WebSocketMessageRequests.GENERATE_ALL:
                // Check if generation is already active to avoid duplicate processes
                if (agent.isCodeGenerating()) {
                    logger.info('Generation already in progress, skipping duplicate request');
                    // sendToConnection(connection, WebSocketMessageResponses.GENERATION_STARTED, {
                    //     message: 'Code generation is already in progress'
                    // });
                    return;
                }
                
                // Start durable generation workflow.
                logger.info('Queueing code generation workflow');
                agent.startGenerationWorkflow('generate_all').catch(error => {
                    logger.error('Error during code generation:', error);
                    sendError(connection, `Error generating files: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            case WebSocketMessageRequests.DEPLOY:
                agent.startDeployProjectWorkflow().catch((error: unknown) => {
                    logger.error('Error queueing deployment workflow:', error);
                    sendError(connection, `Error starting deployment: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            case WebSocketMessageRequests.PREVIEW:
                // Deploy current state for preview
                logger.info('Deploying for preview');
                agent.startDeployPreviewWorkflow().then((workflowId) => {
                    logger.info(`Preview workflow queued successfully`, { workflowId });
                }).catch((error: unknown) => {
                    logger.error('Error queueing preview workflow:', error);
                    sendError(connection, `Error starting preview deployment: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            case WebSocketMessageRequests.STOP_GENERATION: {
                logger.info('User requested to stop generation');
                
                Promise.all([
                    agent.stopActiveWorkflow(),
                    agent.stopCurrentTask(),
                ])
                    .then(([workflowTerminated, wasCancelled]) => {
                        // Clear shouldBeGenerating after state updates so the stopped marker is preserved.
                        agent.setState({
                            ...agent.state,
                            shouldBeGenerating: false,
                            activeWorkflow: undefined,
                        });

                        sendToConnection(connection, WebSocketMessageResponses.GENERATION_STOPPED, {
                            message: workflowTerminated || wasCancelled
                                ? 'Task stopped successfully'
                                : 'No active task to cancel'
                        });
                    })
                    .catch((error: unknown) => {
                        logger.error('Error stopping generation:', error);
                        sendError(connection, `Error stopping generation: ${error instanceof Error ? error.message : String(error)}`);
                    });
                break;
            }
            case WebSocketMessageRequests.RESUME_GENERATION:
                logger.info('Resuming code generation');
                
                if (!agent.isCodeGenerating()) {
                    sendToConnection(connection, WebSocketMessageResponses.GENERATION_RESUMED, {
                        message: 'Code generation resumed'
                    });
                    agent.startGenerationWorkflow('resume_generation').catch(error => {
                        logger.error('Error resuming code generation:', error);
                        sendError(connection, `Error resuming generation: ${error instanceof Error ? error.message : String(error)}`);
                    });
                } else {
                    // sendToConnection(connection, WebSocketMessageResponses.GENERATION_STARTED, {
                    //     message: 'Code generation is already in progress'
                    // });
                }
                break;
            case WebSocketMessageRequests.USER_SUGGESTION: {
                // Handle user suggestion for conversational AI
                logger.info('Received user suggestion', {
                    messageLength: parsedMessage.message?.length || 0,
                    hasImages: !!parsedMessage.images && parsedMessage.images.length > 0,
                    imageCount: parsedMessage.images?.length || 0
                });

                if (
                    agent.isCodeGenerating() ||
                    agent.isDeepDebugging() ||
                    agent.state.shouldBeGenerating ||
                    agent.state.activeWorkflow
                ) {
                    sendError(connection, 'A task is still running. Please stop it or wait for it to finish before sending another message.');
                    return;
                }
                
                const hasText =
                    typeof parsedMessage.message === 'string' && parsedMessage.message.trim().length > 0;
                const hasAttachments =
                    Array.isArray(parsedMessage.images) && parsedMessage.images.length > 0;
                if (!hasText && !hasAttachments) {
                    sendError(connection, 'No message or attachments in user suggestion');
                    return;
                }
                
                // Validate image count and size
                if (parsedMessage.images && parsedMessage.images.length > 0) {
                    if (parsedMessage.images.length > MAX_CHAT_MEDIA_PER_MESSAGE) {
                        sendError(connection, `Maximum ${MAX_CHAT_MEDIA_PER_MESSAGE} attachments allowed per message. Received ${parsedMessage.images.length}.`);
                        return;
                    }
                    
                    for (const image of parsedMessage.images) {
                        if (image.size > MAX_IMAGE_SIZE_BYTES) {
                            sendError(connection, `Attachment "${image.filename}" exceeds maximum size of ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)}MB`);
                            return;
                        }
                    }
                }
                
                agent
                    .startUserInputWorkflow(
                        typeof parsedMessage.message === 'string' ? parsedMessage.message : '',
                        parsedMessage.images,
                    )
                    .catch((error: unknown) => {
                    logger.error('Error handling user suggestion:', error);
                    sendError(connection, `Error processing user suggestion: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            }
            case WebSocketMessageRequests.GET_MODEL_CONFIGS:
                logger.info('Fetching model configurations');
                agent.getModelConfigsInfo().then(configsInfo => {
                    sendToConnection(connection, WebSocketMessageResponses.MODEL_CONFIGS_INFO, {
                        message: 'Model configurations retrieved',
                        configs: configsInfo
                    });
                }).catch((error: unknown) => {
                    logger.error('Error fetching model configs:', error);
                    sendError(connection, `Error fetching model configurations: ${error instanceof Error ? error.message : String(error)}`);
                });
                break;
            case WebSocketMessageRequests.CLEAR_CONVERSATION:
                logger.info('Clearing conversation history');
                agent.clearConversation();
                break;
            case WebSocketMessageRequests.VAULT_UNLOCKED:
                agent.handleVaultUnlocked();
                break;
            case WebSocketMessageRequests.VAULT_LOCKED:
                agent.handleVaultLocked();
                break;
            case WebSocketMessageRequests.GET_CONVERSATION_STATE:
                try {
                    const state = agent.getConversationState();
                    const debugState = agent.getDeepDebugSessionState();
                    logger.info('Conversation state retrieved', state);
                    sendToConnection(connection, WebSocketMessageResponses.CONVERSATION_STATE, { 
                        state,
                        deepDebugSession: debugState
                    });
                } catch (error) {
                    logger.error('Error fetching conversation state:', error);
                    sendError(connection, `Error fetching conversation state: ${error instanceof Error ? error.message : String(error)}`);
                }
                break;
            // Disabled it for now
            // case WebSocketMessageRequests.TERMINAL_COMMAND:
            //     // Handle terminal command execution
            //     logger.info('Received terminal command', {
            //         command: parsedMessage.command,
            //         timestamp: parsedMessage.timestamp
            //     });
                
            //     if (!parsedMessage.command) {
            //         sendError(connection, 'No command provided');
            //         return;
            //     }
                
            //     // Execute terminal command  
            //     agent.executeTerminalCommand(parsedMessage.command, connection as any)
            //         .catch((error: unknown) => {
            //             logger.error('Error executing terminal command:', error);
            //             sendToConnection(connection, WebSocketMessageResponses.TERMINAL_OUTPUT, {
            //                 output: `Error: ${error instanceof Error ? error.message : String(error)}`,
            //                 outputType: 'stderr' as const,
            //                 timestamp: Date.now()
            //             });
            //         });
            //     break;
            default:
                sendError(connection, `Unknown message type: ${parsedMessage.type}`);
        }
    } catch (error) {
        logger.error('Error processing WebSocket message:', error);
        sendError(connection, `Error processing message: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export function handleWebSocketClose(agent: CodeGeneratorAgent, connection: Connection): void {
    logger.info(`WebSocket connection closed: ${connection.id}`);
    // Clear vault session on disconnect for security
    agent.handleVaultLocked();
}

export function broadcastToConnections<T extends WebSocketMessageType>(
    agent: { getWebSockets(): WebSocket[] },
    type: T,
    data: WebSocketMessageData<T>
): void {
    const connections = agent.getWebSockets();
    for (const connection of connections) {
        sendToConnection(connection, type, data);
    }
}

export function sendToConnection<T extends WebSocketMessageType>(
    connection: WebSocket, 
    type: T, 
    data: WebSocketMessageData<T>
): void {
    try {
        const message: WebSocketMessage = { type, ...data } as WebSocketMessage;
        connection.send(JSON.stringify(message));
    } catch (error) {
        console.error(`Error sending message to connection ${connection.url}:`, error);
    }
}

export function sendError(connection: WebSocket, errorMessage: string): void {
    sendToConnection(connection, 'error', { error: errorMessage });
}
