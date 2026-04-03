import { useLocation, useNavigate } from 'react-router';
import { Home, Compass, Plus, User } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
	{ icon: Home, label: 'Home', path: '/', isCreate: false },
	{ icon: Compass, label: 'Discover', path: '/discover', isCreate: false },
	{ icon: Plus, label: 'Create', path: '/build', isCreate: true },
	{ icon: User, label: 'Profile', path: '/profile', isCreate: false },
] as const;

export function MobileBottomNav() {
	const isMobile = useIsMobile();
	const location = useLocation();
	const navigate = useNavigate();

	if (!isMobile) return null;

	// Hide on chat/build routes (immersive contexts)
	if (location.pathname.startsWith('/chat')) return null;

	return (
		<nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 h-14 bg-bg-2 border-t-2 border-[var(--neo-border-color)] flex items-center justify-around">
			{NAV_ITEMS.map(({ icon: Icon, label, path, isCreate }) => {
				const isActive = path === '/'
					? location.pathname === '/' || location.pathname.startsWith('/feed')
					: location.pathname.startsWith(path);

				if (isCreate) {
					return (
						<button
							key={path}
							onClick={() => navigate(path)}
							className="flex flex-col items-center gap-0.5 -mt-3"
						>
							<div className="bg-neo-orange rounded-full p-2.5 border-2 border-[var(--neo-border-color)] shadow-[2px_2px_0px_0px_var(--neo-border-color)]">
								<Icon className="h-5 w-5 text-[#1a1a1a]" />
							</div>
							<span className="text-[10px] font-medium text-text-tertiary">{label}</span>
						</button>
					);
				}

				return (
					<button
						key={path}
						onClick={() => navigate(path)}
						className="flex flex-col items-center gap-0.5 py-1"
					>
						<Icon className={cn(
							'h-5 w-5 transition-colors',
							isActive ? 'text-accent' : 'text-text-tertiary',
						)} />
						<span className={cn(
							'text-[10px] font-medium transition-colors',
							isActive ? 'text-accent' : 'text-text-tertiary',
						)}>{label}</span>
					</button>
				);
			})}
		</nav>
	);
}
