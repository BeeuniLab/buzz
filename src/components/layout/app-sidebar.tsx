import React from 'react';
import {
	Users,
	Settings,
	Plus,
	ChevronRight,
	Search,
	Globe,
	Lock,
	Users2,
	Bookmark,
	Compass,
	User,
	LogIn,
	LogOut,
	ChevronsUpDown,
	Sun,
	Moon,
	Monitor,
	PlaySquare,
	Loader2,
	Inbox,
} from 'lucide-react';
import './sidebar-overrides.css';
import { useRecentApps, useFavoriteApps, useApps } from '@/hooks/use-apps';
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuItem,
	SidebarMenuButton,
	SidebarMenuAction,
	SidebarSeparator,
	SidebarFooter,
	SidebarTrigger,
	useSidebar,
} from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/auth-context';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatDistanceToNow, isValid } from 'date-fns';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { AppActionsDropdown } from '@/components/shared/AppActionsDropdown';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
	DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import { LoginModal } from '@/components/auth/login-modal';
import { useTheme } from '@/contexts/theme-context';

interface App {
	id: string;
	title: string;
	framework?: string | null;
	updatedAt: Date | null;
	updatedAtFormatted?: string;
	visibility: 'private' | 'team' | 'board' | 'public';
	status: 'generating' | 'completed';
	isFavorite?: boolean;
}

interface Board {
	id: string;
	name: string;
	slug: string;
	memberCount: number;
	appCount: number;
	iconUrl?: string | null;
}

// Reusable AppMenuItem component for consistent app display
interface AppMenuItemProps {
	app: App;
	href: string;
	onNavigate: (href: string) => void;
	variant?: 'recent' | 'bookmarked' | 'running';
	showActions?: boolean;
	isCollapsed: boolean;
	getVisibilityIcon: (visibility: App['visibility']) => React.ReactNode;
}

function AppMenuItem({
	app,
	href,
	onNavigate,
	variant = 'recent',
	showActions = true,
	isCollapsed,
	getVisibilityIcon,
}: AppMenuItemProps) {
	const formatTimestamp = () => {
		if (variant === 'running') return 'Building now';
		if (app.updatedAtFormatted) return app.updatedAtFormatted;
		if (app.updatedAt && isValid(app.updatedAt)) {
			return formatDistanceToNow(app.updatedAt, { addSuffix: true });
		}
		return 'Recently';
	};

	return (
		<SidebarMenuItem className="group/app-item">
			<SidebarMenuButton
				asChild
				tooltip={app.title}
				className={cn(
					"cursor-pointer transition-opacity hover:opacity-75",
					!isCollapsed && showActions ? "pr-10" : "pr-0",
				)}
			>
				<a
					href={href}
					onClick={(e) => {
						e.preventDefault();
						onNavigate(href);
					}}
					className="w-full no-underline"
				>
					<div className="flex-1 min-w-0 pr-2">
						<div className="flex items-center gap-2 min-w-0">
							{variant === 'bookmarked' && (
								<Bookmark className="h-3 w-3 fill-yellow-500 text-yellow-500 flex-shrink-0" />
							)}
							{variant === 'running' && (
								<Loader2 className="h-3 w-3 animate-spin text-accent flex-shrink-0" />
							)}

							<div className="flex-1 min-w-0 overflow-hidden">
								<span className="font-medium flex justify-start items-center gap-2 text-text-primary/80 whitespace-nowrap">
									<span className="min-w-0 flex-1 truncate">
										{app.title}{' '}
									</span>
									<div className="flex-shrink-0 min-w-6">
										{getVisibilityIcon(app.visibility)}
									</div>
								</span>
							</div>
						</div>
						<p className="text-xs text-text-tertiary truncate">
							{formatTimestamp()}
						</p>
					</div>
				</a>
			</SidebarMenuButton>

			{!isCollapsed && showActions && (
				<SidebarMenuAction
					asChild
					className="opacity-0 group-hover/app-item:opacity-100 transition-opacity"
				>
					<AppActionsDropdown
						appId={app.id}
						appTitle={app.title}
						size="sm"
						className="h-6 w-6"
						showOnHover={false}
					/>
				</SidebarMenuAction>
			)}
		</SidebarMenuItem>
	);
}

