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
	onClick: (id: string) => void;
	variant?: 'recent' | 'bookmarked';
	showActions?: boolean;
	isCollapsed: boolean;
	getVisibilityIcon: (visibility: App['visibility']) => React.ReactNode;
}

function AppMenuItem({
	app,
	onClick,
	variant = 'recent',
	showActions = true,
	isCollapsed,
	getVisibilityIcon,
}: AppMenuItemProps) {
	const formatTimestamp = () => {
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
				className="cursor-pointer transition-opacity hover:opacity-75 pr-0"
			>
				<a
					href={`/app/${app.id}`}
					onClick={(e) => {
						e.preventDefault();
						onClick(app.id);
					}}
					className="w-full no-underline"
				>
					<div className="flex-1 min-w-0 pr-2">
						<div className="flex items-center gap-2 min-w-0">
							{variant === 'bookmarked' && (
								<Bookmark className="h-3 w-3 fill-yellow-500 text-yellow-500 flex-shrink-0" />
							)}

							<div className="relative flex-1 min-w-0 overflow-hidden">
								<span className="font-medium flex justify-start  items-center  gap-2 text-text-primary/80 whitespace-nowrap">
									<span className="text-ellipsis w-fit overflow-hidden">
										{app.title}{' '}
									</span>
									<div className="flex-shrink-0 min-w-6">
										{getVisibilityIcon(app.visibility)}
									</div>
								</span>

								<div className="absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-bg-2 to-transparent pointer-events-none" />
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
					className="opacity-0 -mr-2 group-hover/app-item:opacity-100 transition-opacity"
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

function DiscoverSidebar({ isCollapsed, navigate }: { isCollapsed: boolean; navigate: ReturnType<typeof useNavigate> }) {
	const pathname = location.pathname;
	const { requireAuth } = useAuthGuard();

	return (
		<>
			{/* New Build Button */}
			<SidebarGroup>
				<SidebarGroupContent>
					<div className={cn(isCollapsed ? 'pr-2' : 'px-1')}>
						<TooltipProvider delayDuration={0}>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										className={cn(
											'group flex w-full border-[0.5px] border-bg-2 items-center gap-2 font-medium hover:opacity-80 hover:cursor-pointer p-2 rounded-md cursor-hand text-text-secondary hover:text-text-primary',
											isCollapsed
												? 'justify-center bg-accent'
												: 'justify-start bg-accent',
										)}
										onClick={() => navigate('/build')}
									>
										<Plus className="h-4 w-4 text-neutral-50" />
										{!isCollapsed && (
											<span className="font-medium text-neutral-50">
												New build
											</span>
										)}
									</button>
								</TooltipTrigger>
							</Tooltip>
						</TooltipProvider>
					</div>
				</SidebarGroupContent>
			</SidebarGroup>

			{/* Navigation */}
			<SidebarGroup>
				<SidebarGroupContent>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => navigate('/')}
								tooltip="Feed"
								className={cn(
									'group hover:opacity-80 hover:cursor-pointer transition-all duration-200',
									pathname === '/' && 'bg-bg-1/50 text-text-primary',
								)}
							>
								<PlaySquare className="h-5 w-5" />
								{!isCollapsed && <span className="font-medium">Feed</span>}
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<SidebarMenuButton
								onClick={() => navigate('/discover')}
								tooltip="Discover"
								className={cn(
									'group hover:opacity-80 hover:cursor-pointer transition-all duration-200',
									pathname === '/discover' && 'bg-bg-1/50 text-text-primary',
								)}
							>
								<Compass className="h-5 w-5" />
								{!isCollapsed && <span className="font-medium">Discover</span>}
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
									'group hover:opacity-80 hover:cursor-pointer transition-all duration-200',
									pathname === '/profile' && 'bg-bg-1/50 text-text-primary',
								)}
							>
								<User className="h-5 w-5" />
								{!isCollapsed && <span className="font-medium">Profile</span>}
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
											'group flex w-full border-[0.5px] border-bg-2 items-center gap-2 font-medium hover:opacity-80 hover:cursor-pointer p-2 rounded-md cursor-hand text-text-secondary hover:text-text-primary',
											isCollapsed
												? 'justify-center bg-accent'
												: 'justify-start bg-accent',
										)}
										onClick={() => navigate('/discover')}
									>
										<Compass className="h-4 w-4 text-neutral-50" />
										{!isCollapsed && (
											<span className="font-medium text-neutral-50">
												Discover
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
											'group flex w-full border-[0.5px] border-border-primary items-center gap-2 font-medium hover:opacity-80 hover:cursor-pointer p-2 rounded-md cursor-hand text-text-secondary hover:text-text-primary mt-1',
											isCollapsed
												? 'justify-center bg-bg-3'
												: 'justify-start bg-bg-3',
										)}
										onClick={() => navigate('/build')}
									>
										<Plus className="h-4 w-4" />
										{!isCollapsed && (
											<span className="font-medium">
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
				<ScrollArea className="flex-1 px-1 relative">
					<div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-bg-2 to-transparent pointer-events-none z-10"></div>
					<SidebarGroup>
						{expandedGroups.includes('apps') && (
							<SidebarGroupContent>
								{/* Search */}
								<div className="relative bg-bg-3 mb-4 mt-2">
									<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
									<Input
										placeholder="Search apps..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="h-10 w-full pl-8 placeholder:text-primary/40"
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
															onClick={(id) => navigate(`/app/${id}`)}
															variant="recent"
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
													onClick={(id) => navigate(`/app/${id}`)}
													variant="recent"
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
												onClick={(id) => navigate(`/app/${id}`)}
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

	const isDiscoverContext = location.pathname === '/' || location.pathname.startsWith('/profile') || location.pathname.startsWith('/feed') || location.pathname.startsWith('/discover');

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
					'bg-bg-2 transition-all duration-300 ease-in-out',
				)}
			>
				{/* Logo + Toggle Header */}
				<div className={cn('flex items-center px-3 py-3', isCollapsed ? 'justify-center' : 'justify-between')}>
					<a href="/" className="flex items-center gap-2 shrink-0">
						<img src="/logo.svg" alt="BuzzPlay" className="h-6 w-6" />
						{!isCollapsed && <span className="text-base font-semibold text-text-primary">BuzzPlay</span>}
					</a>
					{!isCollapsed && (
						<SidebarTrigger className="h-7 w-7 text-text-tertiary hover:text-text-primary" />
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
						/>
					)}
				</SidebarContent>

				<SidebarFooter>
					{isCollapsed && (
						<div className="flex justify-center mb-2">
							<SidebarTrigger className="h-7 w-7 text-text-tertiary hover:text-text-primary" />
						</div>
					)}
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
													<p className="text-xs text-text-tertiary truncate">{user.email}</p>
												</div>
											)}
											{!isCollapsed && <ChevronsUpDown className="h-4 w-4 text-text-tertiary shrink-0" />}
										</SidebarMenuButton>
									</DropdownMenuTrigger>
									<DropdownMenuContent side="top" align="start" className="w-[--radix-dropdown-menu-trigger-width]">
										<DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
											<Settings className="mr-2 h-4 w-4" />
											Settings
										</DropdownMenuItem>
										<DropdownMenuSub>
											<DropdownMenuSubTrigger className="cursor-pointer">
												<Sun className="mr-2 h-4 w-4" />
												Theme
											</DropdownMenuSubTrigger>
											<DropdownMenuPortal>
												<DropdownMenuSubContent>
													<DropdownMenuItem onClick={() => setTheme('light')} className="cursor-pointer">
														<Sun className="mr-2 h-4 w-4" />
														Light
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => setTheme('dark')} className="cursor-pointer">
														<Moon className="mr-2 h-4 w-4" />
														Dark
													</DropdownMenuItem>
													<DropdownMenuItem onClick={() => setTheme('system')} className="cursor-pointer">
														<Monitor className="mr-2 h-4 w-4" />
														System
													</DropdownMenuItem>
												</DropdownMenuSubContent>
											</DropdownMenuPortal>
										</DropdownMenuSub>
										<DropdownMenuItem onClick={() => logout()} className="cursor-pointer text-destructive focus:text-destructive">
											<LogOut className="mr-2 h-4 w-4" />
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
