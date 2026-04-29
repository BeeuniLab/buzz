import { type FormEvent, type RefObject } from 'react';
import { SendHorizontal, X } from 'lucide-react';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { AttachmentPickerDropdown } from '@/components/attachment-picker-dropdown';
import { type ImageAttachment } from '@/api-types';

const MAX_WORDS = 4000;
const countWords = (text: string): number => {
	return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
};

interface ChatInputProps {
	// Form state
	newMessage: string;
	onMessageChange: (message: string) => void;
	onSubmit: (e: FormEvent) => void;

	// Image upload
	images: ImageAttachment[];
	onAddImages: (files: File[]) => void;
	onRemoveImage: (id: string) => void;
	isProcessing: boolean;

	// Drag and drop
	isChatDragging: boolean;
	chatDragHandlers: {
		onDragEnter: (e: React.DragEvent) => void;
		onDragLeave: (e: React.DragEvent) => void;
		onDragOver: (e: React.DragEvent) => void;
		onDrop: (e: React.DragEvent) => void;
	};

	// Disabled states
	isChatDisabled: boolean;
	isRunning: boolean;
	canStopCurrentTask: boolean;
	isConversationProcessing: boolean;
	isDebugging: boolean;
	onStopCurrentTask: () => void;

	// Refs
	chatFormRef: RefObject<HTMLFormElement | null>;
}

export function ChatInput({
	newMessage,
	onMessageChange,
	onSubmit,
	images,
	onAddImages,
	onRemoveImage,
	isProcessing,
	isChatDragging,
	chatDragHandlers,
	isChatDisabled,
	isRunning,
	canStopCurrentTask,
	isConversationProcessing,
	isDebugging,
	onStopCurrentTask,
	chatFormRef,
}: ChatInputProps) {
	const attachDisabled = isChatDisabled || isProcessing;

	const handleTextChange = (newValue: string) => {
		const newWordCount = countWords(newValue);

		// Only update if within word limit
		if (newWordCount <= MAX_WORDS) {
			onMessageChange(newValue);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (isChatDisabled) {
			return;
		}

		if (e.key === 'Enter') {
			if (!e.shiftKey) {
				// Submit on Enter without Shift
				e.preventDefault();
				onSubmit(e as unknown as FormEvent);
			}
			// Shift+Enter will create a new line (default textarea behavior)
		}
	};

	const handleStopGeneration = () => {
		onStopCurrentTask();
	};

	const placeholder = isDebugging
		? 'Deep debugging in progress... Please abort to continue'
		: isConversationProcessing
			? 'Working on your message... Stop or wait to continue'
			: isChatDisabled
				? isRunning
					? 'Task running... Stop or wait to continue'
					: 'Please wait for blueprint completion...'
				: isRunning
					? 'Chat with AI while generating...'
					: 'Chat with AI...';

	return (
		<form
			ref={chatFormRef}
			onSubmit={onSubmit}
			className="shrink-0 p-4 pb-1 md:pb-5 bg-transparent"
			{...chatDragHandlers}
		>
			<div className="relative">
				{isChatDragging && (
					<div className="absolute inset-0 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-xl z-50 pointer-events-none">
						<p className="text-accent font-medium">Drop images, audio, or video here</p>
					</div>
				)}
				{images.length > 0 && (
					<div className="mb-2">
						<ImageAttachmentPreview
							images={images}
							onRemove={onRemoveImage}
							compact
						/>
					</div>
				)}
				<textarea
					value={newMessage}
					onChange={(e) => {
						handleTextChange(e.target.value);
						const ta = e.currentTarget;
						ta.style.height = 'auto';
						ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
					}}
					onKeyDown={handleKeyDown}
					disabled={isChatDisabled}
					placeholder={placeholder}
					rows={2}
					className="w-full bg-bg-2 border border-text-primary/10 rounded-xl px-3 pr-20 py-2 text-sm outline-none focus:border-white/20 drop-shadow-2xl text-text-primary placeholder:text-text-primary/50! disabled:opacity-50 disabled:cursor-not-allowed resize-none overflow-y-auto no-scrollbar min-h-[80px] md:min-h-[36px] max-h-[120px]"
					style={{
						height: 'auto',
						minHeight: undefined
					}}
					ref={(textarea) => {
						if (textarea) {
							// Auto-resize textarea based on content
							textarea.style.height = 'auto';
							textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
						}
					}}
				/>
				<div className="absolute right-1.5 bottom-2.5 flex items-center gap-1">
					{canStopCurrentTask && (
						<button
							type="button"
							onClick={handleStopGeneration}
							className="p-1.5 rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-500 transition-all duration-200 group relative"
							aria-label="Stop generation"
							title="Stop generation"
						>
							<X className="size-4" strokeWidth={2} />
							<span className="absolute -top-8 right-0 px-2 py-1 bg-bg-1 border border-border-primary rounded text-xs text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
								Stop
							</span>
						</button>
					)}
					<AttachmentPickerDropdown
						onFilesSelected={(files) => {
							void onAddImages(files);
						}}
						disabled={attachDisabled}
						inputsDisabled={isChatDisabled}
					/>
					<button
						type="submit"
						disabled={(!newMessage.trim() && images.length === 0) || isChatDisabled}
						className="group/send grid size-7 place-items-center rounded-md border border-text-primary bg-accent text-text-primary shadow-neo-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-neo-yellow hover:shadow-neo disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-text-primary/10 disabled:bg-bg-3/70 disabled:text-text-primary/30 disabled:shadow-none"
						aria-label="Send message"
						title="Send message"
					>
						<SendHorizontal className="size-3.5 transition-transform duration-200 group-hover/send:translate-x-0.5" strokeWidth={2.4} />
					</button>
				</div>
			</div>
		</form>
	);
}
