import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Film, ImageIcon, Loader2, Search, Sparkles, Sticker, X } from 'lucide-react';
import { toast } from 'sonner';
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { useAppI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import type { UploadFileWithMetadata } from '@/hooks/use-image-upload';

type KlipyMode = 'trending' | 'search';
export type KlipyMediaKind = 'gifs' | 'stickers' | 'clips' | 'static-memes' | 'emojis';
type KlipyFileFormat = 'mp4' | 'webp' | 'gif' | 'png' | 'url';
type KlipySizeKey = 'xs' | 'sm' | 'md' | 'hd';

type KlipyImageFile = {
	url?: string;
	width?: number | string;
	height?: number | string;
	size?: number | string;
};

type KlipyImageFormat = {
	mp4?: KlipyImageFile | string;
	webp?: KlipyImageFile | string;
	png?: KlipyImageFile | string;
	gif?: KlipyImageFile | string;
	url?: string;
	width?: number | string;
	height?: number | string;
	size?: number | string;
};

type KlipyMediaItem = {
	id?: string | number;
	slug?: string;
	title?: string;
	name?: string;
	description?: string;
	type?: string;
	blur_preview?: string;
	file?: Record<string, KlipyImageFormat | KlipyImageFile | string | undefined>;
	file_meta?: Record<string, KlipyImageFile | string | undefined>;
	url?: string;
	image_url?: string;
	preview_url?: string;
	files?: Record<string, KlipyImageFormat | KlipyImageFile | string | undefined>;
};

type KlipyApiResponse = {
	data?: KlipyMediaItem[] | {
		data?: KlipyMediaItem[];
		items?: KlipyMediaItem[];
		results?: KlipyMediaItem[];
		has_next?: boolean;
		current_page?: number;
		per_page?: number;
	};
	items?: KlipyMediaItem[];
	results?: KlipyMediaItem[];
	pagination?: {
		total_count?: number;
		count?: number;
		page?: number;
	};
};

export interface KlipyMediaPickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onFilesSelected?: (files: UploadFileWithMetadata[]) => void | Promise<void>;
	onMediaSelected?: (media: KlipySelectedMedia) => void | Promise<void>;
	disabled?: boolean;
	allowedKinds?: KlipyMediaKind[];
	initialKind?: KlipyMediaKind;
}

export type KlipySelectedMedia = {
	url: string;
	previewUrl: string;
	title: string;
	description: string;
	kind: KlipyMediaKind;
	file?: UploadFileWithMetadata;
};

const KLIPY_API_KEY = import.meta.env.VITE_KLIPY_API_KEY?.trim();
const KLIPY_API_BASE = 'https://api.klipy.com/api/v1';
const PAGE_SIZE = 24;
const MAX_KLIPY_FILE_BYTES = 10 * 1024 * 1024;
const DESKTOP_MASONRY_COLUMN_COUNT = 4;
const MOBILE_MASONRY_COLUMN_COUNT = 3;

const KLIPY_MEDIA_KINDS: Array<{
	value: KlipyMediaKind;
	label: string;
	searchPlaceholder: string;
	filenamePrefix: string;
}> = [
	{
		value: 'gifs',
		label: 'GIFs',
		searchPlaceholder: 'Search GIFs',
		filenamePrefix: 'klipy-gif',
	},
	{
		value: 'stickers',
		label: 'Stickers',
		searchPlaceholder: 'Search stickers',
		filenamePrefix: 'klipy-sticker',
	},
	{
		value: 'clips',
		label: 'Clips',
		searchPlaceholder: 'Search clips',
		filenamePrefix: 'klipy-clip',
	},
	{
		value: 'static-memes',
		label: 'Memes',
		searchPlaceholder: 'Search memes',
		filenamePrefix: 'klipy-meme',
	},
	{
		value: 'emojis',
		label: 'AI Emojis',
		searchPlaceholder: 'Search AI emojis',
		filenamePrefix: 'klipy-ai-emoji',
	},
];

function getMediaKindConfig(kind: KlipyMediaKind) {
	return KLIPY_MEDIA_KINDS.find((option) => option.value === kind) || KLIPY_MEDIA_KINDS[0];
}