function DiscoverSidebar({
	isCollapsed,
	navigate,
}: {
	isCollapsed: boolean;
	navigate: ReturnType<typeof useNavigate>;
}) {
	const pathname = location.pathname;
	const { requireAuth } = useAuthGuard();

	return (
		<>
			<SidebarGroup>
				<SidebarGroupContent>
					<div className={cn(isCollapsed ? 'pr-2' : 'px-1')}>
						<TooltipProvider delayDuration={0}>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										className={cn(
											'group flex w-full border-2 border-[var(--neo-border-color)] items-center gap-2 font-bold hover:cursor-pointer p-2 rounded-lg shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:shadow-[4px_4px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)] transition-all text-[15px]',
											isCollapsed
												? 'justify-center bg-neo-orange'
												: 'justify-start bg-neo-orange',
										)}
										onClick={() => navigate('/build')}
									>
										<Plus className="h-4 w-4 text-[#1a1a1a]" />
										{!isCollapsed && (
											<span className="font-bold text-[#1a1a1a]">
												Create
											</span>
										)}
									</button>
								</TooltipTrigger>
							</Tooltip>
						</TooltipProvider>
					</div>
				</SidebarGroupContent>
			</SidebarGroup>

			<SidebarGroup className="pt-4">
				<SidebarGroupContent>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => navigate('/')}
								tooltip="Home"
								className={cn(
									'group hover:cursor-pointer transition-all duration-200 h-10 text-[15px]',
									(pathname === '/' || pathname.startsWith('/feed')) && 'bg-neo-yellow/40 font-bold',
								)}
							>
								<PlaySquare className="h-5 w-5" />
								{!isCollapsed && <span>Home</span>}
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => navigate('/discover')}
								tooltip="Discover"
								className={cn(
									'group hover:cursor-pointer transition-all duration-200 h-10 text-[15px]',
																	pathname.startsWith('/discover') && 'bg-neo-yellow/40 font-bold',
								)}
							>
								<Compass className="h-5 w-5" />
								{!isCollapsed && <span>Discover</span>}
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => {
									if (requireAuth({ actionContext: 'to view your inbox', intendedUrl: '/inbox' })) {
										navigate('/inbox');
									}
								}}
								tooltip="Inbox"
								className={cn(
									'group hover:cursor-pointer transition-all duration-200 h-10 text-[15px]',
									pathname.startsWith('/inbox') && 'bg-neo-yellow/40 font-bold',
								)}
							>
								<Inbox className="h-5 w-5" />
								{!isCollapsed && <span>Inbox</span>}
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => {
									if (requireAuth({ actionContext: 'to view your profile', intendedUrl: '/profile' })) {
										navigate('/profile');
									}
								}}
								tooltip="Profile"
								className={cn(
									'group hover:cursor-pointer transition-all duration-200 h-10 text-[15px]',
									pathname === '/profile' && 'bg-neo-yellow/40 font-bold',
								)}
							>
								<User className="h-5 w-5" />
								{!isCollapsed && <span>Profile</span>}
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>
		</>
	);
}

