import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import type { AppDetailsData } from '@/api-types';
import { apiClient, ApiError } from '@/lib/api-client';
import { appEvents } from '@/lib/app-events';
import {
	Star,
	Eye,
	Code2,
	ChevronLeft,
	Loader2,
	Play,
	Lock,
	Unlock,
	Globe,
	Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/auth-context';
import { toggleFavorite } from '@/hooks/use-apps';
import { toast } from 'sonner';
import { capitalizeFirstLetter, getPreviewUrl } from '@/lib/utils';
import { ConfirmDeleteDialog } from '@/components/shared/ConfirmDeleteDialog';

// Use proper types from API types
type AppDetails = AppDetailsData;

// Define supported actions for OAuth redirect
type PendingAction = 'favorite' | 'bookmark' | 'star' | 'fork' | 'remix';

// Supported actions constant for validation
const SUPPORTED_ACTIONS: PendingAction[] = [
	'favorite',
	'bookmark',
	'star',
	'fork',
	'remix',
];

// Action configuration type for reusability
interface ActionConfig {
	action: PendingAction;
	context: string;
	handler: () => Promise<void>;
	errorMessage: string;
}

// Action mapping for aliases (bookmark -> favorite, remix -> fork)
const ACTION_MAP: Record<PendingAction, string> = {
	favorite: 'favorite',
	bookmark: 'favorite',
	star: 'star',
	fork: 'fork',
	remix: 'fork',
};
export default function AppView() {
	const { id } = useParams();
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { user } = useAuth();
	const [app, setApp] = useState<AppDetails | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isDeploying, setIsDeploying] = useState(false);
	const [deploymentProgress, setDeploymentProgress] = useState<string>('');
	const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const previewIframeRef = useRef<HTMLIFrameElement>(null);


	const fetchAppDetails = useCallback(async () => {
		if (!id) return;

		try {
			setLoading(true);
			setError(null);

			// Fetch app details using API client
			const appResponse = await apiClient.getAppDetails(id);

			if (appResponse.success && appResponse.data) {
				const appData = appResponse.data;
				setApp(appData);
			} else {
				throw new Error(
					appResponse.error?.message || 'Failed to fetch app details',
				);
			}
		} catch (err) {
			console.error('Error fetching app:', err);
			if (err instanceof ApiError) {
				if (err.status === 404) {
					setError('App not found');
				} else {
					setError(`Failed to load app: ${err.message}`);
				}
			} else {
				setError(
					err instanceof Error ? err.message : 'Failed to load app',
				);
			}
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		fetchAppDetails();
	}, [id, fetchAppDetails]);

	// Redirect non-owners — /app is a management page, only owner can access
	useEffect(() => {
		if (!loading && app && user && app.userId !== user.id) {
			navigate('/', { replace: true });
		}
	}, [loading, app, user, navigate]);

	// Action configuration for reusability
	const actionConfigs: Record<string, ActionConfig> = useMemo(
		() => ({
			favorite: {
				action: 'favorite',
				context: 'to bookmark apps',
				handler: async () => {
					if (!app) return;
					const newState = await toggleFavorite(app.id);
					setApp((prev) =>
						prev
							? {
									...prev,
									userFavorited: newState,
								}
							: null,
					);
					toast.success(
						newState
							? 'Added to bookmarks'
							: 'Removed from bookmarks',
					);
				},
				errorMessage: 'Failed to update bookmarks',
			},
			star: {
				action: 'star',
				context: 'to star apps',
				handler: async () => {
					if (!app) return;
					const response = await apiClient.toggleAppStar(app.id);

					if (response.success && response.data) {
						setApp((prev) =>
							prev
								? {
										...prev,
										starCount: response.data?.starCount || 0,
									}
								: null,
						);
						toast.success(
							response.data.isStarred ? 'Starred!' : 'Unstarred',
						);
					} else {
						throw new Error(response.error?.message || 'Failed to star app');
					}
				},
				errorMessage: 'Failed to update star',
			},
			// fork: {
			// 	action: 'fork',
			// 	context: 'to remix this app',
			// 	handler: async () => {
			// 		if (!app) return;
			// 		const response = await apiClient.forkApp(app.id);

			// 		if (response.success && response.data) {
			// 			toast.success(
			// 				response.data.message ||
			// 					'App remixed successfully!',
			// 			);

			// 			// Emit app-created event for sidebar updates
			// 			appEvents.emitAppCreated(response.data.forkedAppId, {
			// 				title: `${app.title} (Remix)`,
			// 				description: app.description || undefined,
			// 				isForked: true,
			// 			});

			// 			navigate(`/chat/${response.data.forkedAppId}`);
			// 		} else {
			// 			throw new Error(
			// 				response.error?.message || 'Failed to remix app',
			// 			);
			// 		}
			// 	},
			// 	errorMessage: 'Failed to remix app',
			// },
		}),
		[app],
	);

	// const handleFork = useMemo(
	// 	() => createAuthenticatedHandler('fork'),
	// 	[createAuthenticatedHandler],
	// );

	// Handle pending actions after OAuth redirect
	const executePendingAction = useCallback(
		async (action: PendingAction) => {
			if (!app) return;

			const configKey = ACTION_MAP[action];
			if (!configKey) {
				console.warn('Unknown pending action:', action);
				return;
			}

			const config = actionConfigs[configKey];
			if (!config) {
				console.warn('No config found for action:', action);
				return;
			}

			try {
				await config.handler();
			} catch (error) {
				console.error(
					'Failed to execute pending action:',
					action,
					error,
				);
				toast.error(
					error instanceof ApiError
						? error.message
						: config.errorMessage,
				);
			}
		},
		[actionConfigs, app],
	);

	// Effect to handle pending actions after OAuth redirect
	useEffect(() => {
		if (!user || !app || loading) return;

		const actionParam = searchParams.get('action');
		if (!actionParam) return;

		// Validate action parameter against our supported types
		const action = SUPPORTED_ACTIONS.find((a) => a === actionParam);

		if (!action) {
			console.warn('Unsupported action parameter:', actionParam);
			return;
		}

		// Clear the action parameter from URL first
		const newSearchParams = new URLSearchParams(searchParams);
		newSearchParams.delete('action');
		setSearchParams(newSearchParams, { replace: true });

		// Execute the pending action
		executePendingAction(action);
	}, [
		user,
		app,
		loading,
		searchParams,
		setSearchParams,
		executePendingAction,
	]);


	const getAppUrl = () => {
		return app?.cloudflareUrl || app?.previewUrl || '';
	};

	const handlePreviewDeploy = async () => {
		if (!app || isDeploying) return;

		try {
			setIsDeploying(true);
			setDeploymentProgress('Connecting to agent...');
            const response = await apiClient.deployPreview(app.id);
            if (response.success && response.data) {
                const data = response.data;
                if (data.previewURL || data.tunnelURL) {
                    const newUrl = getPreviewUrl(
                        data.previewURL,
                        data.tunnelURL,
                    );
                    setApp((prev) =>
                        prev
                            ? {
                                    ...prev,
                                    cloudflareUrl: newUrl,
                                    previewUrl: newUrl,
                                }
                            : null,
                    );
                    setDeploymentProgress('Deployment complete!');
                }
            }
            setIsDeploying(false);
		} catch (error) {
			console.error('Error starting deployment:', error);
			setDeploymentProgress('Failed to start deployment');
			setIsDeploying(false);
			toast.error('Failed to start deployment');
		}
	};

	const handleToggleVisibility = async () => {
		if (!app || !user || !isOwner) {
			toast.error('You can only change visibility of your own apps');
			return;
		}

		const newVisibility =
			app.visibility === 'private' ? 'public' : 'private';

		try {
			setIsUpdatingVisibility(true);
			const response = await apiClient.updateAppVisibility(
				app.id,
				newVisibility,
			);

			if (response.success && response.data) {
				// Update the app state with new visibility
				setApp((prev) =>
					prev ? { ...prev, visibility: newVisibility } : null,
				);

				toast.success(
					response.data.message ||
						`App is now ${newVisibility === 'private' ? 'private' : 'public'}`,
				);
			} else {
				throw new Error(
					response.error?.message || 'Failed to update visibility',
				);
			}
		} catch (error) {
			console.error('Error updating app visibility:', error);
			const message = error instanceof Error
				? error.message
				: 'Failed to update visibility';
			const needsPlayableUpdate = newVisibility === 'public'
				&& message.toLowerCase().includes('prepare playable');

			toast.error(needsPlayableUpdate ? 'Prepare playable first' : message, needsPlayableUpdate ? {
				description: 'Open chat to update it.',
				action: {
					label: 'Open chat',
					onClick: () => navigate(`/chat/${app.id}`),
				},
			} : undefined);
		} finally {
			setIsUpdatingVisibility(false);
		}
	};

	const handleDeleteApp = async () => {
		if (!app) return;

		try {
			setIsDeleting(true);
			const response = await apiClient.deleteApp(app.id);

			if (response.success) {
				toast.success('App deleted successfully');
				setIsDeleteDialogOpen(false);

				// Emit global app deleted event
				appEvents.emitAppDeleted(app.id);

				navigate('/build', { replace: true });
			}
		} catch (error) {
			console.error('Error deleting app:', error);
			toast.error('An unexpected error occurred while deleting the app');
		} finally {
			setIsDeleting(false);
		}
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-bg-3 flex items-center justify-center">
				<div className="text-center">
					<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-text-tertiary" />
					<p className="text-text-tertiary">Loading app...</p>
				</div>
			</div>
		);
	}

	if (error || !app) {
		return (
			<div className="min-h-screen bg-bg-3 flex items-center justify-center">
				<Card className="max-w-md">
					<CardContent className="pt-6">
						<div className="text-center">
							<h2 className="text-xl font-semibold mb-2">
								App not found
							</h2>
							<p className="text-text-tertiary mb-4">
								{error ||
									"The app you're looking for doesn't exist."}
							</p>
							<Button onClick={() => navigate('/build')}>
								<ChevronLeft className="mr-2 h-4 w-4" />
								Back to Build
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	const isOwner = app.userId === user?.id;
	const appUrl = getAppUrl();
	const feedUrl = app.visibility === 'public' ? `/feed/${app.id}` : undefined;

	return (
		<div className="min-h-screen bg-bg-3 flex flex-col">
			<div className="container mx-auto px-4 pt-2 pb-4 space-y-2 flex flex-col flex-1">
				{/* App Info Section */}
				<div className="flex flex-col items-start justify-between gap-4 text-bg-4 w-fit rounded-lg px-5 pb-0">
					<div className="flex-1">
						<div className="flex rounded w-fit pb-3 pt-2 flex-col">
							<div className="flex items-center gap-3 mb-2">
								<h1 className="text-2xl md:text-4xl font-semibold tracking-tight text-text-primary">
									{app.title}
								</h1>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{isOwner ? (
									<>
										<Button
											size="sm"
											onClick={() =>
												navigate(`/chat/${app.id}`)
											}
											className="gap-2 bg-text-primary text-bg-4 border-bg-4 border"
										>
											<Code2 className="h-4 w-4" />
											Editing
										</Button>
										<Button
											variant="outline"
											size="sm"
											onClick={() =>
												setIsDeleteDialogOpen(true)
											}
											className="gap-2 text-text-on-brand !border-0 bg-destructive hover:opacity-90 transition-colors"
										>
											<Trash2 className="h-4 w-4" />
											Delete
										</Button>
									</>
								)
                                : (
									<>
										{/*
										<Button
											size="sm"
											variant="secondary"
											onClick={handleFork}
											className="gap-2 bg-text-primary text-bg-1"
										>
											<Shuffle className="h-4 w-4" />
											Remix
										</Button>
										*/}
									</>
								)
                                }

								{/* Stats inline with buttons */}
								<div className="flex items-center gap-1.5 text-sm text-text-tertiary border border-border-primary rounded-md px-3 py-1">
									<Eye className="h-3.5 w-3.5" />
									<span>{app.viewCount || 0}</span>
								</div>
								<div className="flex items-center gap-1.5 text-sm text-text-tertiary border border-border-primary rounded-md px-3 py-1">
									<Star className="h-3.5 w-3.5" />
									<span>{app.starCount || 0}</span>
								</div>
								<div className="flex items-center gap-2 border border-border-primary rounded-xl">
									<Badge variant={'default'}>
										<Globe />
										{capitalizeFirstLetter(app.visibility)}
									</Badge>
									{isOwner && (
										<Button
											variant="ghost"
											size="sm"
											onClick={handleToggleVisibility}
											disabled={isUpdatingVisibility}
											className="h-6 w-6 p-0 hover:bg-bg-3/50 -ml-1.5 !mr-1.5"
											title={`Make ${app.visibility === 'private' ? 'public' : 'private'}`}
										>
											{isUpdatingVisibility ? (
												<Loader2 className="h-3 w-3 animate-spin text-text-primary" />
											) : app.visibility === 'private' ? (
												<Unlock className="h-3 w-3 text-text-primary" />
											) : (
												<Lock className="h-3 w-3 text-text-primary" />
											)}
										</Button>
									)}
								</div>
								{feedUrl && (
									<Button
										variant="outline"
										size="sm"
										onClick={() => navigate(feedUrl)}
										className="gap-2 border-border-primary bg-bg-4 text-text-primary hover:bg-bg-1"
										title="Open in Feed"
									>
										<Play className="h-4 w-4" />
										Feed
									</Button>
								)}
							</div>
						</div>

					</div>
				</div>
				<Card className="px-2 flex-1 flex flex-col">
					<CardContent className="p-0 flex-1 flex flex-col">
						<div className="relative flex-1 flex flex-col">
							{appUrl ? (
								<div className="flex items-center justify-center bg-bg-3 p-4">
									<div className="w-full max-w-[360px] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl border border-border-primary bg-black relative">
										<iframe
											ref={previewIframeRef}
											src={appUrl}
											title={`${app.title} Preview`}
											allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
											sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-orientation-lock allow-popups allow-presentation"
											style={{
												position: 'absolute',
												top: 0,
												left: 0,
												border: 'none',
												width: 720,
												height: 1280,
												transform: 'scale(0.5)',
												transformOrigin: 'top left',
											}}
										/>
									</div>
								</div>
							) : (
								<div className="relative w-full flex-1 bg-gray-50 flex items-center justify-center">
									<div className="text-center">
										<h3 className="text-xl font-semibold mb-2 text-gray-700">
											Live Preview
										</h3>
										<p className="text-gray-500 mb-4 max-w-md">
											Run the app to see a live preview.
										</p>
										{deploymentProgress && (
											<p className="text-sm text-gray-800 mb-4">
												{deploymentProgress}
											</p>
										)}
										<Button
											onClick={handlePreviewDeploy}
											disabled={isDeploying}
											className="gap-2"
										>
											{isDeploying ? (
												<>
													<Loader2 className="h-4 w-4 animate-spin" />
													Loading...
												</>
											) : (
												<>
													<Play className="h-4 w-4" />
													Run Preview
												</>
											)}
										</Button>
									</div>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Delete Confirmation Dialog */}
			<ConfirmDeleteDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				onConfirm={handleDeleteApp}
				isLoading={isDeleting}
				appTitle={app?.title}
			/>
		</div>
	);
}