function getItems(response: KlipyApiResponse): KlipyMediaItem[] {
	if (Array.isArray(response.data)) return response.data;
	if (Array.isArray(response.items)) return response.items;
	if (Array.isArray(response.results)) return response.results;
	if (response.data && typeof response.data === 'object') {
		if (Array.isArray(response.data.data)) return response.data.data;
		if (Array.isArray(response.data.items)) return response.data.items;
		if (Array.isArray(response.data.results)) return response.data.results;
	}
	return [];
}

function hasNextPage(response: KlipyApiResponse, itemCount: number): boolean {
	if (response.data && !Array.isArray(response.data) && typeof response.data.has_next === 'boolean') {
		return response.data.has_next;
	}
	return itemCount >= PAGE_SIZE;
}

function getItemTitle(item: KlipyMediaItem, kind: KlipyMediaKind): string {
	return item.title || item.name || item.description || `${getMediaKindConfig(kind).filenamePrefix}-${item.slug || item.id || Date.now()}`;
}

function getItemDescription(item: KlipyMediaItem, kind: KlipyMediaKind): string {
	const parts = [item.title, item.name, item.description]
		.map((part) => part?.trim())
		.filter((part): part is string => Boolean(part));
	const uniqueParts = Array.from(new Set(parts));
	return uniqueParts.join(' - ') || getItemTitle(item, kind);
}

function normalizeFile(file: KlipyImageFile | string | undefined): KlipyImageFile | null {
	if (!file) return null;
	if (typeof file === 'string') return { url: file };
	return file;
}

function getDirectFileVariant(item: KlipyMediaItem, format: KlipyFileFormat): KlipyImageFile | null {
	const direct = item.file?.[format] || item.files?.[format] || item.file_meta?.[format];
	const file = normalizeFile(direct as KlipyImageFile | string | undefined);
	const meta = normalizeFile(item.file_meta?.[format]);

	if (!file) return meta;
	return {
		...file,
		width: file.width ?? meta?.width,
		height: file.height ?? meta?.height,
		size: file.size ?? meta?.size,
	};
}

function getFileVariant(
	item: KlipyMediaItem,
	size: KlipySizeKey,
	format: KlipyFileFormat,
): KlipyImageFile | null {
	const file = item.file?.[size] || item.files?.[size];
	if (!file) return null;
	if (typeof file === 'string') {
		return format === 'url' ? { url: file } : null;
	}
	if ('url' in file && file.url && (format === 'url' || !('webp' in file) && !('png' in file) && !('gif' in file))) {
		return normalizeFile(file);
	}
	const nested = (file as KlipyImageFormat)[format];
	return normalizeFile(nested);
}

function pickFileVariant(item: KlipyMediaItem, sizes: KlipySizeKey[], formats: KlipyFileFormat[]): KlipyImageFile | null {
	for (const format of formats) {
		const direct = getDirectFileVariant(item, format);
		if (direct?.url) return direct;
	}

	for (const format of formats) {
		for (const size of sizes) {
			const file = getFileVariant(item, size, format);
			if (file?.url) return file;
		}
	}

	return null;
}

function getAssetFormatOrder(kind: KlipyMediaKind): KlipyFileFormat[] {
	if (kind === 'clips') return ['mp4', 'webp', 'gif', 'url'];
	if (kind === 'static-memes' || kind === 'emojis') return ['webp', 'png', 'url'];
	return ['gif', 'webp', 'png', 'url'];
}

function getPreviewFormatOrder(kind: KlipyMediaKind): KlipyFileFormat[] {
	if (kind === 'clips') return ['webp', 'gif', 'mp4', 'url'];
	if (kind === 'static-memes' || kind === 'emojis') return ['webp', 'png', 'url'];
	return ['webp', 'gif', 'png', 'url'];
}

function getKlipyAssetUrl(item: KlipyMediaItem, kind: KlipyMediaKind): string | null {
	return pickFileVariant(item, ['md', 'hd', 'sm', 'xs'], getAssetFormatOrder(kind))?.url ||
		item.image_url ||
		item.preview_url ||
		item.url ||
		null;
}

function getKlipyPreviewUrl(item: KlipyMediaItem, kind: KlipyMediaKind): string | null {
	return pickFileVariant(item, ['sm', 'xs', 'md', 'hd'], getPreviewFormatOrder(kind))?.url ||
		item.blur_preview ||
		getKlipyAssetUrl(item, kind);
}