function BuildSidebar({
	isCollapsed,
	navigate,
	recentApps,
	moreAvailable,
	favoriteApps,
	allApps,
	allAppsLoading,
	boards,
	searchQuery,
	setSearchQuery,
	expandedGroups,
	toggleGroup,
	getVisibilityIcon,
	getAppHref,
}: {
	isCollapsed: boolean;
	navigate: ReturnType<typeof useNavigate>;
	recentApps: App[];
	moreAvailable: boolean;
	favoriteApps: App[];
	allApps: App[];
	allAppsLoading: boolean;
	boards: Board[];
	searchQuery: string;
	setSearchQuery: (q: string) => void;
	expandedGroups: string[];
	toggleGroup: (group: string) => void;
	getVisibilityIcon: (visibility: App['visibility']) => React.ReactNode;
	getAppHref: (app: App) => string;
}) {
	const searchResults = React.useMemo(() => {
		if (!searchQuery.trim()) return [];
		return allApps.filter((app) =>
			app.title.toLowerCase().includes(searchQuery.toLowerCase().trim()),
		);
	}, [allApps, searchQuery]);

	const isSearching = searchQuery.trim().length > 0;

	return (
		<>
			{/* Discover Button */}
			<SidebarGroup>
				<SidebarGroupContent>
					<div className={cn(isCollapsed ? 'pr-2' : 'px-1')}>
						<TooltipProvider delayDuration={0}>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										className={cn(
											'group flex w-full border-2 border-[var(--neo-border-color)] items-center gap-2 font-bold hover:cursor-pointer p-2 rounded-lg shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:shadow-[4px_4px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)] transition-all',
											isCollapsed
												? 'justify-center bg-neo-cyan'
												: 'justify-start bg-neo-cyan',
										)}
										onClick={() => navigate('/')}
									>
										<PlaySquare className="h-4 w-4 text-[#1a1a1a]" />
										{!isCollapsed && (
											<span className="font-bold text-[#1a1a1a]">
												Home
											</span>
										)}
									</button>
								</TooltipTrigger>
							</Tooltip>
						</TooltipProvider>
						<TooltipProvider delayDuration={0}>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										className={cn(
											'group flex w-full border-2 border-[var(--neo-border-color)] items-center gap-2 font-bold hover:cursor-pointer p-2 rounded-lg shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:shadow-[4px_4px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)] transition-all mt-1',
											isCollapsed
												? 'justify-center bg-neo-orange'
												: 'justify-start bg-neo-orange',
										)}
										onClick={() => navigate('/build')}
									>
										<Plus className="h-4 w-4 text-[#1a1a1a]" />
										{!isCollapsed && (
											<span className="font-bold text-[#1a1a1a]">
												Create
											</span>
										)}
									</button>
								</TooltipTrigger>
							</Tooltip>
						</TooltipProvider>
					</div>
				</SidebarGroupContent>
			</SidebarGroup>

			{!isCollapsed && (
				<ScrollArea className="flex-1 px-1 relative overflow-visible">
					<SidebarGroup>
						{expandedGroups.includes('apps') && (
							<SidebarGroupContent>
								{/* Search */}
								<div className="relative mb-4 mt-2 pr-2 pb-1">
									<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary z-10" />
									<Input
										placeholder="Search apps..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="h-10 w-full pl-9 placeholder:text-text-tertiary"
									/>
								</div>
								<SidebarMenu>
									{isSearching ? (
										<>
											{allAppsLoading ? (
												<SidebarMenuItem>
													<div className="flex items-center justify-center py-4">
														<div className="text-sm text-text-tertiary">Searching...</div>
													</div>
												</SidebarMenuItem>
											) : searchResults.length > 0 ? (
												<>
													<SidebarMenuItem>
														<div className="px-2 py-1 text-xs text-text-tertiary">
															Found {searchResults.length} app{searchResults.length !== 1 ? 's' : ''}
														</div>
													</SidebarMenuItem>
													{searchResults.map((app) => (
														<AppMenuItem
															key={app.id}
															app={app}
															href={getAppHref(app)}
															onNavigate={(href) => navigate(href)}
															variant={app.status === 'generating' ? 'running' : 'recent'}
															showActions={true}
															isCollapsed={isCollapsed}
															getVisibilityIcon={getVisibilityIcon}
														/>
													))}
												</>
											) : (
												<SidebarMenuItem>
													<div className="flex items-center justify-center py-4">
														<div className="text-sm text-text-tertiary">
															No apps found for "{searchQuery}"
														</div>
													</div>
												</SidebarMenuItem>
											)}
										</>
									) : (
										<>
											{recentApps.map((app) => (
												<AppMenuItem
													key={app.id}
													app={app}
													href={getAppHref(app)}
													onNavigate={(href) => navigate(href)}
													variant={app.status === 'generating' ? 'running' : 'recent'}
													showActions={true}
													isCollapsed={isCollapsed}
													getVisibilityIcon={getVisibilityIcon}
												/>
											))}
											{moreAvailable && (
												<SidebarMenuItem>
													<SidebarMenuButton
														onClick={() => navigate('/apps')}
														tooltip="View all apps"
														className="text-text-tertiary hover:text-text-primary view-all-button"
													>
														<ChevronRight className="h-4 w-4" />
														{!isCollapsed && (
															<span className="font-medium text-text-primary/80">
																View all apps →
															</span>
														)}
													</SidebarMenuButton>
												</SidebarMenuItem>
											)}
										</>
									)}
								</SidebarMenu>
							</SidebarGroupContent>
						)}
					</SidebarGroup>

					{/* Favorites */}
					{favoriteApps.length > 0 && (
						<>
							<SidebarSeparator />
							<SidebarGroup className='mt-4'>
								<SidebarGroupLabel
									className={cn(
										'flex items-center gap-2 text-md text-text-primary',
										isCollapsed && 'justify-center px-0',
									)}
								>
									{!isCollapsed && 'Bookmarked'}
									<Bookmark className="h-5 w-5 fill-yellow-500 text-yellow-500" />
								</SidebarGroupLabel>
								<SidebarGroupContent>
									<SidebarMenu>
										{favoriteApps.map((app) => (
											<AppMenuItem
												key={app.id}
												app={app}
												href={getAppHref(app)}
												onNavigate={(href) => navigate(href)}
												showActions={true}
												isCollapsed={isCollapsed}
												getVisibilityIcon={getVisibilityIcon}
											/>
										))}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						</>
					)}

					{/* Boards */}
					{boards.length > 0 && (
						<>
							<SidebarSeparator />
							<SidebarGroup>
								<SidebarGroupLabel
									className={cn(
										'flex items-center cursor-pointer hover:text-text-primary transition-colors',
										isCollapsed ? 'justify-center px-0' : 'justify-between',
									)}
									onClick={() => toggleGroup('boards')}
								>
									{isCollapsed ? (
										<TooltipProvider delayDuration={0}>
											<Tooltip>
												<TooltipTrigger>
													<Users className="h-4 w-4" />
												</TooltipTrigger>
												<TooltipContent side="right" className="ml-2">
													My Boards
												</TooltipContent>
											</Tooltip>
										</TooltipProvider>
									) : (
										<>
											<div className="flex items-center gap-2">
												<Users className="h-4 w-4" />
												<span>My Boards</span>
											</div>
											<ChevronRight
												className={cn(
													'h-4 w-4 transition-transform',
													expandedGroups.includes('boards') && 'rotate-90',
												)}
											/>
										</>
									)}
								</SidebarGroupLabel>
								{expandedGroups.includes('boards') && (
									<SidebarGroupContent>
										<SidebarMenu>
											{boards.map((board) => (
												<SidebarMenuItem key={board.id}>
													<SidebarMenuButton
														onClick={() => navigate(`/boards/${board.slug}`)}
														tooltip={board.name}
														className="board-item-button"
													>
														<div
															className={cn(
																'rounded-lg flex-shrink-0 flex items-center justify-center transition-colors',
																'h-8 w-8',
																isCollapsed ? 'bg-sidebar-accent' : 'bg-sidebar-accent/50',
															)}
														>
															<Users2 className="h-4 w-4 text-sidebar-accent-foreground" />
														</div>
														{!isCollapsed && (
															<div className="flex-1 min-w-0">
																<p className="text-sm font-medium truncate">{board.name}</p>
																<p className="text-xs text-text-tertiary truncate">
																	{board.memberCount} members • {board.appCount} apps
																</p>
															</div>
														)}
													</SidebarMenuButton>
												</SidebarMenuItem>
											))}
											<SidebarMenuItem>
												<SidebarMenuButton
													onClick={() => navigate('/boards')}
													tooltip="Browse all boards"
													className="text-text-tertiary hover:text-text-primary view-all-button"
												>
													<Plus className="h-4 w-4" />
													{!isCollapsed && (
														<span className="font-medium text-text-primary/80 ml-2">
															Browse all boards
														</span>
													)}
												</SidebarMenuButton>
											</SidebarMenuItem>
										</SidebarMenu>
									</SidebarGroupContent>
								)}
							</SidebarGroup>
						</>
					)}
				</ScrollArea>
			)}
		</>
	);
}

