import { AIAvatar } from '../../../components/icons/logos';
import clsx from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
	LoaderCircle,
	Check,
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	MessageSquare,
	Image as ImageIcon,
	FileAudio,
	FileVideo,
	Box,
	Type,
	Paperclip,
	RefreshCcw,
} from 'lucide-react';
import type { ToolEvent } from '../utils/message-helpers';
import type { ConversationAction, ConversationMessage } from '@/api-types';
import { useState, useEffect, useRef } from 'react';
import { DebugSessionBubble } from './debug-session-bubble';
import type { ChatAttachmentPreview } from '../utils/chat-attachments';
import { useAppI18n } from '@/i18n';

type ToolPresentation = {
	start: string;
	success: string;
	error: string;
	showResult?: boolean;
	accent?: boolean;
};

type ToolLabelVariant = 'default' | 'playtest';

/**
 * Strip internal system tags that should not be displayed to users
 */
function sanitizeMessageForDisplay(message: string): string {
	// Remove <system_context>...</system_context> tags and their content
	return message.replace(/<system_context>[\s\S]*?<\/system_context>\n/gi, '').trim();
}

function getAttachmentIcon(attachment: ChatAttachmentPreview) {
	switch (attachment.category) {
		case 'images':
			return ImageIcon;
		case 'video':
			return FileVideo;
		case 'audio':
			return FileAudio;
		case '3d':
			return Box;
		case 'fonts':
			return Type;
		default:
			return Paperclip;
	}
}

function getAttachmentLabel(attachment: ChatAttachmentPreview): string {
	switch (attachment.category) {
		case 'images':
			return 'Image';
		case 'video':
			return 'Video';
		case 'audio':
			return 'Audio';
		case '3d':
			return '3D Asset';
		case 'fonts':
			return 'Font';
		default:
			return 'File';
	}
}

function UserMessageImageAttachmentCard({
	attachment,
	onClick,
}: {
	attachment: ChatAttachmentPreview;
	onClick?: (attachment: ChatAttachmentPreview) => void;
}) {
	const { t } = useAppI18n();
	return (
		<button
			type="button"
			onClick={() => onClick?.(attachment)}
			className="group flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border-primary bg-bg-2 text-left transition-colors hover:border-accent/60"
		>
			<div className="relative aspect-[4/3] overflow-hidden bg-bg-1">
				{attachment.previewUrl ? (
					<img
						src={attachment.previewUrl}
						alt={attachment.filename}
						className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
						loading="lazy"
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center">
						<ImageIcon className="size-8 text-text-50/40" />
					</div>
				)}
			</div>
			<div className="flex min-w-0 items-center gap-2 px-3 py-2">
				<ImageIcon className="size-3.5 shrink-0 text-accent" />
				<div className="min-w-0">
					<p className="truncate text-xs font-medium text-text-primary" title={attachment.filename}>
						{attachment.filename}
					</p>
					<p className="text-[10px] text-text-secondary">
						{t('Open in assets')}
					</p>
				</div>
			</div>
		</button>
	);
}

function UserMessageFileAttachmentCard({
	attachment,
	onClick,
}: {
	attachment: ChatAttachmentPreview;
	onClick?: (attachment: ChatAttachmentPreview) => void;
}) {
	const { t } = useAppI18n();
	const Icon = getAttachmentIcon(attachment);
	const label = t(getAttachmentLabel(attachment));

	return (
		<button
			type="button"
			onClick={() => onClick?.(attachment)}
			className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-border-primary bg-bg-2 px-3 py-2 text-left transition-colors hover:border-accent/60"
		>
			<div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-bg-1 text-accent">
				<Icon className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<p className="truncate text-xs font-medium text-text-primary" title={attachment.filename}>
						{attachment.filename}
					</p>
					<span className="shrink-0 rounded-full bg-bg-1 px-1.5 py-0.5 text-[10px] text-text-secondary">
						{label}
					</span>
				</div>
				<p className="text-[10px] text-text-secondary">
					{t('Open in assets')}
				</p>
			</div>
		</button>
	);
}