function getKlipyDimensions(item: KlipyMediaItem, kind: KlipyMediaKind): { width: number; height: number } {
	const file =
		pickFileVariant(item, ['md', 'sm', 'hd', 'xs'], getPreviewFormatOrder(kind)) ||
		pickFileVariant(item, ['md', 'sm', 'hd', 'xs'], getAssetFormatOrder(kind));
	const width = Number(file?.width) || 1;
	const height = Number(file?.height) || 1;
	return { width, height };
}

function getMasonryColumnIndex(columns: number[], item: KlipyMediaItem, kind: KlipyMediaKind): number {
	const { width, height } = getKlipyDimensions(item, kind);
	const estimatedHeight = height / Math.max(width, 1);
	let shortestColumnIndex = 0;

	for (let index = 1; index < columns.length; index++) {
		if (columns[index] < columns[shortestColumnIndex]) {
			shortestColumnIndex = index;
		}
	}

	columns[shortestColumnIndex] += estimatedHeight;
	return shortestColumnIndex;
}

function buildMasonryColumns(items: KlipyMediaItem[], columnCount: number, kind: KlipyMediaKind): KlipyMediaItem[][] {
	const columnHeights = Array.from({ length: columnCount }, () => 0);
	const columns = Array.from({ length: columnCount }, () => [] as KlipyMediaItem[]);

	for (const item of items) {
		columns[getMasonryColumnIndex(columnHeights, item, kind)].push(item);
	}

	return columns;
}

function getKlipyFilename(item: KlipyMediaItem, kind: KlipyMediaKind, contentType: string): string {
	const extension = contentType.includes('mp4')
		? 'mp4'
		: contentType.includes('webp')
			? 'webp'
			: contentType.includes('gif')
				? 'gif'
				: 'png';
	const safeTitle = getItemTitle(item, kind)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48);
	const fallback = `${getMediaKindConfig(kind).filenamePrefix}-${item.slug || item.id || Date.now()}`;
	return `${safeTitle || fallback}.${extension}`;
}

function buildKlipyUrl(kind: KlipyMediaKind, mode: KlipyMode, page: number, query: string): string {
	const path = mode === 'search' && query ? `${kind}/search` : `${kind}/trending`;
	const url = new URL(`${KLIPY_API_BASE}/${KLIPY_API_KEY}/${path}`);
	url.searchParams.set('page', String(page));
	url.searchParams.set('per_page', String(PAGE_SIZE));
	url.searchParams.set('content_filter', 'medium');
	if (mode === 'search' && query) {
		url.searchParams.set('q', query);
	}
	return url.toString();
}

function MediaMasonry({
	columns,
	kind,
	onSelectMedia,
	className,
}: {
	columns: KlipyMediaItem[][];
	kind: KlipyMediaKind;
	onSelectMedia: (item: KlipyMediaItem) => void;
	className?: string;
}) {
	return (
		<div className={cn('grid-cols-3 gap-2 sm:grid-cols-4', className)}>
			{columns.map((column, columnIndex) => (
				<div key={`klipy-media-column-${columnIndex}`} className="flex flex-col gap-2">
					{column.map((item, index) => {
						const previewUrl = getKlipyPreviewUrl(item, kind);
						const title = getItemTitle(item, kind);
						const { width, height } = getKlipyDimensions(item, kind);
						const canRenderImage = previewUrl && (previewUrl.includes('data:image') || !previewUrl.endsWith('.mp4'));
						return (
							<button
								type="button"
								key={`${item.slug || item.id || previewUrl || title}-${index}`}
								onClick={() => onSelectMedia(item)}
								className="group relative block w-full overflow-hidden rounded-xl border-2 border-[var(--neo-border-color)] bg-bg-3 text-left shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neo-yellow"
								style={{ aspectRatio: `${width} / ${height}` }}
								aria-label={title}
							>
								{canRenderImage ? (
									<img src={previewUrl} alt={title} className="size-full object-cover" loading="lazy" />
								) : (
									<div className="grid size-full place-items-center p-3 text-center text-xs font-bold text-text-tertiary">
										{kind === 'clips' ? <Film className="mb-1 size-6" /> : null}
										<span className="line-clamp-3">{title}</span>
									</div>
								)}
								<div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
									<p className="truncate text-xs font-bold text-white">{title}</p>
								</div>
							</button>
						);
					})}
				</div>
			))}
		</div>
	);
}

