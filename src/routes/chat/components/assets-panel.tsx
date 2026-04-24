import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Trash2, RefreshCw, Image, Music, Box, Type, File, Video } from 'lucide-react';
import clsx from 'clsx';
import { apiClient } from '@/lib/api-client';
import type { AssetItem, AssetCategory } from '@/api-types';
import type { ChatAssetSelectionTarget } from '../utils/chat-attachments';

const CATEGORY_TABS: { label: string; value: AssetCategory | 'all'; icon: React.ComponentType<{ className?: string }> }[] = [
	{ label: 'All', value: 'all', icon: File },
	{ label: 'Images', value: 'images', icon: Image },
	{ label: 'Video', value: 'video', icon: Video },
	{ label: '3D', value: '3d', icon: Box },
	{ label: 'Audio', value: 'audio', icon: Music },
	{ label: 'Fonts', value: 'fonts', icon: Type },
];

const ACCEPT_MAP: Record<AssetCategory, string> = {
	images: 'image/*',
	video: 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov',
	'3d': '.glb,.gltf,.obj,.fbx',
	audio: 'audio/*',
	fonts: '.woff,.woff2,.ttf',
	other: '*/*',
};

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AssetsPanelProps {
	agentId?: string;
	selectedAssetTarget?: ChatAssetSelectionTarget | null;
}