export function AppSidebar() {
	const { user, login, loginWithEmail, register, logout, error: authError, clearError } = useAuth();
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = React.useState('');
	const [expandedGroups, setExpandedGroups] = React.useState<string[]>([
		'apps',
		'boards',
	]);
	const { state } = useSidebar();
	const isCollapsed = state === 'collapsed';

	// Fetch real data from API
	const { apps: recentApps, moreAvailable } = useRecentApps();
	const { apps: favoriteApps } = useFavoriteApps();
	const { apps: allApps, loading: allAppsLoading } = useApps();

	const getAppHref = React.useCallback((app: App) => {
		return app.status === 'generating' ? `/chat/${app.id}` : `/app/${app.id}`;
	}, []);

	const boards: Board[] = [];

	const getVisibilityIcon = (visibility: App['visibility']) => {
		switch (visibility) {
			case 'private':
				return <Lock className="h-3 w-3" />;
			case 'team':
				return <Users2 className="h-3 w-3" />;
			case 'board':
				return <Globe className="h-3 w-3" />;
			case 'public':
				return <Globe className="h-3 w-3" />;
		}
	};

	const toggleGroup = (group: string) => {
		setExpandedGroups((prev) =>
			prev.includes(group)
				? prev.filter((g) => g !== group)
				: [...prev, group],
		);
	};

	const [showLoginModal, setShowLoginModal] = React.useState(false);

	const isDiscoverContext = location.pathname === '/' || location.pathname.startsWith('/profile') || location.pathname.startsWith('/feed') || location.pathname.startsWith('/discover') || location.pathname.startsWith('/legal') || location.pathname.startsWith('/inbox');

	const getInitials = () => {
		if (!user) return '?';
		if (user.displayName) {
			return user.displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
		}
		return user.email?.charAt(0).toUpperCase() || '?';
	};

	const { setTheme } = useTheme();

	return (
		<>
			<Sidebar
				collapsible="icon"
				className={cn(
					'bg-bg-2 transition-all duration-300 ease-in-out border-r-3 border-[var(--neo-border-color)]',
				)}
			>
				<div className={cn(
					'flex items-center px-3 py-2.5',
					isCollapsed ? 'justify-center' : 'justify-between'
				)}>
					<a href="/" className="flex items-center gap-2.5 shrink-0">
						<img src="/logo.svg" alt="BuzzPlay" className="h-7 w-7 shrink-0" />
						{!isCollapsed && (
							<span className="text-base font-extrabold text-text-primary uppercase tracking-wide leading-none">BUZZPLAY</span>
						)}
					</a>
					{!isCollapsed && (
						<SidebarTrigger className="h-7 w-7 text-text-tertiary hover:text-text-primary rounded-lg border-2 border-[var(--neo-border-color)] shadow-[1px_1px_0px_0px_var(--neo-border-color)] hover:shadow-[2px_2px_0px_0px_var(--neo-border-color)] transition-all" />
					)}
				</div>

				<SidebarContent>
					{isDiscoverContext ? (
						<DiscoverSidebar isCollapsed={isCollapsed} navigate={navigate} />
					) : (
						<BuildSidebar
							isCollapsed={isCollapsed}
							navigate={navigate}
							recentApps={recentApps}
							moreAvailable={moreAvailable}
							favoriteApps={favoriteApps}
							allApps={allApps}
							allAppsLoading={allAppsLoading}
							boards={boards}
							searchQuery={searchQuery}
							setSearchQuery={setSearchQuery}
							expandedGroups={expandedGroups}
							toggleGroup={toggleGroup}
							getVisibilityIcon={getVisibilityIcon}
							getAppHref={getAppHref}
						/>
					)}
				</SidebarContent>

				<SidebarFooter className="p-2">
					{isCollapsed && (
						<div className="flex justify-center mb-1">
							<SidebarTrigger className="h-7 w-7 text-text-tertiary hover:text-text-primary" />
						</div>
					)}
					{/* Social Links */}
					<div className={cn('flex items-center gap-1 mb-1', isCollapsed ? 'flex-col' : 'justify-center')}>
						<a
							href="https://x.com/BuzzPlayAPP"
							target="_blank"
							rel="noopener noreferrer"
							className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-1/50 transition-colors"
							title="X"
						>
							<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
							</svg>
						</a>
						<a
							href="https://www.tiktok.com/@buzzplayapp?_r=1&_t=ZS-969QUnSvwJw"
							target="_blank"
							rel="noopener noreferrer"
							className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-1/50 transition-colors"
							title="TikTok"
						>
							<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64c.3 0 .6.05.88.14V9.4a6.3 6.3 0 00-.88-.05A6.34 6.34 0 003.14 15.69a6.34 6.34 0 0010.86 4.45 6.34 6.34 0 001.82-4.47v-6.94a8.16 8.16 0 004.77 1.53V6.69z" />
							</svg>
						</a>
						<a
							href="https://www.threads.com/@buzzplayapp"
							target="_blank"
							rel="noopener noreferrer"
							className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-1/50 transition-colors"
							title="Threads"
						>
							<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.17.408-2.243 1.33-3.023.812-.687 1.9-1.085 3.088-1.175.857-.065 1.72-.017 2.557.089-.075-.546-.244-1.006-.507-1.353-.382-.505-1.03-.77-1.882-.77h-.091c-.648.012-1.204.15-1.634.394l-.955-1.746c.665-.366 1.51-.58 2.452-.6h.162c1.378 0 2.46.467 3.128 1.352.493.652.793 1.498.891 2.5.483.126.94.28 1.36.472 1.16.528 2.063 1.327 2.612 2.314.66 1.186.816 2.674.452 4.193-.535 2.236-1.828 3.863-3.845 4.837-1.603.775-3.568 1.18-5.845 1.2zM12.36 13.22c-.832.06-1.49.27-1.92.612-.33.263-.487.6-.467.998.035.655.625 1.423 2.028 1.347.986-.054 1.727-.434 2.275-1.116.376-.467.637-1.073.778-1.812-.585-.1-1.18-.157-1.786-.157-.295 0-.594.013-.907.038z"/>
							</svg>
						</a>
						<a
							href="https://discord.gg/sGvn2hA5Nw"
							target="_blank"
							rel="noopener noreferrer"
							className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-1/50 transition-colors"
							title="Discord"
						>
							<svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
								<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1569 2.4189z" />
							</svg>
						</a>
					</div>
					<SidebarMenu>
						<SidebarMenuItem>
							{user ? (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<SidebarMenuButton
											tooltip={user.displayName || user.email}
											className="hover:bg-bg-1/50 cursor-pointer"
										>
											<Avatar className="h-6 w-6">
												<AvatarImage src={user.avatarUrl} alt={user.displayName || user.email} />
												<AvatarFallback className="text-xs bg-text-secondary/10 text-text-primary font-semibold">
													{getInitials()}
												</AvatarFallback>
											</Avatar>
											{!isCollapsed && (
												<div className="flex-1 min-w-0 text-left">
													<p className="text-sm font-medium truncate">{user.displayName || user.username || 'User'}</p>
												</div>
											)}
											{!isCollapsed && <ChevronsUpDown className="h-3.5 w-3.5 text-text-tertiary shrink-0" />}
										</SidebarMenuButton>
									</DropdownMenuTrigger>
									<DropdownMenuContent side="top" align="end">
										<DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
											<Settings className="size-5" />
											Settings
										</DropdownMenuItem>
										<DropdownMenuSub>
											<DropdownMenuSubTrigger className="cursor-pointer">
												<Sun className="size-5" />
												Theme
											</DropdownMenuSubTrigger>
											<DropdownMenuPortal>
												<DropdownMenuSubContent>
													<DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer">
														<Sun className="size-5" />
														Light
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer">
														<Moon className="size-5" />
														Dark
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer">
														<Monitor className="size-5" />
														System
													</DropdownMenuItem>
												</DropdownMenuSubContent>
											</DropdownMenuPortal>
										</DropdownMenuSub>
										<DropdownMenuItem onClick={() => logout()} className="cursor-pointer text-destructive focus:text-destructive">
											<LogOut className="size-5" />
											Sign Out
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							) : (
								<SidebarMenuButton
									tooltip="Sign In"
									className="hover:bg-bg-1/50 cursor-pointer"
									onClick={() => setShowLoginModal(true)}
								>
									<LogIn className="h-5 w-5" />
									{!isCollapsed && <span className="font-medium">Sign In</span>}
								</SidebarMenuButton>
							)}
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarFooter>
			</Sidebar>

			<LoginModal
				isOpen={showLoginModal}
				onClose={() => setShowLoginModal(false)}
				onLogin={(provider) => {
					login(provider);
					setShowLoginModal(false);
				}}
				onEmailLogin={async (credentials) => {
					await loginWithEmail(credentials);
					if (!authError) setShowLoginModal(false);
				}}
				onOAuthLogin={(provider) => {
					login(provider);
					setShowLoginModal(false);
				}}
				onRegister={async (data) => {
					await register(data);
					if (!authError) setShowLoginModal(false);
				}}
				error={authError}
				onClearError={clearError}
			/>
		</>
	);
}