export function KlipyMediaPicker({
	open,
	onOpenChange,
	onFilesSelected,
	onMediaSelected,
	disabled = false,
	allowedKinds,
	initialKind = 'static-memes',
}: KlipyMediaPickerProps) {
	const { t } = useAppI18n();
	const [mediaKind, setMediaKind] = useState<KlipyMediaKind>(initialKind);
	const [mode, setMode] = useState<KlipyMode>('trending');
	const [searchTerm, setSearchTerm] = useState('');
	const [items, setItems] = useState<KlipyMediaItem[]>([]);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedItemId, setSelectedItemId] = useState<string | number | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const scrollerRef = useRef<HTMLDivElement | null>(null);

	const query = searchTerm.trim();
	const visibleKinds = useMemo(
		() => KLIPY_MEDIA_KINDS.filter((kind) => !allowedKinds || allowedKinds.includes(kind.value)),
		[allowedKinds],
	);
	const activeKind = getMediaKindConfig(mediaKind);
	const gridKey = `${mediaKind}:${mode}:${query || 'recommended'}`;
	const isConfigured = Boolean(KLIPY_API_KEY);
	const desktopMasonryColumns = useMemo(() => buildMasonryColumns(items, DESKTOP_MASONRY_COLUMN_COUNT, mediaKind), [items, mediaKind]);
	const mobileMasonryColumns = useMemo(() => buildMasonryColumns(items, MOBILE_MASONRY_COLUMN_COUNT, mediaKind), [items, mediaKind]);

	useEffect(() => {
		if (visibleKinds.length === 0) return;
		if (!visibleKinds.some((kind) => kind.value === mediaKind)) {
			setMediaKind(visibleKinds[0].value);
		}
	}, [mediaKind, visibleKinds]);

	const loadPage = useCallback(
		async (nextPage: number, reset = false) => {
			if (!isConfigured || (isLoading && !reset)) return;
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			setIsLoading(true);
			try {
				const response = await fetch(buildKlipyUrl(mediaKind, mode, nextPage, query), { signal: controller.signal });
				if (!response.ok) throw new Error(`KLIPY request failed: ${response.status}`);
				const json = await response.json() as KlipyApiResponse;
				const nextItems = getItems(json);
				setItems((prev) => reset ? nextItems : [...prev, ...nextItems]);
				setPage(nextPage);
				setHasMore(hasNextPage(json, nextItems.length));
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				console.error('Failed to load KLIPY media:', error);
				toast.error(t('Could not load KLIPY media'));
			} finally {
				if (abortRef.current === controller) {
					abortRef.current = null;
					setIsLoading(false);
				}
			}
		},
		[isConfigured, isLoading, mediaKind, mode, query, t],
	);

	useEffect(() => {
		if (!open) return;
		setItems([]);
		setHasMore(true);
		setPage(1);
		void loadPage(1, true);
		return () => abortRef.current?.abort();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open, gridKey]);

	const handleScrollerScroll = useCallback(() => {
		const scroller = scrollerRef.current;
		if (!scroller || !hasMore || isLoading || items.length === 0) return;

		const distanceToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
		if (distanceToBottom < 320) {
			void loadPage(page + 1);
		}
	}, [hasMore, isLoading, items.length, loadPage, page]);

	const handleSelectMedia = useCallback(
		async (item: KlipyMediaItem) => {
			if (disabled || isImporting) return;

			const assetUrl = getKlipyAssetUrl(item, mediaKind);
			if (!assetUrl) {
				toast.error(t('Could not load this item'));
				return;
			}

			if (!onMediaSelected && !onFilesSelected) return;

			setSelectedItemId(item.id || assetUrl);
			setIsImporting(true);
			try {
				const response = await fetch(assetUrl);
				if (!response.ok) throw new Error(`KLIPY asset request failed: ${response.status}`);

				const blob = await response.blob();
				if (blob.size > MAX_KLIPY_FILE_BYTES) {
					toast.error(t('This item is too large to attach'));
					return;
				}

				const mimeType = blob.type ||
					(assetUrl.includes('.mp4')
						? 'video/mp4'
						: assetUrl.includes('.webp')
							? 'image/webp'
							: assetUrl.includes('.gif')
								? 'image/gif'
								: 'image/png');
				const file = new File([blob], getKlipyFilename(item, mediaKind, mimeType), { type: mimeType }) as UploadFileWithMetadata;
				const title = getItemTitle(item, mediaKind);
				const description = getItemDescription(item, mediaKind);
				file.description = description;

				if (onMediaSelected) {
					await onMediaSelected({
						url: assetUrl,
						previewUrl: getKlipyPreviewUrl(item, mediaKind) || assetUrl,
						title,
						description,
						kind: mediaKind,
						file,
					});
				} else if (onFilesSelected) {
					await onFilesSelected([file]);
				}

				onOpenChange(false);
				toast.success(t('Item added'));
			} catch (error) {
				console.error('Failed to import KLIPY media:', error);
				toast.error(t('Could not add this item'));
			} finally {
				setIsImporting(false);
			}
		},
		[disabled, isImporting, mediaKind, onFilesSelected, onMediaSelected, onOpenChange, t],
	);

	const content = useMemo(() => {
		if (!isConfigured) {
			return (
				<div className="grid min-h-0 flex-1 place-items-center rounded-2xl border-2 border-dashed border-[var(--neo-border-color)] bg-bg-3 p-6 text-center">
					<div>
						<p className="text-lg font-black text-text-primary">{t('KLIPY is not configured')}</p>
						<p className="mt-2 text-sm text-text-tertiary">
							{t('Add VITE_KLIPY_API_KEY to enable KLIPY media search.')}
						</p>
					</div>
				</div>
			);
		}

		return (
			<div className="relative min-h-0 flex-1">
				<div
					ref={scrollerRef}
					onScroll={handleScrollerScroll}
					className={cn(
						'h-full min-h-0 overflow-y-auto rounded-b-2xl rounded-t-lg border-2 border-[var(--neo-border-color)] bg-bg-2 px-2 pb-2 pt-1',
						isImporting && 'pointer-events-none opacity-80',
					)}
				>
					{items.length === 0 && !isLoading ? (
						<div className="p-8 text-center text-sm font-medium text-text-tertiary">{t('No items found')}</div>
					) : (
						<div>
							<MediaMasonry columns={mobileMasonryColumns} kind={mediaKind} onSelectMedia={handleSelectMedia} className="grid sm:hidden" />
							<MediaMasonry columns={desktopMasonryColumns} kind={mediaKind} onSelectMedia={handleSelectMedia} className="hidden sm:grid" />
						</div>
					)}
					{hasMore && items.length > 0 && (
						<div className="grid min-h-10 place-items-center py-3">
							{isLoading ? <Loader2 className="size-5 animate-spin text-accent" /> : null}
						</div>
					)}
					{isLoading && items.length === 0 && (
						<div className="absolute inset-0 grid place-items-center rounded-2xl bg-bg-4/50">
							<Loader2 className="size-7 animate-spin text-accent" />
						</div>
					)}
				</div>
				{isImporting && (
					<div className="absolute inset-0 z-10 grid place-items-center rounded-b-2xl rounded-t-lg border-2 border-[var(--neo-border-color)] bg-bg-4/70 backdrop-blur-sm">
						<div className="flex items-center gap-2 rounded-xl border-2 border-[var(--neo-border-color)] bg-neo-yellow px-4 py-2 text-sm font-black text-[#1a1a1a] shadow-[3px_3px_0px_0px_var(--neo-border-color)]">
							{selectedItemId ? <Check className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
							{t('Adding item...')}
						</div>
					</div>
				)}
			</div>
		);
	}, [
		desktopMasonryColumns,
		handleScrollerScroll,
		handleSelectMedia,
		hasMore,
		isConfigured,
		isImporting,
		isLoading,
		items.length,
		mediaKind,
		mobileMasonryColumns,
		selectedItemId,
		t,
	]);

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
			<DrawerContent
				className="z-[90] mx-auto h-[88dvh] max-h-[88dvh] w-full max-w-4xl overflow-hidden rounded-t-3xl border-t-3 border-[var(--neo-border-color)] bg-bg-4 data-[vaul-drawer-direction=bottom]:h-[88dvh] data-[vaul-drawer-direction=bottom]:max-h-[88dvh]"
				overlayClassName="z-[85]"
			>
				<DrawerHeader className="shrink-0 px-4 pb-2 pt-4 sm:px-5">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<DrawerTitle className="flex items-center gap-2 text-xl sm:text-2xl">
								<span>{t('Media')}</span>
								<span className="rounded-full border-2 border-[var(--neo-border-color)] bg-neo-yellow px-2 py-0.5 text-xs font-black text-[#1a1a1a]">
									KLIPY
								</span>
							</DrawerTitle>
						</div>
						<DrawerClose asChild>
							<button
								type="button"
								className="grid size-9 shrink-0 place-items-center rounded-full border-2 border-[var(--neo-border-color)] bg-bg-4 text-text-primary shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)]"
								aria-label={t('Close')}
							>
								<X className="size-4" />
							</button>
						</DrawerClose>
					</div>
				</DrawerHeader>

				<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-3 pt-1 sm:px-5">
					<div className="shrink-0 py-2">
						<div className="grid grid-cols-3 gap-2 sm:flex sm:w-max sm:items-center">
							{visibleKinds.map((kind) => {
								const active = mediaKind === kind.value;
								return (
									<button
										key={kind.value}
										type="button"
										onClick={() => setMediaKind(kind.value)}
										className={cn(
											'inline-flex h-9 min-w-0 items-center justify-center gap-1 rounded-full border-2 border-[var(--neo-border-color)] bg-bg-3 px-2 text-xs font-black text-text-primary transition-all sm:flex-none sm:gap-1.5 sm:px-3 sm:text-sm',
											active && 'bg-neo-yellow text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)]',
										)}
									>
										{kind.value === 'clips' ? (
											<Film className="size-4 shrink-0" />
										) : kind.value === 'stickers' ? (
											<Sticker className="size-4 shrink-0" />
										) : kind.value === 'emojis' ? (
											<Sparkles className="size-4 shrink-0" />
										) : (
											<ImageIcon className="size-4 shrink-0" />
										)}
										<span className="min-w-0 truncate">{t(kind.label)}</span>
									</button>
								);
							})}
						</div>
					</div>
					<div className="grid shrink-0 gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
						<div
							className="inline-flex min-h-12 w-full items-center gap-1 rounded-xl border-2 border-[var(--neo-border-color)] bg-bg-2 p-1.5 text-text-primary shadow-[3px_3px_0px_0px_var(--neo-border-color)] sm:w-fit"
							role="tablist"
							aria-label={t('KLIPY Media')}
						>
							<button
								type="button"
								role="tab"
								aria-selected={mode === 'trending'}
								onClick={() => setMode('trending')}
								className={cn(
									'inline-flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-transparent px-3 text-sm font-bold transition-all sm:flex-none',
									mode === 'trending' &&
										'border-[var(--neo-border-color)] bg-neo-yellow text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)]',
								)}
							>
								<Sparkles className="size-4 shrink-0" />
								{t('Recommended')}
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={mode === 'search'}
								onClick={() => setMode('search')}
								className={cn(
									'inline-flex h-8 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border-2 border-transparent px-3 text-sm font-bold transition-all sm:flex-none',
									mode === 'search' &&
										'border-[var(--neo-border-color)] bg-neo-yellow text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)]',
								)}
							>
								<Search className="size-4 shrink-0" />
								{t('Search')}
							</button>
						</div>
						<div className="relative min-w-0 flex-1">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
							<Input
								value={searchTerm}
								onChange={(event) => {
									setSearchTerm(event.target.value);
									if (event.target.value.trim()) setMode('search');
								}}
								placeholder={t(activeKind.searchPlaceholder)}
								className="pl-9"
								disabled={!isConfigured || disabled}
							/>
						</div>
					</div>

					{content}
					<p className="shrink-0 text-center text-[11px] font-medium text-text-tertiary">{t('Powered by KLIPY')}</p>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
