import { useRef, type ChangeEvent } from 'react';
import { ChevronDown, Image as ImageLucide, Music, Paperclip, Video } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SUPPORTED_CHAT_MEDIA_MIME_TYPES } from '@/api-types';

const CHAT_ACCEPT_IMAGES = SUPPORTED_CHAT_MEDIA_MIME_TYPES.filter((m) => m.startsWith('image/')).join(',');
const CHAT_ACCEPT_AUDIO = SUPPORTED_CHAT_MEDIA_MIME_TYPES.filter((m) => m.startsWith('audio/')).join(',');
const CHAT_ACCEPT_VIDEO = SUPPORTED_CHAT_MEDIA_MIME_TYPES.filter((m) => m.startsWith('video/')).join(',');

export interface AttachmentPickerDropdownProps {
	onFilesSelected: (files: File[]) => void;
	disabled?: boolean;
	/** Disable hidden inputs only (e.g. when parent UI is locked) */
	inputsDisabled?: boolean;
	triggerClassName?: string;
	menuAlign?: 'start' | 'end' | 'center';
	showChevron?: boolean;
}

/**
 * Chat / create-flow: pick images, audio, or video via separate file inputs (clear OS picker filters).
 */
export function AttachmentPickerDropdown({
	onFilesSelected,
	disabled = false,
	inputsDisabled = false,
	triggerClassName = 'p-1.5 rounded-md hover:bg-bg-3 text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-0.5',
	menuAlign = 'end',
	showChevron = true,
}: AttachmentPickerDropdownProps) {
	const fileInputImageRef = useRef<HTMLInputElement>(null);
	const fileInputAudioRef = useRef<HTMLInputElement>(null);
	const fileInputVideoRef = useRef<HTMLInputElement>(null);
	const inputsOff = inputsDisabled || disabled;

	const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		if (files.length > 0) {
			onFilesSelected(files);
		}
		e.target.value = '';
	};

	return (
		<>
			<input
				ref={fileInputImageRef}
				type="file"
				accept={CHAT_ACCEPT_IMAGES}
				multiple
				onChange={handleChange}
				className="hidden"
				disabled={inputsOff}
			/>
			<input
				ref={fileInputAudioRef}
				type="file"
				accept={CHAT_ACCEPT_AUDIO}
				onChange={handleChange}
				className="hidden"
				disabled={inputsOff}
			/>
			<input
				ref={fileInputVideoRef}
				type="file"
				accept={CHAT_ACCEPT_VIDEO}
				onChange={handleChange}
				className="hidden"
				disabled={inputsOff}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						className={triggerClassName}
						aria-label="Attach files"
						title="Attach image, audio, or video"
					>
						<Paperclip className="size-4" strokeWidth={1.75} />
						{showChevron ? <ChevronDown className="size-3 opacity-70" strokeWidth={2} /> : null}
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align={menuAlign} className="min-w-[200px]">
					<DropdownMenuItem
						disabled={disabled}
						onSelect={() => {
							fileInputImageRef.current?.click();
						}}
						className="gap-2"
					>
						<ImageLucide className="size-4" strokeWidth={1.75} />
						Images
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={disabled}
						onSelect={() => {
							fileInputAudioRef.current?.click();
						}}
						className="gap-2"
					>
						<Music className="size-4" strokeWidth={1.75} />
						Audio
					</DropdownMenuItem>
					<DropdownMenuItem
						disabled={disabled}
						onSelect={() => {
							fileInputVideoRef.current?.click();
						}}
						className="gap-2"
					>
						<Video className="size-4" strokeWidth={1.75} />
						Video
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}
