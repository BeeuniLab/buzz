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
				className="w-full h-full object-cover"
			/>
		);
	}
	const Icon = attachment.mimeType.startsWith('video/') ? FileVideo : FileAudio;
	return (
		<div className="w-full h-full flex flex-col items-center justify-center gap-0.5 bg-bg-2 text-text-secondary p-1">
			<Icon className={compact ? 'size-5' : 'size-8'} strokeWidth={1.5} />
			{!compact && (
				<span className="text-[9px] leading-tight text-center truncate max-w-full px-0.5">
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
						className={`relative group ${compact ? 'w-14 h-14 rounded-xl' : 'w-20 h-20 rounded-lg'} overflow-hidden border border-border-primary bg-bg-3`}
					>
						<MediaBadge attachment={attachment} compact={compact} />
						{onRemove && (
							<button
								type="button"
								onClick={() => onRemove(attachment.id)}
								className={`absolute top-1 right-1 p-0.5 rounded-full bg-bg-1/90 hover:bg-bg-1 text-text-primary transition-opacity ${compact ? 'opacity-90' : 'opacity-0 group-hover:opacity-100'}`}
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