export function AssetsPanel({ agentId, selectedAssetTarget }: AssetsPanelProps) {
	const [assets, setAssets] = useState<AssetItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [selectedCategory, setSelectedCategory] = useState<AssetCategory | 'all'>('all');
	const [highlightedAssetKey, setHighlightedAssetKey] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const assetRefs = useRef<Record<string, HTMLDivElement | null>>({});
	const lastAutoCategoryNonceRef = useRef<number | null>(null);
	const lastHighlightNonceRef = useRef<number | null>(null);

	const fetchAssets = useCallback(async () => {
		if (!agentId) return;
		setLoading(true);
		try {
			const response = await apiClient.listProjectAssets(agentId);
			if (response.success && response.data) {
				setAssets(response.data.assets);
			}
		} catch {
			// error handled by api client
		} finally {
			setLoading(false);
		}
	}, [agentId]);

	useEffect(() => {
		fetchAssets();
	}, [fetchAssets]);

	const handleUpload = useCallback(async (files: FileList) => {
		if (!agentId || files.length === 0 || selectedCategory === 'all') return;
		setUploading(true);
		try {
			const category = selectedCategory;
			for (const file of Array.from(files)) {
				const response = await apiClient.uploadProjectAsset(agentId, file, category);
				if (response.success && response.data) {
					setAssets(prev => [response.data!, ...prev]);
				}
			}
		} catch {
			// error handled by api client
		} finally {
			setUploading(false);
			if (fileInputRef.current) fileInputRef.current.value = '';
		}
	}, [agentId, selectedCategory]);

	const handleDelete = useCallback(async (asset: AssetItem) => {
		if (!agentId) return;
		try {
			const response = await apiClient.deleteProjectAsset(agentId, asset.key);
			if (response.success) {
				setAssets(prev => prev.filter(a => a.key !== asset.key));
			}
		} catch {
			// error handled by api client
		}
	}, [agentId]);

	const filteredAssets = selectedCategory === 'all'
		? assets
		: assets.filter(a => a.category === selectedCategory);

	useEffect(() => {
		if (!selectedAssetTarget) return;
		if (lastAutoCategoryNonceRef.current === selectedAssetTarget.nonce) return;

		lastAutoCategoryNonceRef.current = selectedAssetTarget.nonce;
		if (selectedAssetTarget.category) {
			setSelectedCategory(selectedAssetTarget.category);
		}
	}, [selectedAssetTarget]);

	useEffect(() => {
		if (!selectedAssetTarget) return;
		if (lastHighlightNonceRef.current === selectedAssetTarget.nonce) return;

		const matched = assets.find((asset) => {
			if (selectedAssetTarget.assetKey) {
				return asset.key === selectedAssetTarget.assetKey;
			}
			if (selectedAssetTarget.filename) {
				return asset.name === selectedAssetTarget.filename;
			}
			return false;
		});
		if (!matched) return;

		lastHighlightNonceRef.current = selectedAssetTarget.nonce;
		setSelectedCategory(matched.category);
		setHighlightedAssetKey(matched.key);
	}, [assets, selectedAssetTarget]);

	useEffect(() => {
		if (!highlightedAssetKey) return;
		const node = assetRefs.current[highlightedAssetKey];
		if (!node) return;
		node.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [filteredAssets, highlightedAssetKey]);

	const getAssetUrl = (asset: AssetItem): string | null => {
		if (!agentId) return null;
		// Serve through same-origin API to avoid CSP issues with preview subdomain
		return `/api/projects/${agentId}/assets/file/${asset.key}`;
	};

	const acceptTypes =
		selectedCategory === 'all' ? '' : ACCEPT_MAP[selectedCategory];
	const canUpload = selectedCategory !== 'all';

	if (!agentId) {
		return (
			<div className="flex-1 flex items-center justify-center bg-bg-3">
				<span className="text-text-50/50 text-sm">No project loaded</span>
			</div>
		);
	}

	return (
		<div className="flex-1 flex flex-col bg-bg-3 overflow-hidden">
			{/* Category tabs + Upload button */}
			<div className="flex items-center gap-2 px-4 py-3 border-b border-border-primary">
				<div className="flex items-center gap-1 bg-bg-1 rounded-md p-0.5">
					{CATEGORY_TABS.map(tab => (
						<button
							key={tab.value}
							onClick={() => setSelectedCategory(tab.value)}
							className={clsx(
								'px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1',
								selectedCategory === tab.value
									? 'bg-bg-4 text-text-primary'
									: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
							)}
						>
							<tab.icon className="size-3" />
							{tab.label}
						</button>
					))}
				</div>
				<div className="flex-1" />
				{canUpload ? (
					<>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							disabled={uploading}
							className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
						>
							{uploading ? <RefreshCw className="size-3 animate-spin" /> : <Upload className="size-3" />}
							Upload
						</button>
						<input
							ref={fileInputRef}
							type="file"
							multiple
							accept={acceptTypes}
							className="hidden"
							onChange={(e) => e.target.files && handleUpload(e.target.files)}
						/>
					</>
				) : (
					<span className="text-[10px] text-text-50/50 text-right max-w-[160px] leading-tight">
					</span>
				)}
			</div>

			{/* Asset grid */}
			<div className="flex-1 overflow-y-auto p-4">
				{loading ? (
					<div className="flex items-center justify-center h-32">
						<RefreshCw className="size-5 text-accent animate-spin" />
					</div>
				) : filteredAssets.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-32 gap-2">
						<File className="size-8 text-text-50/30" />
						<span className="text-text-50/50 text-sm">No assets yet. Upload files to use in your project.</span>
					</div>
				) : (
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
						{filteredAssets.map(asset => (
							<AssetCard
								key={asset.key}
								asset={asset}
								assetUrl={getAssetUrl(asset)}
								onDelete={() => handleDelete(asset)}
								isSelected={asset.key === highlightedAssetKey}
								cardRef={(node) => {
									assetRefs.current[asset.key] = node;
								}}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function AssetCard({
	asset,
	assetUrl,
	onDelete,
	isSelected,
	cardRef,
}: {
	asset: AssetItem;
	assetUrl: string | null;
	onDelete: () => void;
	isSelected?: boolean;
	cardRef?: (node: HTMLDivElement | null) => void;
}) {
	const isImage = asset.category === 'images';

	return (
		<div
			ref={cardRef}
			className={clsx(
				'group relative overflow-hidden rounded-lg border bg-bg-2 transition-colors',
				isSelected
					? 'border-accent ring-2 ring-accent/30'
					: 'border-border-primary hover:border-accent',
			)}
		>
			{/* Preview area */}
			<div className="aspect-square flex items-center justify-center bg-bg-1">
				{isImage && assetUrl ? (
					<img
						src={assetUrl}
						alt={asset.name}
						className="w-full h-full object-cover"
						loading="lazy"
					/>
				) : (
					<CategoryIcon category={asset.category} className="size-8 text-text-50/30" />
				)}
			</div>

			{/* Info */}
			<div className="px-2 py-1.5">
				<p className="text-xs text-text-primary truncate" title={asset.name}>{asset.name}</p>
				<p className="text-[10px] text-text-50/50">{formatFileSize(asset.size)}</p>
			</div>

			{/* Delete button */}
			<button
				onClick={(e) => { e.stopPropagation(); onDelete(); }}
				className="absolute top-1 right-1 p-1 bg-bg-1/80 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
				title="Delete asset"
			>
				<Trash2 className="size-3 text-red-400" />
			</button>
		</div>
	);
}

function CategoryIcon({ category, className }: { category: AssetCategory; className?: string }) {
	switch (category) {
		case 'images': return <Image className={className} />;
		case 'video': return <Video className={className} />;
		case '3d': return <Box className={className} />;
		case 'audio': return <Music className={className} />;
		case 'fonts': return <Type className={className} />;
		default: return <File className={className} />;
	}
}
