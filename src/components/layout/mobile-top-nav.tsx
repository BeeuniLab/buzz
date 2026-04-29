import { useAuth } from '@/contexts/auth-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { useLocation } from 'react-router';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuthModal } from '@/components/auth/AuthModalProvider';

export function MobileTopNav() {
	const isMobile = useIsMobile();
	const { user } = useAuth();
	const { pathname } = useLocation();
	const { showAuthModal } = useAuthModal();

	// Only show on mobile, for unauthenticated users, on discover-context pages
	if (!isMobile || user) return null;

	const isDiscoverContext =
		pathname === '/' ||
		pathname.startsWith('/feed') ||
		pathname.startsWith('/discover') ||
		pathname.startsWith('/legal') ||
		pathname.startsWith('/profile') ||
		pathname.startsWith('/build');

	if (!isDiscoverContext) return null;

	return (
		<div className="flex items-center justify-between px-3 py-2 bg-bg-2 border-b-2 border-[var(--neo-border-color)]">
			<div className="flex items-center gap-2">
				<SidebarTrigger className="h-8 w-8 text-text-primary rounded-lg border-2 border-[var(--neo-border-color)] shadow-[1px_1px_0px_0px_var(--neo-border-color)]" />
			</div>

			<a href="/" className="flex items-center gap-2">
				<img src="/logo.svg" alt="BuzzPlay" className="h-6 w-6" />
				<span className="text-sm font-extrabold text-text-primary uppercase tracking-wide">BUZZPLAY</span>
			</a>

			<button
				onClick={() => showAuthModal()}
				className="px-3 py-1.5 text-xs font-bold rounded-lg border-2 border-[var(--neo-border-color)] bg-neo-orange text-[#1a1a1a] shadow-[2px_2px_0px_0px_var(--neo-border-color)] hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
			>
				Sign In
			</button>
		</div>
	);
}
