import type { ConversationMessage } from '../../inferutils/common';
import { hasPendingReviewPrompt, REVIEW_PROMPT_CONTENT } from './reviewPrompt';

function msg(role: ConversationMessage['role'], content: string): ConversationMessage {
	return {
		role,
		content,
		conversationId: `${role}-${content.slice(0, 8)}`,
	};
}

describe('review prompt helpers', () => {
	it('detects an unresolved review prompt after the latest user message', () => {
		expect(hasPendingReviewPrompt([
			msg('user', 'make a game'),
			msg('assistant', REVIEW_PROMPT_CONTENT),
		])).toBe(true);
	});

	it('allows a later prompt after the user has responded', () => {
		expect(hasPendingReviewPrompt([
			msg('user', 'make a game'),
			msg('assistant', REVIEW_PROMPT_CONTENT),
			msg('user', 'not now'),
		])).toBe(false);
	});

	it('ignores unrelated assistant messages', () => {
		expect(hasPendingReviewPrompt([
			msg('assistant', 'Build complete'),
		])).toBe(false);
	});
});
