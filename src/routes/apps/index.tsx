import { useNavigate } from 'react-router';
import { motion } from 'framer-motion';
import { usePaginatedApps } from '@/hooks/use-paginated-apps';
import { AppListContainer } from '@/components/shared/AppListContainer';
import { AppFiltersForm } from '@/components/shared/AppFiltersForm';
import { VisibilityFilter } from '@/components/shared/VisibilityFilter';

const titleLetters = [
	{ char: 'M', className: 'text-neo-pink' },
	{ char: 'Y', className: 'text-neo-orange' },
	{ char: ' ', className: 'w-4 sm:w-6' },
	{ char: 'A', className: 'text-neo-cyan' },
	{ char: 'P', className: 'text-neo-green' },
	{ char: 'P', className: 'text-neo-purple' },
	{ char: 'S', className: 'text-neo-yellow' },
];

export default function AppsPage() {
	const navigate = useNavigate();

	const {
		// Filter state
		searchQuery,
		setSearchQuery,
		filterFramework,
		filterVisibility,
		sortBy,
		period,

		// Data state
		apps,
		loading,
		loadingMore,
		error,
		totalCount,
		hasMore,

		// Form handlers
		handleSearchSubmit,
		handlePeriodChange,
		handleFrameworkChange,
		handleVisibilityChange,

		// Pagination handlers
		refetch,
		loadMore,
	} = usePaginatedApps({
		type: 'user',
		defaultSort: 'recent',
		includeVisibility: true,
		limit: 20,
	});

	return (
		<div className="min-h-screen bg-bg-3">
			<div className="container mx-auto px-4 py-8">
				<motion.div
					initial={{ opacity: 0, y: -20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
				>
					{/* Header */}
					<div className="mb-8">
						<h1
							aria-label="MY APPS"
							className="mb-3 flex flex-wrap items-center gap-x-1.5 font-[departureMono] text-5xl font-bold leading-none tracking-normal sm:gap-x-2 sm:text-6xl"
						>
							{titleLetters.map((letter, index) => (
								<span
									key={`${letter.char}-${index}`}
									aria-hidden="true"
									className={letter.className}
									style={{
										textShadow: letter.char === ' ' ? undefined : '2px 2px 0 var(--neo-border-color)',
									}}
								>
									{letter.char}
								</span>
							))}
						</h1>
						<p className="text-text-tertiary text-lg">
							{loading
								? 'Loading...'
								: `${totalCount} app${totalCount !== 1 ? 's' : ''} in your workspace`}
						</p>
					</div>

					<div className="flex flex-col gap-4">
						<div className="flex items-center gap-4">
							<VisibilityFilter
								value={filterVisibility}
								onChange={handleVisibilityChange}
							/>
						</div>
						
						<div>
							{/* Search and Filters */}
							<AppFiltersForm
								searchQuery={searchQuery}
								onSearchChange={setSearchQuery}
								onSearchSubmit={handleSearchSubmit}
								searchPlaceholder="Search your apps..."
								filterFramework={filterFramework}
								onFrameworkChange={handleFrameworkChange}
								filterVisibility={filterVisibility}
								onVisibilityChange={handleVisibilityChange}
								showVisibility={false}
								period={period}
								onPeriodChange={handlePeriodChange}
								sortBy={sortBy}
							/>
						</div>
					</div>

					{/* Unified App List */}
					<AppListContainer
						apps={apps}
						loading={loading}
						loadingMore={loadingMore}
						error={error}
						hasMore={hasMore}
						totalCount={totalCount}
						sortBy={sortBy}
						onAppClick={(appId) => navigate(`/app/${appId}`)}
						getAppHref={(appId) => `/app/${appId}`}
						onLoadMore={loadMore}
						onRetry={refetch}
						showUser={true}
						showStats={true}
						showActions={false}
						showAuthor={false}
						gridClassName="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3"
						infiniteScroll={true}
						emptyState={
							!searchQuery &&
							filterFramework === 'all' &&
							filterVisibility === 'all' &&
							sortBy === 'recent' &&
							totalCount === 0
								? {
										title: 'No apps yet',
										description:
											'Start building your first app with AI assistance.',
										action: <div></div>,
									}
								: undefined
						}
					/>
				</motion.div>
			</div>
		</div>
	);
}
