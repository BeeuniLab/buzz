import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import {
	type ImageAttachment,
	isSupportedImageType,
	isSupportedChatMediaType,
	MAX_IMAGE_SIZE_BYTES,
	MAX_IMAGES_PER_MESSAGE,
	MAX_CHAT_MEDIA_PER_MESSAGE,
	SUPPORTED_IMAGE_MIME_TYPES,
	SUPPORTED_CHAT_MEDIA_MIME_TYPES,
	validateChatMediaAttachments,
} from '@/api-types';

export type ChatUploadMode = 'images-only' | 'chat-media';

export interface UseImageUploadOptions {
	maxFiles?: number;
	maxSizeBytes?: number;
	onError?: (error: string) => void;
	/** `images-only` (default): home / blueprint. `chat-media`: images + audio + video in chat. */
	mode?: ChatUploadMode;
}

export interface UseImageUploadReturn {
	images: ImageAttachment[];
	addImages: (files: File[]) => Promise<void>;
	removeImage: (id: string) => void;
	clearImages: () => void;
	isProcessing: boolean;
}

function supportedMimeTypes(mode: ChatUploadMode): readonly string[] {
	return mode === 'chat-media' ? SUPPORTED_CHAT_MEDIA_MIME_TYPES : SUPPORTED_IMAGE_MIME_TYPES;
}

function isAllowedMime(mimeType: string, mode: ChatUploadMode): boolean {
	return mode === 'chat-media' ? isSupportedChatMediaType(mimeType) : isSupportedImageType(mimeType);
}

/**
 * File attachments for create-flow (images only) or chat (images + audio + video).
 */
export function useImageUpload(options: UseImageUploadOptions = {}): UseImageUploadReturn {
	const {
		maxFiles,
		maxSizeBytes = MAX_IMAGE_SIZE_BYTES,
		onError,
		mode = 'images-only',
	} = options;

	const maxCount = maxFiles ?? (mode === 'chat-media' ? MAX_CHAT_MEDIA_PER_MESSAGE : MAX_IMAGES_PER_MESSAGE);

	const [images, setImages] = useState<ImageAttachment[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);

	const processFile = useCallback(
		async (file: File): Promise<ImageAttachment | null> => {
			if (!isAllowedMime(file.type, mode)) {
				const allowed = supportedMimeTypes(mode)
					.map((t) => t.split('/')[1] || t)
					.join(', ');
				const errorMsg = `Unsupported file type: ${file.type}. Allowed: ${allowed}`;
				toast.error(errorMsg);
				onError?.(errorMsg);
				return null;
			}

			if (file.size > maxSizeBytes) {
				const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
				const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
				const errorMsg = `File too large: ${fileSizeMB}MB. Maximum allowed is ${maxSizeMB}MB.`;
				toast.error(errorMsg);
				onError?.(errorMsg);
				return null;
			}

			return new Promise((resolve, reject) => {
				const reader = new FileReader();

				reader.onload = (e) => {
					try {
						const result = e.target?.result as string;
						if (!result) {
							reject(new Error('Failed to read file'));
							return;
						}

						const base64Data = result.split(',')[1];
						const mimeType = file.type as ImageAttachment['mimeType'];

						const base: Omit<ImageAttachment, 'dimensions'> = {
							id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
							filename: file.name,
							mimeType,
							base64Data,
							size: file.size,
						};

						if (!mimeType.startsWith('image/')) {
							resolve(base);
							return;
						}

						const img = new Image();
						img.onload = () => {
							resolve({
								...base,
								dimensions: { width: img.width, height: img.height },
							});
						};
						img.onerror = () => {
							resolve(base);
						};
						img.src = result;
					} catch (error) {
						reject(error);
					}
				};

				reader.onerror = () => {
					reject(new Error(`Failed to read file: ${file.name}`));
				};

				reader.readAsDataURL(file);
			});
		},
		[maxSizeBytes, mode, onError],
	);

	const addImages = useCallback(
		async (files: File[]) => {
			setIsProcessing(true);

			try {
				if (maxFiles && images.length + files.length > maxFiles) {
					const errorMsg = `Maximum ${maxFiles} file(s) allowed per message.`;
					toast.error(errorMsg);
					onError?.(errorMsg);
					return;
				}

				if (mode === 'chat-media') {
					const limitError = validateChatMediaAttachments(
						[
							...images,
							...files.map((file) => ({
								filename: file.name,
								mimeType: file.type,
								size: file.size,
							})),
						],
						{ maxSizeBytes },
					);
					if (limitError) {
						toast.error(limitError);
						onError?.(limitError);
						return;
					}
				} else if (images.length + files.length > maxCount) {
					const errorMsg = `Maximum ${maxCount} image(s) allowed per message.`;
					toast.error(errorMsg);
					onError?.(errorMsg);
					return;
				}

				const processed = await Promise.all(files.map((file) => processFile(file)));
				const valid = processed.filter((img): img is ImageAttachment => img !== null);

				if (valid.length > 0) {
					setImages((prev) => [...prev, ...valid]);
				}
			} catch (error) {
				onError?.(error instanceof Error ? error.message : 'Failed to process files');
			} finally {
				setIsProcessing(false);
			}
		},
		[images, maxCount, maxFiles, maxSizeBytes, mode, processFile, onError],
	);

	const removeImage = useCallback((id: string) => {
		setImages((prev) => prev.filter((img) => img.id !== id));
	}, []);

	const clearImages = useCallback(() => {
		setImages([]);
	}, []);

	return {
		images,
		addImages,
		removeImage,
		clearImages,
		isProcessing,
	};
}
