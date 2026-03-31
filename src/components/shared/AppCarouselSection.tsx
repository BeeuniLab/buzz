import { AppCard } from '@/components/shared/AppCard';
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselPrevious,
	CarouselNext,
} from '@/components/ui/carousel';
import type { AppWithUserAndStats, EnhancedAppData, AppWithFavoriteStatus } from '@/api-types';

type AppCardData =
	| AppWithFavoriteStatus
	| (EnhancedAppData & { updatedAtFormatted?: string })
	| AppWithUserAndStats;

interface AppCarouselSectionProps {
	title: string;
	apps: AppCardData[];
	loading: boolean;
	onAppClick: (appId: string) => void;
	size?: 'large' | 'small';
}

export function AppCarouselSection({ title, apps, loading, onAppClick, size = 'large' }: AppCarouselSectionProps) {
	if (!loading && apps.length === 0) return null;

	// Large: ~5 cards visible, Small: ~7 cards visible (matching Astrocade proportions)
	const basisClass = size === 'large'
		? 'basis-[45%] md:basis-[30%] lg:basis-[22%] xl:basis-[18%]'
		: 'basis-[30%] md:basis-[22%] lg:basis-[16%] xl:basis-[13%]';

	return (
		<div className="mb-6">
			<h2 className="text-xl font-bold mb-3">{title}</h2>
			{loading ? (
				<div className="flex gap-3 overflow-hidden">
					{Array.from({ length: size === 'large' ? 5 : 7 }).map((_, i) => (
						<div
							key={i}
							className={`min-w-0 shrink-0 ${basisClass}`}
						>
							<div className="aspect-[3/4] rounded-xl bg-bg-3 animate-pulse" />
							<div className="mt-1.5 h-3 w-16 rounded bg-bg-3 animate-pulse" />
						</div>
					))}
				</div>
			) : (
				<Carousel
					opts={{
						align: 'start',
						dragFree: true,
					}}
					className="w-full"
				>
					<CarouselContent className="-ml-3">
						{apps.map((app) => (
							<CarouselItem
								key={app.id}
								className={`pl-3 ${basisClass}`}
							>
								<AppCard
									app={app}
									onClick={onAppClick}
									showUser={true}
									showStats={true}
									cardSize={size}
								/>
							</CarouselItem>
						))}
					</CarouselContent>
					<CarouselPrevious className="-left-4 bg-bg-1/80 backdrop-blur-sm border-border-primary" />
					<CarouselNext className="-right-4 bg-bg-1/80 backdrop-blur-sm border-border-primary" />
				</Carousel>
			)}
		</div>
	);
}
