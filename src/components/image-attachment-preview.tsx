import { X, FileAudio, FileVideo } from 'lucide-react';
import type { ImageAttachment } from '@/api-types';
import { motion, AnimatePresence } from 'framer-motion';

export interface ImageAttachmentPreviewProps {
	images: ImageAttachment[];
	onRemove?: (id: string) => void;
	className?: string;
	compact?: boolean;
}

function MediaBadge({ attachment, compact }: { attachment: ImageAttachment; compact: boolean }) {
	if (attachment.mimeType.startsWith('image/')) {
		return (
			<img
				src={`data:${attachment.mimeType};base64,${attachment.base64Data}`}
				alt={attachment.filename}
				className="h-full w-full object-cover"
			/>
		);
	}
	const Icon = attachment.mimeType.startsWith('video/') ? FileVideo : FileAudio;
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-0.5 bg-bg-2 p-1 text-text-secondary">
			<Icon className={compact ? 'size-5' : 'size-8'} strokeWidth={1.5} />
			{!compact && (
				<span className="max-w-full truncate px-0.5 text-center text-[9px] leading-tight">
					{attachment.filename}
				</span>
			)}
		</div>
	);
}

/**
 * Previews chat attachments: image thumbnails; audio/video as icon tiles.
 */
export function ImageAttachmentPreview({
	images,
	onRemove,
	className = '',
	compact = false,
}: ImageAttachmentPreviewProps) {
	if (images.length === 0) return null;

	return (
		<div className={`flex flex-wrap gap-2 ${className}`}>
			<AnimatePresence mode="popLayout">
				{images.map((attachment) => (
					<motion.div
						key={attachment.id}
						initial={{ opacity: 0, scale: 0.8 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.8 }}
						transition={{ duration: 0.2 }}
						className={`group relative ${compact ? 'h-14 w-14 rounded-xl' : 'h-20 w-20 rounded-lg'} overflow-hidden border border-border-primary bg-bg-3`}
					>
						<MediaBadge attachment={attachment} compact={compact} />
						{onRemove && (
							<button
								type="button"
								onClick={() => onRemove(attachment.id)}
								className={`absolute right-1 top-1 grid size-5 place-items-center rounded-full border border-[var(--neo-border-color)] bg-bg-1/95 text-text-primary shadow-[1px_1px_0px_0px_var(--neo-border-color)] transition-opacity hover:bg-bg-1 ${compact ? 'opacity-95' : 'opacity-95 sm:opacity-0 sm:group-hover:opacity-100'}`}
								aria-label={`Remove ${attachment.filename}`}
							>
								<X className="size-3" />
							</button>
						)}
						{!compact && attachment.mimeType.startsWith('image/') && (
							<div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-bg-1/90 to-transparent p-1">
								<p className="text-[10px] text-text-secondary truncate">{attachment.filename}</p>
							</div>
						)}
					</motion.div>
				))}
			</AnimatePresence>
		</div>
	);
}
