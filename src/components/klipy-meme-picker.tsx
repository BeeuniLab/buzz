import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Search, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppI18n } from '@/i18n';
import { cn } from '@/lib/utils';

type KlipyMode = 'trending' | 'search';

type KlipyImageFile = {
	url?: string;
	width?: number | string;
	height?: number | string;
	size?: number | string;
};

type KlipyImageFormat = {
	webp?: KlipyImageFile | string;
	png?: KlipyImageFile | string;
	gif?: KlipyImageFile | string;
	url?: string;
	width?: number | string;
	height?: number | string;
	size?: number | string;
};

type KlipyMemeItem = {
	id?: string | number;
	slug?: string;
	title?: string;
	name?: string;
	description?: string;
	type?: string;
	blur_preview?: string;
	file?: Record<string, KlipyImageFormat | KlipyImageFile | string | undefined>;
	url?: string;
	image_url?: string;
	preview_url?: string;
	files?: Record<string, KlipyImageFormat | KlipyImageFile | string | undefined>;
};

type KlipyApiResponse = {
	data?: KlipyMemeItem[] | {
		data?: KlipyMemeItem[];
		items?: KlipyMemeItem[];
		results?: KlipyMemeItem[];
		has_next?: boolean;
		current_page?: number;
		per_page?: number;
	};
	items?: KlipyMemeItem[];
	results?: KlipyMemeItem[];
	pagination?: {
		total_count?: number;
		count?: number;
		page?: number;
	};
};

export interface KlipyMemePickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onFilesSelected: (files: File[]) => void | Promise<void>;
	disabled?: boolean;
}

const KLIPY_API_KEY = import.meta.env.VITE_KLIPY_API_KEY?.trim();
const KLIPY_API_BASE = 'https://api.klipy.com/api/v1';
const PAGE_SIZE = 24;
const MAX_KLIPY_FILE_BYTES = 10 * 1024 * 1024;
const DESKTOP_MASONRY_COLUMN_COUNT = 4;
const MOBILE_MASONRY_COLUMN_COUNT = 3;

