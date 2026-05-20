import { type ClipboardEvent, type FormEvent, type RefObject, useState } from 'react';
import { CircleStop, Laugh, SendHorizontal } from 'lucide-react';
import { ImageAttachmentPreview } from '@/components/image-attachment-preview';
import { AttachmentPickerDropdown } from '@/components/attachment-picker-dropdown';
import { CameraCaptureButton } from '@/components/camera-capture-button';
import { KlipyMediaPicker } from '@/components/klipy-media-picker';
import { SUPPORTED_CHAT_MEDIA_MIME_TYPES, type ImageAttachment } from '@/api-types';
import { getClipboardFiles } from '@/utils/clipboard-files';
import { useAppI18n } from '@/i18n';

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
	const { t } = useAppI18n();
	const [isKlipyMediaPickerOpen, setIsKlipyMediaPickerOpen] = useState(false);
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

		const nativeEvent = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
		if (nativeEvent.isComposing || nativeEvent.keyCode === 229) {
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

	const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
		if (attachDisabled) return;

		const files = getClipboardFiles(e.clipboardData, SUPPORTED_CHAT_MEDIA_MIME_TYPES);
		if (files.length === 0) return;

		e.preventDefault();
		onAddImages(files);
	};

	const placeholder = isDebugging
		? t('Deep debugging in progress... Please stop to continue')
		: isConversationProcessing
			? t('Working on your message... Stop or wait to continue')
			: isChatDisabled
				? isRunning
					? t('Task running... Stop or wait to continue')
					: t('Please wait for setup to finish...')
				: isRunning
					? t('Chat with AI while generating...')
					: t('Chat with AI...');

	return (
		<form
			ref={chatFormRef}
			onSubmit={onSubmit}
			className="shrink-0 px-4 pb-1 pt-3 md:pb-5 bg-transparent"
			{...chatDragHandlers}
		>
			<div className="relative rounded-[22px] border border-text-primary/10 bg-bg-2/95 shadow-[0_16px_40px_rgba(0,0,0,0.08)] transition-colors focus-within:border-text-primary/25">
				{isChatDragging && (
					<div className="absolute inset-0 flex items-center justify-center bg-accent/10 backdrop-blur-sm rounded-[22px] z-50 pointer-events-none">
						<p className="text-accent font-medium">{t('Drop images, audio, or video here')}</p>
					</div>
				)}
				{images.length > 0 && (
					<div className="px-3 pt-3">
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
						ta.style.height = Math.min(ta.scrollHeight, 144) + 'px';
					}}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					disabled={isChatDisabled}
					placeholder={placeholder}
					rows={2}
					className="w-full bg-transparent border-0 rounded-t-[22px] px-4 pb-2 pt-4 text-sm leading-6 outline-none text-text-primary placeholder:text-text-tertiary disabled:opacity-100 disabled:cursor-not-allowed resize-none overflow-y-auto no-scrollbar min-h-[72px] md:min-h-[64px] max-h-[144px]"
					style={{
						height: 'auto',
						minHeight: undefined
					}}
					ref={(textarea) => {
						if (textarea) {
							// Auto-resize textarea based on content
							textarea.style.height = 'auto';
							textarea.style.height = Math.min(textarea.scrollHeight, 144) + 'px';
						}
					}}
				/>
				<div className="flex items-center justify-between gap-2 px-3 pb-3">
					<div className="flex min-w-0 items-center gap-1.5">
						<button
							type="button"
							onClick={() => setIsKlipyMediaPickerOpen(true)}
							disabled={attachDisabled}
							className="grid size-8 place-items-center rounded-full bg-neo-pink/80 text-[#1a1a1a] transition-colors hover:bg-neo-pink disabled:cursor-not-allowed disabled:opacity-45"
							aria-label={t('Pick KLIPY media')}
							title={t('Pick KLIPY media')}
						>
							<Laugh className="size-4" strokeWidth={2.1} />
						</button>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						{canStopCurrentTask && (
							<button
								type="button"
								onClick={handleStopGeneration}
								className="group relative grid size-8 place-items-center rounded-full text-red-500 transition-all duration-200 hover:bg-red-500/10"
								aria-label={t('Stop generation')}
								title={t('Stop generation')}
							>
								<CircleStop className="size-5" strokeWidth={2.1} />
								<span className="absolute -top-8 right-0 px-2 py-1 bg-bg-1 border border-border-primary rounded text-xs text-text-secondary whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
									{t('Stop')}
								</span>
							</button>
						)}
						<AttachmentPickerDropdown
							onFilesSelected={(files) => {
								void onAddImages(files);
							}}
							disabled={attachDisabled}
							inputsDisabled={isChatDisabled}
							showChevron={false}
							triggerClassName="grid size-8 place-items-center rounded-full text-text-secondary transition-colors hover:bg-bg-3 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-45"
						/>
						<CameraCaptureButton
							onPhotoCaptured={(files) => onAddImages(files)}
							disabled={attachDisabled}
							variant="ghost"
						/>
						<button
							type="submit"
							disabled={(!newMessage.trim() && images.length === 0) || isChatDisabled}
							className="group/send grid size-8 place-items-center rounded-full border border-text-primary bg-accent text-text-primary shadow-neo-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-neo-yellow hover:shadow-neo disabled:translate-y-0 disabled:cursor-not-allowed disabled:border-text-primary/10 disabled:bg-bg-3/70 disabled:text-text-primary/30 disabled:shadow-none"
							aria-label={t('Send message')}
							title={t('Send message')}
						>
							<SendHorizontal className="size-4 transition-transform duration-200 group-hover/send:translate-x-0.5" strokeWidth={2.4} />
						</button>
					</div>
				</div>
			</div>
			<KlipyMediaPicker
				open={isKlipyMediaPickerOpen}
				onOpenChange={setIsKlipyMediaPickerOpen}
				onFilesSelected={(files) => onAddImages(files)}
				disabled={attachDisabled}
			/>
		</form>
	);
}
