import type { ChatMessage } from './message-helpers';

const REVIEW_PROMPT_VISIBLE_TEXT = 'There might be some bugs in the app. Do you want me to try to fix them?';

function stripSystemContext(content: string): string {
    return content.replace(/<system_context>[\s\S]*?<\/system_context>\n?/gi, '').trim();
}

function collapseRepeatedReviewPrompt(content: string): string {
    const visibleContent = stripSystemContext(content);
    const paragraphs = visibleContent
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (paragraphs.length > 1 && paragraphs.every((part) => part === REVIEW_PROMPT_VISIBLE_TEXT)) {
        return REVIEW_PROMPT_VISIBLE_TEXT;
    }

    return content;
}

function normalizeAssistantContentForDedup(content: string): string {
    const visibleContent = stripSystemContext(content);
    if (visibleContent === REVIEW_PROMPT_VISIBLE_TEXT) {
        return REVIEW_PROMPT_VISIBLE_TEXT;
    }
    return visibleContent;
}

/**
 * Deduplicates consecutive assistant messages with identical content.
 * 
 * This handles cases where the backend sends duplicate responses after tool execution,
 * even when tool messages appear between them.
 * 
 * Algorithm:
 * - Keeps all non-assistant messages
 * - For each assistant message, checks if the last assistant (not necessarily adjacent) has identical content
 * - If duplicate found, skips the current message
 * 
 * @param messages - Array of chat messages to deduplicate
 * @returns Deduplicated array of messages
 */
export function deduplicateMessages(messages: readonly ChatMessage[]): ChatMessage[] {
    if (messages.length === 0) return [];
    
    const result: ChatMessage[] = [];
    let lastAssistantContent: string | null = null;
    
    for (const msg of messages) {
        if (msg.role !== 'assistant') {
            // Keep all non-assistant messages (user, tool, etc.)
            result.push(msg);
            continue;
        }

        const content = collapseRepeatedReviewPrompt(msg.content);
        const normalizedContent = normalizeAssistantContentForDedup(content);
        
        // For assistant messages, check against last assistant content
        if (lastAssistantContent !== null && normalizedContent === lastAssistantContent) {
            // Skip this duplicate
            continue;
        }
        
        // Not a duplicate - keep it and update last content
        result.push(content === msg.content ? msg : { ...msg, content });
        lastAssistantContent = normalizedContent;
    }
    
    return result;
}

/**
 * Check if a new assistant message would be a duplicate of the last assistant message.
 * Used for live streaming to prevent adding duplicates.
 * 
 * @param messages - Current messages array
 * @param newContent - Content of the new assistant message
 * @returns true if this would be a duplicate, false otherwise
 */
export function isAssistantMessageDuplicate(
    messages: readonly ChatMessage[],
    newContent: string
): boolean {
    // Find the last assistant message
    const normalizedNewContent = normalizeAssistantContentForDedup(newContent);
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
            return normalizeAssistantContentForDedup(messages[i].content) === normalizedNewContent;
        }
    }
    return false; // No previous assistant message found
}