function UserMessageAttachments({
	attachments,
	onAttachmentClick,
}: {
	attachments: ChatAttachmentPreview[];
	onAttachmentClick?: (attachment: ChatAttachmentPreview) => void;
}) {
	if (attachments.length === 0) return null;

	const imageAttachments = attachments.filter((attachment) => attachment.category === 'images');
	const otherAttachments = attachments.filter((attachment) => attachment.category !== 'images');

	return (
		<div className="flex flex-col gap-2">
			{imageAttachments.length > 0 && (
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{imageAttachments.map((attachment) => (
						<UserMessageImageAttachmentCard
							key={attachment.id}
							attachment={attachment}
							onClick={onAttachmentClick}
						/>
					))}
				</div>
			)}
			{otherAttachments.length > 0 && (
				<div className="flex flex-col gap-2">
					{otherAttachments.map((attachment) => (
						<UserMessageFileAttachmentCard
							key={attachment.id}
							attachment={attachment}
							onClick={onAttachmentClick}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export function UserMessage({
	message,
	attachments = [],
	onAttachmentClick,
}: {
	message: string;
	attachments?: ChatAttachmentPreview[];
	onAttachmentClick?: (attachment: ChatAttachmentPreview) => void;
}) {
	const { t } = useAppI18n();
	const sanitizedMessage = sanitizeMessageForDisplay(message);
	const shouldRenderText = sanitizedMessage.trim() !== '' && !(attachments.length > 0 && sanitizedMessage.trim() === '(Attached media)');
	
	return (
		<div className="flex min-w-0 gap-3 overflow-hidden">
			<div className="shrink-0 align-text-top pl-1">
				<div className="size-6 flex items-center justify-center rounded-full bg-accent text-text-on-brand">
					<span className="text-xs">U</span>
				</div>
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="font-medium text-text-50">{t('You')}</div>
				{shouldRenderText && (
					<Markdown className="text-text-primary/80">{sanitizedMessage}</Markdown>
				)}
				<UserMessageAttachments
					attachments={attachments}
					onAttachmentClick={onAttachmentClick}
				/>
			</div>
		</div>
	);
}

type ContentItem = 
	| { type: 'text'; content: string; key: string }
	| { type: 'tool'; event: ToolEvent; key: string };

function JsonRenderer({ data }: { data: unknown }) {
	if (typeof data !== 'object' || data === null) {
		return <span className="text-text-primary whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{String(data)}</span>;
	}

	return (
		<div className="flex min-w-0 max-w-full flex-col gap-1 overflow-hidden">
			{Object.entries(data).map(([key, value]) => (
				<div key={key} className="flex min-w-0 gap-2">
					<span className="max-w-[40%] flex-shrink-0 truncate text-accent font-medium" title={key}>{key}:</span>
					{typeof value === 'object' && value !== null ? (
						<div className="min-w-0 flex-1">
							<JsonRenderer data={value} />
						</div>
					) : (
						<span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-text-primary [overflow-wrap:anywhere]">
							{String(value)}
						</span>
					)}
				</div>
			))}
		</div>
	);
}

function extractTextContent(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		return content
			.map(item => item.type === 'text' ? item.text : '')
			.join('');
	}
	return '';
}

function getPlaytestToolPresentation(toolName: string): ToolPresentation {
	switch (toolName) {
		case 'deep_debug':
			return {
				start: 'Playtesting the preview',
				success: 'Preview playtested',
				error: "Couldn't finish the playtest",
				showResult: false,
				accent: true,
			};
		case 'read_files':
			return {
				start: 'Reviewing the project',
				success: 'Project reviewed',
				error: "Couldn't review the project",
				showResult: false,
			};
		case 'regenerate_file':
			return {
				start: 'Applying a fix',
				success: 'Fix applied',
				error: "Couldn't apply the fix",
				showResult: false,
			};
		case 'deploy_preview':
			return {
				start: 'Refreshing the preview',
				success: 'Preview refreshed',
				error: "Couldn't refresh the preview",
				showResult: false,
			};
		case 'run_analysis':
			return {
				start: 'Checking stability',
				success: 'Stability checked',
				error: 'Stability check failed',
				showResult: false,
			};
		case 'wait':
		case 'wait_for_debug':
		case 'wait_for_generation':
			return {
				start: 'Waiting for the preview',
				success: 'Preview ready',
				error: 'Preview wait failed',
				showResult: false,
			};
		case 'get_runtime_errors':
			return {
				start: 'Looking for app issues',
				success: 'App issues checked',
				error: 'Issue check failed',
				showResult: false,
			};
		case 'get_logs':
			return {
				start: 'Reading app signals',
				success: 'App signals checked',
				error: 'Signal check failed',
				showResult: false,
			};
		case 'exec_commands':
			return {
				start: 'Preparing the preview',
				success: 'Preview prepared',
				error: "Couldn't prepare the preview",
				showResult: false,
			};
		case 'generate_files':
			return {
				start: 'Updating the project',
				success: 'Project updated',
				error: "Couldn't update the project",
				showResult: false,
			};
		case 'git':
			return {
				start: 'Saving progress',
				success: 'Progress saved',
				error: "Couldn't save progress",
				showResult: false,
			};
		default:
			return {
				start: 'Improving the playable',
				success: 'Playable improved',
				error: "Couldn't complete this step",
				showResult: false,
			};
	}
}

function getToolPresentation(toolName: string, variant: ToolLabelVariant = 'default'): ToolPresentation {
	if (variant === 'playtest') {
		return getPlaytestToolPresentation(toolName);
	}

	switch (toolName) {
		case 'queue_request':
			return {
				start: 'Adding your note',
				success: 'Added to current build',
				error: "Couldn't add your note",
				showResult: false,
			};
		case 'deep_debug':
			return {
				start: 'Playtesting the preview',
				success: 'Preview playtested',
				error: "Couldn't finish the playtest",
				showResult: false,
				accent: true,
			};
		default: {
			return {
				start: 'Working on this step',
				success: 'Step completed',
				error: 'Step failed',
				showResult: true,
			};
		}
	}
}

function isDisplayableToolResult(result?: string): result is string {
	if (!result) return false;
	const normalized = result.trim().toLowerCase();
	return normalized !== 'null' && normalized !== 'undefined' && normalized !== '""';
}

function convertToToolEvent(msg: ConversationMessage, idx: number): ToolEvent | null {
	if (msg.role !== 'tool' || !('name' in msg) || !msg.name) return null;
	
	return {
		name: msg.name,
		status: 'success',
		timestamp: Date.now() + idx,
		result: extractTextContent(msg.content),
	};
}

export function MessageContentRenderer({ 
	content, 
	toolEvents = [],
	allowToolDetails = true,
	toolLabelVariant = 'default',
}: { 
	content: string;
	toolEvents?: ToolEvent[];
	allowToolDetails?: boolean;
	toolLabelVariant?: ToolLabelVariant;
}) {
	const { t } = useAppI18n();
	const inlineToolEvents = toolEvents.filter(ev => ev.contentLength !== undefined)
		.sort((a, b) => (a.contentLength ?? 0) - (b.contentLength ?? 0));
	
	const orderedContent = buildOrderedContent(content, inlineToolEvents);
	
	if (orderedContent.length === 0) return null;
	
	return (
		<div className="flex flex-col gap-2">
			{orderedContent.map((item) => (
				item.type === 'text' ? (
					<Markdown key={item.key} className="a-tag">
						{item.content}
					</Markdown>
				) : (
					<div key={item.key} className="my-1">
						<ToolStatusIndicator
							event={item.event}
							allowDetails={allowToolDetails}
							labelVariant={toolLabelVariant}
							t={t}
						/>
					</div>
				)
			))}
		</div>
	);
}

function DeepDebugTranscript({ transcript }: { transcript: ConversationMessage[] }) {
	const { t } = useAppI18n();
	// Build map of tool results by tool_call_id for matching
	const toolResultsMap = new Map<string, ToolEvent>();
	transcript.forEach((msg, idx) => {
		if (msg.role === 'tool' && 'tool_call_id' in msg) {
			const toolCallId = (msg as { tool_call_id?: string }).tool_call_id;
			if (toolCallId && typeof toolCallId === 'string') {
				const toolEvent = convertToToolEvent(msg, idx);
				if (toolEvent) toolResultsMap.set(toolCallId, toolEvent);
			}
		}
	});
	
	return (
		<div className="flex flex-col gap-3 p-3 rounded-md bg-surface-tertiary/50 border-l-2 border-accent/30">
			<div className="flex items-center gap-2 text-xs font-medium text-accent">
				<MessageSquare className="size-3" />
				<span>{t('Deep Debugger Transcript')}</span>
			</div>
			{transcript.map((msg, idx) => {
				if (msg.role === 'tool') return null; // Tool results rendered with assistant messages
				
				const text = extractTextContent(msg.content);
				if (!text) return null;
				
				if (msg.role === 'assistant') {
					// Match tool_calls with their results
					const toolEvents: ToolEvent[] = msg.tool_calls?.map(tc => {
						const funcName = 'function' in tc ? tc.function.name : 'unknown_tool';
						const matchedResult = toolResultsMap.get(tc.id);
						return matchedResult || {
							name: funcName,
							status: 'start' as const,
							timestamp: Date.now() + idx,
							contentLength: 0,
						};
					}) || [];
					
					return (
						<div key={`${msg.conversationId}-${idx}`} className="text-xs">
							<MessageContentRenderer content={text} toolEvents={toolEvents} />
						</div>
					);
				}
				
				return null;
			})}
		</div>
	);
}

function ToolResultRenderer({ result, toolName }: { result: string; toolName: string }) {
	try {
		const parsed = JSON.parse(result);
		
		// Special handling for deep_debug transcript
		if (toolName === 'deep_debug' && Array.isArray(parsed.transcript)) {
			return <DeepDebugTranscript transcript={parsed.transcript} />;
		}
		
		return <JsonRenderer data={parsed} />;
	} catch {
		return <div className="max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{result}</div>;
	}
}

export function ToolStatusIndicator({
	event,
	allowDetails = true,
	labelVariant = 'default',
	t: translate,
}: {
	event: ToolEvent;
	allowDetails?: boolean;
	labelVariant?: ToolLabelVariant;
	t?: (id: string, values?: Record<string, unknown>) => string;
}) {
	const i18n = useAppI18n();
	const t = translate ?? i18n.t;
	const [isExpanded, setIsExpanded] = useState(false);
	const presentation = getToolPresentation(event.name, labelVariant);
	const hasResult = allowDetails && event.status === 'success' && presentation.showResult !== false && isDisplayableToolResult(event.result);
	
	const statusText = event.status === 'start' ? presentation.start :
	                   event.status === 'success' ? presentation.success :
	                   presentation.error;
	const translatedStatusText = t(statusText);
	
	const StatusIcon = event.status === 'start' ? LoaderCircle : 
	                   event.status === 'success' ? Check : 
	                   AlertTriangle;
	
	const iconClass = event.status === 'start' ? 'size-3 animate-spin' : 'size-3';
	
	return (
		<div className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden">
			<button
				onClick={() => hasResult && setIsExpanded(!isExpanded)}
				className={clsx(
					'flex min-w-0 items-center gap-1.5 text-xs',
					presentation.accent ? 'text-accent font-medium' : 'text-text-tertiary',
					hasResult && 'cursor-pointer hover:text-text-secondary transition-colors'
				)}
				disabled={!hasResult}
			>
				<StatusIcon className={clsx(iconClass, 'shrink-0')} />
				<span className="min-w-0 truncate tracking-tight">{translatedStatusText}</span>
				{hasResult && (
					isExpanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />
				)}
			</button>
			
			{isExpanded && hasResult && event.result && (
				<div className={clsx(
					'max-w-full overflow-auto rounded-md border p-3 text-xs font-mono',
					event.name === 'deep_debug'
						? 'bg-surface-tertiary/30 border-accent/20 max-h-[600px]'
						: 'bg-surface-secondary border-border max-h-96'
				)}>
					<ToolResultRenderer result={event.result} toolName={event.name} />
				</div>
			)}
		</div>
	);
}

function buildOrderedContent(message: string, inlineToolEvents: ToolEvent[]): ContentItem[] {
	if (!inlineToolEvents.length) {
		return message ? [{ type: 'text', content: message, key: 'content-0' }] : [];
	}

	const items: ContentItem[] = [];
	let lastPos = 0;
	
	for (const event of inlineToolEvents) {
		const pos = event.contentLength ?? 0;
		
		// Add text before this event
		if (pos > lastPos && message.slice(lastPos, pos)) {
			items.push({ type: 'text', content: message.slice(lastPos, pos), key: `text-${lastPos}` });
		}
		
		// Add event
		items.push({ type: 'tool', event, key: `tool-${event.timestamp}` });
		lastPos = pos;
	}
	
	// Add remaining text
	if (lastPos < message.length && message.slice(lastPos)) {
		items.push({ type: 'text', content: message.slice(lastPos), key: `text-${lastPos}` });
	}
	
	return items;
}

export function AIMessage({
	message,
	isThinking,
	toolEvents = [],
	action,
	onAction,
	actionDisabled,
}: {
	message: string;
	isThinking?: boolean;
	toolEvents?: ToolEvent[];
	action?: ConversationAction;
	onAction?: (action: ConversationAction) => void;
	actionDisabled?: boolean;
}) {
	const { t } = useAppI18n();
	const sanitizedMessage = sanitizeMessageForDisplay(message);
	
	// Check if this is a debug session (active or just completed in this session)
	const debugEvent = toolEvents.find(ev => ev.name === 'deep_debug');
	const isActiveDebug = debugEvent?.status === 'start';
	const isCompletedDebug = debugEvent?.status === 'success' || debugEvent?.status === 'error';
	
	// Check if this is a live session with actual content
	const hasInlineEvents = toolEvents.some(ev => ev.contentLength !== undefined);
	const hasToolCalls = toolEvents.some(ev => ev.name !== 'deep_debug');
	
	// Only show bubble if: actively debugging OR (completed/errored with actual content/tool calls and inline events)
	const isLiveDebugSession = debugEvent && (
		isActiveDebug || 
		(isCompletedDebug && hasInlineEvents && hasToolCalls)
	);
	
	// Calculate elapsed time for active debug sessions
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const startTimeRef = useRef<number | null>(null);
	
	useEffect(() => {
		if (!isActiveDebug) {
			startTimeRef.current = null;
			setElapsedSeconds(0);
			return;
		}
		
		if (!startTimeRef.current) {
			startTimeRef.current = Date.now();
		}
		
		const interval = setInterval(() => {
			if (startTimeRef.current) {
				const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
				setElapsedSeconds(elapsed);
			}
		}, 1000);
		
		return () => clearInterval(interval);
	}, [isActiveDebug]);
	
	// Render debug bubble for live debug sessions (active or just completed)
	// Don't show for old messages after page refresh (no inline events)
	if (isLiveDebugSession) {
		const toolCallCount = toolEvents.filter(e => e.name !== 'deep_debug').length;
		
		return (
			<DebugSessionBubble
				message={{
					conversationId: 'debug-session',
					role: 'assistant' as const,
					content: sanitizedMessage,
					ui: { toolEvents }
				}}
				isActive={isActiveDebug}
				elapsedSeconds={elapsedSeconds}
				toolCallCount={toolCallCount}
			/>
		);
	}
	
	// Separate: events without contentLength = top (restored), with contentLength = inline (streaming)
	const topToolEvents = toolEvents.filter(ev => ev.contentLength === undefined);
	const inlineToolEvents = toolEvents.filter(ev => ev.contentLength !== undefined)
		.sort((a, b) => (a.contentLength ?? 0) - (b.contentLength ?? 0));
	
	const orderedContent = buildOrderedContent(sanitizedMessage, inlineToolEvents);
	
	// Don't render if completely empty
	if (!sanitizedMessage && !topToolEvents.length && !orderedContent.length) {
		return null;
	}
	
	return (
		<div className="flex min-w-0 gap-3 overflow-hidden">
			<div className="shrink-0 align-text-top pl-1">
				<AIAvatar className="size-6" />
			</div>
			<div className="flex min-w-0 flex-1 flex-col gap-2">
				<div className="font-mono font-medium text-text-50">Buzz</div>
				
				{/* Message content with inline tool events (from streaming) */}
				{orderedContent.length > 0 && (
					<div className={clsx(isThinking && 'animate-pulse')}>
						<MessageContentRenderer content={sanitizedMessage} toolEvents={inlineToolEvents} />
					</div>
				)}
				
				{/* Completed tools (from restoration) - shown at end */}
				{topToolEvents.length > 0 && (
					<div className="flex flex-col gap-1.5 mt-1">
						{topToolEvents.map((ev) => (
							<ToolStatusIndicator key={`${ev.name}-${ev.timestamp}`} event={ev} t={t} />
						))}
					</div>
				)}

				{action && (
					<button
						type="button"
						onClick={() => onAction?.(action)}
						disabled={actionDisabled}
						className={clsx(
							'mt-1 inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-border-primary bg-bg-2 px-2.5 text-xs font-medium text-text-primary transition-colors',
							actionDisabled
								? 'cursor-not-allowed opacity-50'
								: 'hover:border-accent/60 hover:bg-bg-1',
						)}
					>
						<RefreshCcw className="size-3.5" />
						{action.label}
					</button>
				)}
			</div>
		</div>
	);
}

interface MarkdownProps extends React.ComponentProps<'article'> {
	children: string;
}

export function Markdown({ children, className, ...props }: MarkdownProps) {
	return (
		<article
			className={clsx('prose prose-sm prose-teal min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere] [&_*]:max-w-full [&_a]:break-words [&_a]:[overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_table]:w-full [&_td]:break-words [&_th]:break-words', className)}
			{...props}
		>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					a: ({ children: linkChildren }) => <span>{linkChildren}</span>,
					pre: ({ children: preChildren, className: preClassName, ...preProps }) => (
						<pre
							className={clsx('max-w-full overflow-x-auto whitespace-pre', preClassName)}
							{...preProps}
						>
							{preChildren}
						</pre>
					),
					table: ({ children: tableChildren, ...tableProps }) => (
						<div className="max-w-full overflow-x-auto">
							<table {...tableProps}>{tableChildren}</table>
						</div>
					),
				}}
			>
				{children}
			</ReactMarkdown>
		</article>
	);
}
