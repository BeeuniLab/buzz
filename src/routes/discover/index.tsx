import React from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AppListContainer } from '@/components/shared/AppListContainer';
import { AppCarouselSection } from '@/components/shared/AppCarouselSection';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { AppWithUserAndStats } from '@/api-types';

const CATEGORIES = [
	'All',
];

export default function DiscoverPage() {
	const navigate = useNavigate();
	const [popularApps, setPopularApps] = React.useState<AppWithUserAndStats[]>([]);
	const [trendingApps, setTrendingApps] = React.useState<AppWithUserAndStats[]>([]);
	const [recentApps, setRecentApps] = React.useState<AppWithUserAndStats[]>([]);
	const [carouselLoading, setCarouselLoading] = React.useState(true);
	const [selectedCategory, setSelectedCategory] = React.useState('All');
	const [manualSearchQuery, setManualSearchQuery] = React.useState('');

	// Fetch carousel data
	React.useEffect(() => {
		async function fetchCarouselData() {
			setCarouselLoading(true);
			try {
				const [popRes, trendRes, recentRes] = await Promise.all([
					apiClient.getPublicApps({ sort: 'popular', limit: 20, period: 'all' }),
					apiClient.getPublicApps({ sort: 'trending', limit: 20, period: 'week' }),
					apiClient.getPublicApps({ sort: 'recent', limit: 20, period: 'today' }),
				]);
				if (popRes.success && popRes.data) {
					setPopularApps(popRes.data.apps);
				}
				if (trendRes.success && trendRes.data) {
					setTrendingApps(trendRes.data.apps);
				}
				if (recentRes.success && recentRes.data) {
					setRecentApps(recentRes.data.apps);
				}
			} catch {
				// Silently handle
			} finally {
				setCarouselLoading(false);
			}
		}
		fetchCarouselData();
	}, []);

	// Category grid with infinite scroll
	const {
		apps: categoryApps,
		loading: categoryLoading,
		loadingMore,
		error,
		totalCount,
		hasMore,
		sortBy,
		setSearchQuery,
		handleSearchSubmit,
		refetch,
		loadMore,
	} = usePaginatedApps({
		type: 'public',
		defaultSort: 'recent',
		defaultPeriod: 'all',
		limit: 20,
		includeHiddenFromBrowse: manualSearchQuery.trim().length > 0,
	});

	const handleCategoryChange = (cat: string) => {
		setSelectedCategory(cat);
		setManualSearchQuery('');
		if (cat === 'All') {
			setSearchQuery('');
		} else {
			setSearchQuery(cat);
		}
	};

	const handleManualSearchChange = (query: string) => {
		setManualSearchQuery(query);
		setSelectedCategory('All');
		setSearchQuery(query);
	};

	const clearManualSearch = () => {
		setManualSearchQuery('');
		setSelectedCategory('All');
		setSearchQuery('');
	};

	const handleAppClick = (appId: string) => navigate(`/feed/${appId}`);
	const isTextSearching = manualSearchQuery.trim().length > 0;

	const renderSearchForm = () => (
		<form onSubmit={handleSearchSubmit}>
			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
				<Input
					type="text"
					inputMode="search"
					value={manualSearchQuery}
					onChange={(event) => handleManualSearchChange(event.target.value)}
					placeholder="Search games or creators"
					className="h-11 rounded-full border-2 border-border-primary bg-bg-4 pl-10 pr-11 text-sm shadow-neo-sm"
				/>
				{manualSearchQuery && (
					<button
						type="button"
						onClick={clearManualSearch}
						aria-label="Clear search"
						className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-text-tertiary transition-colors hover:bg-bg-3 hover:text-text-primary"
					>
						<X className="size-4" />
					</button>
				)}
			</div>
		</form>
	);

	return (
		<div className="min-h-screen pb-32 md:pb-0">
			<div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 px-3 md:hidden">
				{renderSearchForm()}
			</div>
			<div className="container mx-auto px-2 md:px-4 py-4">
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					<div className="mb-5 hidden max-w-2xl md:block">
						{renderSearchForm()}
					</div>

					{/* Recent Section */}
					{!isTextSearching && recentApps.length > 0 && (
						<AppCarouselSection
							title="Recent"
							apps={recentApps}
							loading={carouselLoading}
							onAppClick={handleAppClick}
							size="large"
						/>
					)}

					{/* Popular Section */}
					{!isTextSearching && (
						<AppCarouselSection
							title="Popular"
							apps={popularApps}
							loading={carouselLoading}
							onAppClick={handleAppClick}
							size="small"
						/>
					)}

					{/* Trending Section */}
					{!isTextSearching && (
						<AppCarouselSection
							title="Trending"
							apps={trendingApps}
							loading={carouselLoading}
							onAppClick={handleAppClick}
							size="large"
						/>
					)}

					{/* Categories Section */}
					<div className="mt-4">
						{!isTextSearching && <div className="flex gap-2 mb-6 overflow-x-auto md:flex-wrap pb-2 md:pb-0" style={{ scrollbarWidth: 'none' }}>
							{CATEGORIES.map((cat) => (
								<button
									key={cat}
									className={cn(
										'px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0',
										selectedCategory === cat
											? 'bg-text-primary text-bg-1'
											: 'bg-bg-3 text-text-tertiary hover:text-text-primary',
									)}
									onClick={() => handleCategoryChange(cat)}
								>
									{cat}
								</button>
							))}
						</div>}

						<AppListContainer
							apps={categoryApps}
							loading={categoryLoading}
							loadingMore={loadingMore}
							error={error}
							hasMore={hasMore}
							totalCount={totalCount}
							sortBy={sortBy}
							onAppClick={handleAppClick}
							onLoadMore={loadMore}
							onRetry={refetch}
							showUser={true}
							showStats={true}
							showTotalCount={false}
							infiniteScroll={true}
						/>
					</div>
				</motion.div>
			</div>
		</div>
	);
}
