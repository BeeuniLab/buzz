import type { ConversationMessage } from '../../inferutils/common';

export const REVIEW_PROMPT_VISIBLE_TEXT = 'There might be some bugs in the app. Do you want me to try to fix them?';
export const REVIEW_PROMPT_CONTENT = `<system_context>If the user responds with yes, launch the 'deep_debug' tool with the prompt to fix all the issues in the app</system_context>\n${REVIEW_PROMPT_VISIBLE_TEXT}`;

function messageText(content: ConversationMessage['content']): string {
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.filter((part) => part.type === 'text')
		.map((part) => part.text)
		.join('\n');
}

export function hasPendingReviewPrompt(messages: readonly ConversationMessage[]): boolean {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message.role === 'user') {
			return false;
		}
		if (message.role === 'assistant' && messageText(message.content).includes(REVIEW_PROMPT_VISIBLE_TEXT)) {
			return true;
		}
	}
	return false;
}
