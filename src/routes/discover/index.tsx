import React from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AppListContainer } from '@/components/shared/AppListContainer';
import { AppCarouselSection } from '@/components/shared/AppCarouselSection';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { AppWithUserAndStats } from '@/api-types';

const CATEGORIES = [
	'All',
	'Action',
	'Puzzle',
	'Strategy',
	'RPG',
	'Simulation',
	'Sports',
	'Creative',
	'Education',
];

export default function DiscoverPage() {
	const navigate = useNavigate();
	const [popularApps, setPopularApps] = React.useState<AppWithUserAndStats[]>([]);
	const [trendingApps, setTrendingApps] = React.useState<AppWithUserAndStats[]>([]);
	const [recentApps, setRecentApps] = React.useState<AppWithUserAndStats[]>([]);
	const [carouselLoading, setCarouselLoading] = React.useState(true);
	const [selectedCategory, setSelectedCategory] = React.useState('All');

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
		refetch,
		loadMore,
	} = usePaginatedApps({
		type: 'public',
		defaultSort: 'recent',
		defaultPeriod: 'all',
		limit: 20,
	});

	const handleCategoryChange = (cat: string) => {
		setSelectedCategory(cat);
		if (cat === 'All') {
			setSearchQuery('');
		} else {
			setSearchQuery(cat);
		}
	};

	const handleAppClick = (appId: string) => navigate(`/feed/${appId}`);

	return (
		<div className="min-h-screen">
			<div className="container mx-auto px-2 md:px-4 py-4">
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					{/* Recent Section */}
					{recentApps.length > 0 && (
						<AppCarouselSection
							title="Recent"
							apps={recentApps}
							loading={carouselLoading}
							onAppClick={handleAppClick}
							size="large"
						/>
					)}

					{/* Popular Section */}
					<AppCarouselSection
						title="Popular"
						apps={popularApps}
						loading={carouselLoading}
						onAppClick={handleAppClick}
						size="small"
					/>

					{/* Trending Section */}
					<AppCarouselSection
						title="Trending"
						apps={trendingApps}
						loading={carouselLoading}
						onAppClick={handleAppClick}
						size="large"
					/>

					{/* Categories Section */}
					<div className="mt-4">
						<div className="flex gap-2 mb-6 overflow-x-auto md:flex-wrap pb-2 md:pb-0" style={{ scrollbarWidth: 'none' }}>
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
						</div>

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
							infiniteScroll={true}
						/>
					</div>
				</motion.div>
			</div>
		</div>
	);
}