function getItems(response: KlipyApiResponse): KlipyMemeItem[] {
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

function getItemTitle(item: KlipyMemeItem): string {
	return item.title || item.name || item.description || `klipy-meme-${item.slug || item.id || Date.now()}`;
}

function normalizeFile(file: KlipyImageFile | string | undefined): KlipyImageFile | null {
	if (!file) return null;
	if (typeof file === 'string') return { url: file };
	return file;
}

function getFileVariant(
	item: KlipyMemeItem,
	size: 'xs' | 'sm' | 'md' | 'hd',
	format: 'webp' | 'png' | 'gif' | 'url',
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

function getKlipyAssetUrl(item: KlipyMemeItem): string | null {
	const candidates = [
		getFileVariant(item, 'md', 'webp'),
		getFileVariant(item, 'hd', 'webp'),
		getFileVariant(item, 'md', 'png'),
		getFileVariant(item, 'hd', 'png'),
		getFileVariant(item, 'sm', 'webp'),
		getFileVariant(item, 'sm', 'png'),
		getFileVariant(item, 'xs', 'webp'),
		getFileVariant(item, 'xs', 'png'),
		getFileVariant(item, 'md', 'url'),
		getFileVariant(item, 'hd', 'url'),
	];

	for (const candidate of candidates) {
		if (candidate?.url) return candidate.url;
	}

	return item.image_url || item.preview_url || item.url || null;
}

function getKlipyPreviewUrl(item: KlipyMemeItem): string | null {
	const candidates = [
		getFileVariant(item, 'sm', 'webp'),
		getFileVariant(item, 'xs', 'webp'),
		getFileVariant(item, 'sm', 'png'),
		getFileVariant(item, 'xs', 'png'),
		getFileVariant(item, 'md', 'webp'),
		getFileVariant(item, 'md', 'png'),
		getFileVariant(item, 'sm', 'url'),
	];

	for (const candidate of candidates) {
		if (candidate?.url) return candidate.url;
	}

	return item.blur_preview || getKlipyAssetUrl(item);
}

function getKlipyDimensions(item: KlipyMemeItem): { width: number; height: number } {
	const file =
		getFileVariant(item, 'md', 'webp') ||
		getFileVariant(item, 'md', 'png') ||
		getFileVariant(item, 'sm', 'webp') ||
		getFileVariant(item, 'sm', 'png') ||
		getFileVariant(item, 'hd', 'webp') ||
		getFileVariant(item, 'hd', 'png');
	const width = Number(file?.width) || 1;
	const height = Number(file?.height) || 1;
	return { width, height };
}

function getMasonryColumnIndex(columns: number[], item: KlipyMemeItem): number {
	const { width, height } = getKlipyDimensions(item);
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

function buildMasonryColumns(items: KlipyMemeItem[], columnCount: number): KlipyMemeItem[][] {
	const columnHeights = Array.from({ length: columnCount }, () => 0);
	const columns = Array.from({ length: columnCount }, () => [] as KlipyMemeItem[]);

	for (const item of items) {
		columns[getMasonryColumnIndex(columnHeights, item)].push(item);
	}

	return columns;
}

function getKlipyFilename(item: KlipyMemeItem, contentType: string): string {
	const extension = contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'png';
	const safeTitle = getItemTitle(item)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48);
	return `${safeTitle || `klipy-meme-${item.slug || item.id || Date.now()}`}.${extension}`;
}

function buildKlipyUrl(mode: KlipyMode, page: number, query: string): string {
	const path = mode === 'search' && query ? 'static-memes/search' : 'static-memes/trending';
	const url = new URL(`${KLIPY_API_BASE}/${KLIPY_API_KEY}/${path}`);
	url.searchParams.set('page', String(page));
	url.searchParams.set('per_page', String(PAGE_SIZE));
	if (mode === 'search' && query) {
		url.searchParams.set('q', query);
		url.searchParams.set('content_filter', 'medium');
	}
	return url.toString();
}

function MemeMasonry({
	columns,
	onSelectMeme,
	className,
}: {
	columns: KlipyMemeItem[][];
	onSelectMeme: (item: KlipyMemeItem) => void;
	className?: string;
}) {
	return (
		<div className={cn('grid-cols-3 gap-2 sm:grid-cols-4', className)}>
			{columns.map((column, columnIndex) => (
				<div key={`klipy-meme-column-${columnIndex}`} className="flex flex-col gap-2">
					{column.map((item, index) => {
						const previewUrl = getKlipyPreviewUrl(item);
						const title = getItemTitle(item);
						const { width, height } = getKlipyDimensions(item);
						return (
							<button
								type="button"
								key={`${item.slug || item.id || previewUrl || title}-${index}`}
								onClick={() => onSelectMeme(item)}
								className="group relative block w-full overflow-hidden rounded-xl border-2 border-[var(--neo-border-color)] bg-bg-3 text-left shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neo-yellow"
								style={{ aspectRatio: `${width} / ${height}` }}
								aria-label={title}
							>
								{previewUrl ? (
									<img src={previewUrl} alt={title} className="size-full object-cover" loading="lazy" />
								) : (
									<div className="grid size-full place-items-center p-3 text-center text-xs font-bold text-text-tertiary">{title}</div>
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

export function KlipyMemePicker({
	open,
	onOpenChange,
	onFilesSelected,
	disabled = false,
}: KlipyMemePickerProps) {
	const { t } = useAppI18n();
	const [mode, setMode] = useState<KlipyMode>('trending');
	const [searchTerm, setSearchTerm] = useState('');
	const [items, setItems] = useState<KlipyMemeItem[]>([]);
	const [page, setPage] = useState(1);
	const [hasMore, setHasMore] = useState(true);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedItemId, setSelectedItemId] = useState<string | number | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const scrollerRef = useRef<HTMLDivElement | null>(null);

	const query = searchTerm.trim();
	const gridKey = `${mode}:${query || 'recommended'}`;
	const isConfigured = Boolean(KLIPY_API_KEY);
	const desktopMasonryColumns = useMemo(() => buildMasonryColumns(items, DESKTOP_MASONRY_COLUMN_COUNT), [items]);
	const mobileMasonryColumns = useMemo(() => buildMasonryColumns(items, MOBILE_MASONRY_COLUMN_COUNT), [items]);

	const loadPage = useCallback(
		async (nextPage: number, reset = false) => {
			if (!isConfigured || (isLoading && !reset)) return;
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			setIsLoading(true);
			try {
				const response = await fetch(buildKlipyUrl(mode, nextPage, query), { signal: controller.signal });
				if (!response.ok) throw new Error(`KLIPY request failed: ${response.status}`);
				const json = await response.json() as KlipyApiResponse;
				const nextItems = getItems(json);
				setItems((prev) => reset ? nextItems : [...prev, ...nextItems]);
				setPage(nextPage);
				setHasMore(hasNextPage(json, nextItems.length));
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return;
				console.error('Failed to load KLIPY memes:', error);
				toast.error(t('Could not load memes'));
			} finally {
				if (abortRef.current === controller) {
					abortRef.current = null;
					setIsLoading(false);
				}
			}
		},
		[isConfigured, isLoading, mode, query, t],
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

	const handleSelectMeme = useCallback(
		async (item: KlipyMemeItem) => {
			if (disabled || isImporting) return;

			const assetUrl = getKlipyAssetUrl(item);
			if (!assetUrl) {
				toast.error(t('Could not load this meme'));
				return;
			}

			setSelectedItemId(item.id || assetUrl);
			setIsImporting(true);
			try {
				const response = await fetch(assetUrl);
				if (!response.ok) throw new Error(`KLIPY asset request failed: ${response.status}`);

				const blob = await response.blob();
				if (blob.size > MAX_KLIPY_FILE_BYTES) {
					toast.error(t('This meme is too large to attach'));
					return;
				}

				const mimeType = blob.type || (assetUrl.includes('.webp') ? 'image/webp' : 'image/gif');
				const file = new File([blob], getKlipyFilename(item, mimeType), { type: mimeType });
				await onFilesSelected([file]);
				onOpenChange(false);
				toast.success(t('Meme added'));
			} catch (error) {
				console.error('Failed to import KLIPY meme:', error);
				toast.error(t('Could not add this meme'));
			} finally {
				setIsImporting(false);
			}
		},
		[disabled, isImporting, onFilesSelected, onOpenChange, t],
	);

	const content = useMemo(() => {
		if (!isConfigured) {
			return (
				<div className="grid min-h-[360px] place-items-center rounded-2xl border-2 border-dashed border-[var(--neo-border-color)] bg-bg-3 p-6 text-center">
					<div>
						<p className="text-lg font-black text-text-primary">{t('KLIPY is not configured')}</p>
						<p className="mt-2 text-sm text-text-tertiary">
							{t('Add VITE_KLIPY_API_KEY to enable meme search.')}
						</p>
					</div>
				</div>
			);
		}

		return (
			<div
				ref={scrollerRef}
				onScroll={handleScrollerScroll}
				className={cn(
					'relative min-h-[360px] flex-1 overflow-y-auto rounded-2xl border-2 border-[var(--neo-border-color)] bg-bg-2 p-2',
					isImporting && 'pointer-events-none opacity-80',
				)}
			>
				{items.length === 0 && !isLoading ? (
					<div className="p-8 text-center text-sm font-medium text-text-tertiary">{t('No memes found')}</div>
				) : (
					<div>
						<MemeMasonry columns={mobileMasonryColumns} onSelectMeme={handleSelectMeme} className="grid sm:hidden" />
						<MemeMasonry columns={desktopMasonryColumns} onSelectMeme={handleSelectMeme} className="hidden sm:grid" />
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
				{isImporting && (
					<div className="absolute inset-0 grid place-items-center rounded-2xl bg-bg-4/70 backdrop-blur-sm">
						<div className="flex items-center gap-2 rounded-xl border-2 border-[var(--neo-border-color)] bg-neo-yellow px-4 py-2 text-sm font-black text-[#1a1a1a] shadow-[3px_3px_0px_0px_var(--neo-border-color)]">
							{selectedItemId ? <Check className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
							{t('Adding meme...')}
						</div>
					</div>
				)}
			</div>
		);
	}, [
		desktopMasonryColumns,
		handleScrollerScroll,
		handleSelectMeme,
		hasMore,
		isConfigured,
		isImporting,
		isLoading,
		items.length,
		mobileMasonryColumns,
		selectedItemId,
		t,
	]);

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
			<DrawerContent className="mx-auto max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-t-3xl border-t-3 border-[var(--neo-border-color)] bg-bg-4">
				<DrawerHeader className="px-4 pb-3 pt-5 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<DrawerTitle className="flex items-center gap-2 text-2xl">
								<span>{t('Meme')}</span>
								<span className="rounded-full border-2 border-[var(--neo-border-color)] bg-neo-yellow px-2 py-0.5 text-xs font-black text-[#1a1a1a]">
									KLIPY
								</span>
							</DrawerTitle>
							<DrawerDescription className="mt-1">
								{t('Pick a meme to use as creation material.')}
							</DrawerDescription>
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

				<div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-5 sm:px-6">
					<div className="flex items-center gap-2">
						<Tabs value={mode} onValueChange={(value) => setMode(value as KlipyMode)}>
							<TabsList className="h-10">
								<TabsTrigger value="trending" className="px-3">
									<Sparkles className="size-4" />
									{t('Recommended')}
								</TabsTrigger>
								<TabsTrigger value="search" className="px-3">
									<Search className="size-4" />
									{t('Search')}
								</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="relative min-w-0 flex-1">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
							<Input
								value={searchTerm}
								onChange={(event) => {
									setSearchTerm(event.target.value);
									if (event.target.value.trim()) setMode('search');
								}}
								placeholder={t('Search KLIPY')}
								className="pl-9"
								disabled={!isConfigured || disabled}
							/>
						</div>
					</div>

					{content}
					<p className="text-center text-[11px] font-medium text-text-tertiary">{t('Powered by KLIPY')}</p>
				</div>
			</DrawerContent>
		</Drawer>
	);
}
