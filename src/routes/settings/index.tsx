import React, { useState } from 'react';
import {
	Smartphone,
	Trash2,
	Lock,
	Settings,
} from 'lucide-react';
import type {
	ActiveSessionsData,
} from '@/api-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/auth-context';
import { Badge } from '@/components/ui/badge';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

export default function SettingsPage() {
	const { user, deleteAccount } = useAuth();
	const accountIdentifier =
		user?.email?.endsWith('@clerk-phone.buzzplay.internal')
			? user.displayName || 'Phone account'
			: user?.email || 'Signed in account';
	const [isDeletingAccount, setIsDeletingAccount] = useState(false);
	// Active sessions state
	const [activeSessions, setActiveSessions] = useState<
		ActiveSessionsData & { loading: boolean }
	>({ sessions: [], loading: true });

	// const handleSaveProfile = async () => {
	// 	if (isSaving) return;

	// 	try {
	// 		setIsSaving(true);

	// 		const response = await fetch('/api/auth/profile', {
	// 			method: 'PUT',
	// 			credentials: 'include',
	// 			headers: {
	// 				'Content-Type': 'application/json',
	// 			},
	// 			body: JSON.stringify({
	// 				...profileData,
	// 				theme: currentTheme,
	// 			}),
	// 		});

	// 		const data = await response.json();

	// 		if (response.ok && data.success) {
	// 			toast.success('Profile settings saved');
	// 			// Theme context is already updated by handleThemeChange
	// 			// Refresh user data in auth context
	// 			await refreshUser();
	// 		} else {
	// 			toast.error(
	// 				data.error?.message || 'Failed to save profile settings',
	// 			);
	// 		}
	// 	} catch (error) {
	// 		console.error('Profile save error:', error);
	// 		toast.error('Failed to save profile settings');
	// 	} finally {
	// 		setIsSaving(false);
	// 	}
	// };

	const handleDeleteAccount = async () => {
		if (isDeletingAccount) return;

		try {
			setIsDeletingAccount(true);
			await deleteAccount();
			toast.success('Account deleted');
		} catch (error) {
			console.error('Delete account error:', error);
			toast.error('Could not delete account. Please try again.');
			setIsDeletingAccount(false);
		}
	};

	// Load active sessions
	const loadActiveSessions = async () => {
		try {
			const response = await apiClient.getActiveSessions();
			setActiveSessions({
				sessions: response.data?.sessions || [
					{
						id: 'current',
						userAgent: navigator.userAgent,
						ipAddress: 'Current location',
						lastActivity: new Date(),
						createdAt: new Date(),
						isCurrent: true,
					},
				],
				loading: false,
			});
		} catch (error) {
			console.error('Error loading active sessions:', error);
			setActiveSessions({
				sessions: [
					{
						id: 'current',
						userAgent: navigator.userAgent,
						ipAddress: 'Current location',
						lastActivity: new Date(),
						createdAt: new Date(),
						isCurrent: true,
					},
				],
				loading: false,
			});
		}
	};

	const handleRevokeSession = async (sessionId: string) => {
		try {
			await apiClient.revokeSession(sessionId);
			toast.success('Session revoked successfully');
			loadActiveSessions();
		} catch (error) {
			console.error('Error revoking session:', error);
			toast.error('Failed to revoke session');
		}
	};

	React.useEffect(() => {
		if (user) {
			loadActiveSessions();
		}
	}, [user]);

	return (
		<div className="min-h-screen bg-bg-3 relative">
			<main className="container mx-auto px-4 py-8 max-w-4xl">
				<div className="space-y-8">
					{/* Page Header */}
					<div className="flex flex-col gap-3">
						<div className="inline-flex items-center gap-3">
							<div className="bg-neo-orange border-3 border-[var(--neo-border-color)] rounded-xl px-5 py-2.5 shadow-[5px_5px_0px_0px_var(--neo-border-color)] inline-block">
								<h1 className="text-3xl font-black font-[departureMono] text-[#1a1a1a] tracking-wider">
									⚙ SETTINGS
								</h1>
							</div>
						</div>
						<p className="text-text-secondary font-bold text-sm tracking-wide pl-1">
							Manage your account settings and preferences
						</p>
					</div>

						{/* Security Section */}
					<Card id="security">
						<CardHeader variant="minimal">
							<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
								<Lock className="h-5 w-5" />
								<div>
									<CardTitle className="text-lg">
										Security
									</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-3 mt-2 px-6">
							{/* Connected Accounts */}
							<div className="space-y-2">
								<h4 className="font-medium">
									Connected Accounts
								</h4>
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm font-medium text-text-primary">
											{accountIdentifier}
										</p>
									</div>
									<Badge variant="secondary">Connected</Badge>
								</div>
							</div>

							<Separator />

							{/* Active Sessions */}
							<div className="space-y-2">
								<h4 className="font-medium">Active Sessions</h4>
								{activeSessions.loading ? (
									<div className="flex items-center gap-3">
										<Settings className="h-5 w-5 animate-spin text-text-tertiary" />
										<span className="text-sm text-text-tertiary">
											Loading active sessions...
										</span>
									</div>
								) : (
									activeSessions.sessions.map((session) => (
										<div
											key={session.id}
											className="flex items-center justify-between"
										>
											<div className="flex items-center gap-3">
												<Smartphone className="h-5 w-5 text-text-tertiary" />
												<div>
													<p className="font-medium text-sm">
														{session.isCurrent
															? 'Current Session'
															: 'Other Session'}
													</p>
													<p className="text-sm text-text-tertiary">
														{session.ipAddress} •{' '}
														{new Date(
															session.lastActivity,
														).toLocaleDateString()}
													</p>
												</div>
											</div>
											<div className="flex items-center gap-2">
												{session.isCurrent ? (
													<div className="bg-green-400 size-3 rounded-full ring-green-200 ring-2 animate-pulse"></div>
												) : (
													<Button
														variant="outline"
														size="sm"
														onClick={() =>
															handleRevokeSession(
																session.id,
															)
														}
														className="text-destructive hover:text-destructive"
													>
														Revoke
													</Button>
												)}
											</div>
										</div>
									))
								)}
							</div>
						</CardContent>
					</Card>

					<div className="space-y-4 p-3">
						<h4 className="font-medium text-destructive">
							Danger Zone
						</h4>

						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-text-primary">Delete Account</p>
								<p className="text-sm text-text-tertiary">
									Delete your account and hide your projects
								</p>
							</div>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="destructive"
										className="gap-2"
									>
										<Trash2 className="h-4 w-4" />
										Delete Account
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											Delete account?
										</AlertDialogTitle>
										<AlertDialogDescription>
											Your account info will be deleted. Your projects will be hidden from the app.
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>
											Cancel
										</AlertDialogCancel>
										<AlertDialogAction
											onClick={handleDeleteAccount}
											disabled={isDeletingAccount}
											className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
										>
											{isDeletingAccount ? 'Deleting...' : 'Delete'}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
