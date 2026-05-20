import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { useAppI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export interface CameraCaptureButtonProps {
	onPhotoCaptured: (files: File[]) => void | Promise<void>;
	disabled?: boolean;
	className?: string;
}

function stopStream(stream: MediaStream | null) {
	stream?.getTracks().forEach((track) => track.stop());
}

function buildCameraFilename() {
	const stamp = new Date()
		.toISOString()
		.replace(/\.\d+Z$/, '')
		.replace(/[:T]/g, '-');
	return `camera-photo-${stamp}.jpg`;
}

export function CameraCaptureButton({
	onPhotoCaptured,
	disabled = false,
	className,
}: CameraCaptureButtonProps) {
	const { t } = useAppI18n();
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const [open, setOpen] = useState(false);
	const [stream, setStream] = useState<MediaStream | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [isCapturing, setIsCapturing] = useState(false);

	const closeCamera = useCallback(() => {
		setOpen(false);
	}, []);

	useEffect(() => {
		if (!open) {
			stopStream(streamRef.current);
			streamRef.current = null;
			setStream(null);
			if (videoRef.current) videoRef.current.srcObject = null;
			return;
		}

		let cancelled = false;
		setIsStarting(true);

		async function startCamera() {
			if (!navigator.mediaDevices?.getUserMedia) {
				toast.error(t('Camera is not available in this browser'));
				setOpen(false);
				return;
			}

			try {
				const nextStream = await navigator.mediaDevices.getUserMedia({
					video: {
						facingMode: { ideal: 'environment' },
						width: { ideal: 1280 },
						height: { ideal: 720 },
					},
					audio: false,
				});

				if (cancelled) {
					stopStream(nextStream);
					return;
				}

				streamRef.current = nextStream;
				setStream(nextStream);
				if (videoRef.current) {
					videoRef.current.srcObject = nextStream;
					await videoRef.current.play();
				}
			} catch (error) {
				console.error('Failed to open camera:', error);
				toast.error(t('Could not open camera'));
				setOpen(false);
			} finally {
				if (!cancelled) setIsStarting(false);
			}
		}

		void startCamera();

		return () => {
			cancelled = true;
		};
	}, [open, t]);

	useEffect(() => () => stopStream(streamRef.current), []);

	const handleCapture = useCallback(async () => {
		const video = videoRef.current;
		if (!video || video.readyState < 2) {
			toast.error(t('Camera is still starting'));
			return;
		}

		const width = video.videoWidth || 1280;
		const height = video.videoHeight || 720;
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) {
			toast.error(t('Could not capture photo'));
			return;
		}

		context.drawImage(video, 0, 0, width, height);
		setIsCapturing(true);
		try {
			const blob = await new Promise<Blob | null>((resolve) => {
				canvas.toBlob(resolve, 'image/jpeg', 0.92);
			});
			if (!blob) throw new Error('canvas.toBlob returned null');

			const file = new File([blob], buildCameraFilename(), { type: 'image/jpeg' });
			await onPhotoCaptured([file]);
			toast.success(t('Photo added'));
			closeCamera();
		} catch (error) {
			console.error('Failed to capture photo:', error);
			toast.error(t('Could not capture photo'));
		} finally {
			setIsCapturing(false);
		}
	}, [closeCamera, onPhotoCaptured, t]);

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				disabled={disabled}
				className={cn(
					'grid size-9 place-items-center rounded-lg border-2 border-[var(--neo-border-color)] bg-bg-4 text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all duration-150 hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] hover:bg-bg-3 hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)] disabled:cursor-not-allowed disabled:opacity-40 dark:text-text-primary dark:hover:text-white',
					className,
				)}
				aria-label={t('Take photo')}
				title={t('Take photo')}
			>
				<Camera className="size-4" strokeWidth={1.9} />
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-w-[calc(100%-1.5rem)] gap-4 p-4 sm:max-w-md sm:p-5" aria-describedby="camera-capture-description">
					<DialogHeader>
						<DialogTitle>{t('Take photo')}</DialogTitle>
						<DialogDescription id="camera-capture-description">
							{t('Use your camera to add a photo as creation material.')}
						</DialogDescription>
					</DialogHeader>

					<div className="relative overflow-hidden rounded-2xl border-2 border-[var(--neo-border-color)] bg-bg-2 shadow-[3px_3px_0px_0px_var(--neo-border-color)]">
						<video
							ref={videoRef}
							className="aspect-[4/3] w-full bg-black object-cover"
							playsInline
							muted
							autoPlay
						/>
						{isStarting && (
							<div className="absolute inset-0 grid place-items-center bg-bg-4/75">
								<div className="flex items-center gap-2 rounded-xl border-2 border-[var(--neo-border-color)] bg-neo-yellow px-3 py-2 text-sm font-black text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)]">
									<Loader2 className="size-4 animate-spin" />
									{t('Opening camera...')}
								</div>
							</div>
						)}
					</div>

					<DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
						<button
							type="button"
							onClick={closeCamera}
							className="rounded-lg border-2 border-[var(--neo-border-color)] bg-bg-4 px-4 py-2 text-sm font-black text-text-primary shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)]"
						>
							{t('Cancel')}
						</button>
						<button
							type="button"
							onClick={handleCapture}
							disabled={isStarting || isCapturing || !stream}
							className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-[var(--neo-border-color)] bg-neo-orange px-4 py-2 text-sm font-black text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] disabled:cursor-not-allowed disabled:opacity-45"
						>
							{isCapturing ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
							{t('Use photo')}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
