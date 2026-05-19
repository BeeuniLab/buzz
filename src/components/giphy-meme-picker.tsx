import { useCallback, useMemo, useState } from 'react';
import { GiphyFetch } from '@giphy/js-fetch-api';
import type { GifsResult } from '@giphy/js-fetch-api';
import { Grid } from '@giphy/react-components';
import type { IGif } from '@giphy/js-types';
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

type GiphyMode = 'trending' | 'search';

export interface GiphyMemePickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onFilesSelected: (files: File[]) => void | Promise<void>;
	disabled?: boolean;
}

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY?.trim();
const GRID_LIMIT = 24;
const MEME_SEARCH_TERMS = ['meme', 'reaction meme', 'funny reaction', 'viral meme'];
const MAX_GIPHY_FILE_BYTES = 10 * 1024 * 1024;
const EMPTY_GIPHY_RESULT: GifsResult = {
	data: [],
	pagination: { total_count: 0, count: 0, offset: 0 },
	meta: { msg: 'OK', response_id: '', status: 200 },
};

function getGiphyAssetUrl(gif: IGif): string | null {
	return (
		gif.images.fixed_height?.webp ||
		gif.images.downsized_medium?.url ||
		gif.images.downsized?.url ||
		gif.images.original?.webp ||
		gif.images.original?.url ||
		null
	);
}

function getGiphyFilename(gif: IGif, contentType: string): string {
	const extension = contentType.includes('webp') ? 'webp' : contentType.includes('gif') ? 'gif' : 'png';
	const safeTitle = (gif.title || `giphy-${gif.id}`)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 48);
	return `${safeTitle || `giphy-${gif.id}`}.${extension}`;
}

export function GiphyMemePicker({
	open,
	onOpenChange,
	onFilesSelected,
	disabled = false,
}: GiphyMemePickerProps) {
	const { t } = useAppI18n();
	const [mode, setMode] = useState<GiphyMode>('trending');
	const [searchTerm, setSearchTerm] = useState('');
	const [selectedGifId, setSelectedGifId] = useState<string | number | null>(null);
	const [isImporting, setIsImporting] = useState(false);

	const gf = useMemo(() => (GIPHY_API_KEY ? new GiphyFetch(GIPHY_API_KEY) : null), []);
	const gridWidth = typeof window === 'undefined'
		? 360
		: Math.min(Math.max(window.innerWidth - 32, 300), 860);
	const columns = gridWidth >= 720 ? 4 : 3;
	const query = searchTerm.trim();
	const searchLabel = query || t('Search memes');

	const fetchGifs = useCallback(
		(offset: number) => {
			if (!gf) {
				return Promise.resolve({
					...EMPTY_GIPHY_RESULT,
					pagination: { ...EMPTY_GIPHY_RESULT.pagination, offset },
				});
			}

			if (mode === 'search' && query) {
				return gf.search(query, { offset, limit: GRID_LIMIT, rating: 'pg-13', type: 'gifs', lang: 'en' });
			}

			const term = MEME_SEARCH_TERMS[Math.floor(offset / GRID_LIMIT) % MEME_SEARCH_TERMS.length];
			return gf.search(term, { offset, limit: GRID_LIMIT, rating: 'pg-13', type: 'gifs', lang: 'en' });
		},
		[gf, mode, query],
	);

	const handleSelectGif = useCallback(
		async (gif: IGif, event: React.SyntheticEvent<HTMLElement>) => {
			event.preventDefault();
			event.stopPropagation();

			if (disabled || isImporting) return;

			const assetUrl = getGiphyAssetUrl(gif);
			if (!assetUrl) {
				toast.error(t('Could not load this meme'));
				return;
			}

			setSelectedGifId(gif.id);
			setIsImporting(true);
			try {
				const response = await fetch(assetUrl);
				if (!response.ok) {
					throw new Error(`GIPHY asset request failed: ${response.status}`);
				}

				const blob = await response.blob();
				if (blob.size > MAX_GIPHY_FILE_BYTES) {
					toast.error(t('This meme is too large to attach'));
					return;
				}

				const mimeType = blob.type || (assetUrl.includes('.webp') ? 'image/webp' : 'image/gif');
				const file = new File([blob], getGiphyFilename(gif, mimeType), { type: mimeType });
				await onFilesSelected([file]);
				onOpenChange(false);
				toast.success(t('Meme added'));
			} catch (error) {
				console.error('Failed to import GIPHY meme:', error);
				toast.error(t('Could not add this meme'));
			} finally {
				setIsImporting(false);
			}
		},
		[disabled, isImporting, onFilesSelected, onOpenChange, t],
	);

	return (
		<Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
			<DrawerContent className="mx-auto max-h-[86vh] w-full max-w-4xl overflow-hidden rounded-t-3xl border-t-3 border-[var(--neo-border-color)] bg-bg-4">
				<DrawerHeader className="px-4 pb-3 pt-5 sm:px-6">
					<div className="flex items-center justify-between gap-3">
						<div className="min-w-0">
							<DrawerTitle className="flex items-center gap-2 text-2xl">
								<span>{t('Meme')}</span>
								<span className="rounded-full border-2 border-[var(--neo-border-color)] bg-neo-yellow px-2 py-0.5 text-xs font-black text-[#1a1a1a]">
									GIPHY
								</span>
							</DrawerTitle>
							<DrawerDescription className="mt-1">
								{t('Pick a GIF to use as creation material.')}
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
						<Tabs value={mode} onValueChange={(value) => setMode(value as GiphyMode)}>
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
								placeholder={t('Search GIPHY')}
								className="pl-9"
								disabled={!GIPHY_API_KEY || disabled}
							/>
						</div>
					</div>

					{!GIPHY_API_KEY ? (
						<div className="grid min-h-[360px] place-items-center rounded-2xl border-2 border-dashed border-[var(--neo-border-color)] bg-bg-3 p-6 text-center">
							<div>
								<p className="text-lg font-black text-text-primary">{t('GIPHY is not configured')}</p>
								<p className="mt-2 text-sm text-text-tertiary">
									{t('Add VITE_GIPHY_API_KEY to enable meme search.')}
								</p>
							</div>
						</div>
					) : (
						<div
							className={cn(
								'relative min-h-[360px] flex-1 overflow-y-auto rounded-2xl border-2 border-[var(--neo-border-color)] bg-bg-2 p-2',
								isImporting && 'pointer-events-none opacity-80',
							)}
						>
							<Grid
								key={`${mode}:${searchLabel}`}
								width={gridWidth - 20}
								columns={columns}
								gutter={10}
								fetchGifs={fetchGifs}
								onGifClick={handleSelectGif}
								noLink
								hideAttribution
								borderRadius={12}
								noResultsMessage={<div className="p-8 text-center text-sm font-medium text-text-tertiary">{t('No memes found')}</div>}
							/>
							{isImporting && (
								<div className="absolute inset-0 grid place-items-center rounded-2xl bg-bg-4/70 backdrop-blur-sm">
									<div className="flex items-center gap-2 rounded-xl border-2 border-[var(--neo-border-color)] bg-neo-yellow px-4 py-2 text-sm font-black text-[#1a1a1a] shadow-[3px_3px_0px_0px_var(--neo-border-color)]">
										{selectedGifId ? <Check className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
										{t('Adding meme...')}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			</DrawerContent>
		</Drawer>
	);
}
