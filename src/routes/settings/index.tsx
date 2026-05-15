import React, { useState } from 'react';
import {
	Smartphone,
	Trash2,
	Lock,
	Settings,
	Languages,
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
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type AppLocale, useAppI18n } from '@/i18n';
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

function maskSessionAddress(address: string | null | undefined): string {
	if (!address || address === 'Unknown' || address === 'unknown') {
		return 'unknown';
	}
	if (address.includes('*') || address.includes('…') || address === 'Current location') {
		return address;
	}
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
		const parts = address.split('.');
		return `${parts[0]}.${parts[1]}.***.***`;
	}
	if (address.includes(':')) {
		const segments = address.split(':').filter(Boolean);
		return segments.length > 1 ? `${segments.slice(0, 2).join(':')}:…` : `${segments[0] ?? 'IPv6'}:…`;
	}
	return 'masked';
}

export default function SettingsPage() {
	const { user, deleteAccount } = useAuth();
	const { locale, setLocale, t } = useAppI18n();
	const accountIdentifier =
		user?.email?.endsWith('@clerk-phone.buzzplay.internal')
			? user.displayName || t('Phone account')
			: user?.email || t('Signed in account');
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
			toast.success(t('Account deleted'));
		} catch (error) {
			console.error('Delete account error:', error);
			toast.error(t('Could not delete account. Please try again.'));
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
			toast.success(t('Session revoked successfully'));
			loadActiveSessions();
		} catch (error) {
			console.error('Error revoking session:', error);
			toast.error(t('Failed to revoke session'));
		}
	};

	React.useEffect(() => {
		if (user) {
			loadActiveSessions();
		}
	}, [user]);

	const formatSessionDate = (value: Date | string | number) =>
		new Date(value).toLocaleDateString(locale);

	const formatSessionAddress = (address: string | null | undefined) => {
		const masked = maskSessionAddress(address);
		if (masked === 'unknown') return t('Unknown location');
		if (masked === 'masked') return t('Masked location');
		if (masked === 'Current location') return t('Current location');
		return masked;
	};

	return (
		<div className="min-h-screen bg-bg-3 relative">
			<main className="container mx-auto px-4 py-8 max-w-4xl">
				<div className="space-y-8">
					{/* Page Header */}
					<div className="flex flex-col gap-3">
						<div className="inline-flex items-center gap-3">
							<div className="bg-neo-orange border-3 border-[var(--neo-border-color)] rounded-xl px-5 py-2.5 shadow-[5px_5px_0px_0px_var(--neo-border-color)] inline-block">
								<h1 className="text-3xl font-black font-[departureMono] text-[#1a1a1a] tracking-wider">
									⚙ {t('SETTINGS')}
								</h1>
							</div>
						</div>
						<p className="text-text-secondary font-bold text-sm tracking-wide pl-1">
							{t('Manage your account settings and preferences')}
						</p>
					</div>

					<Card id="preferences">
						<CardHeader variant="minimal">
							<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
								<Languages className="h-5 w-5" />
								<div>
									<CardTitle className="text-lg">
										{t('Preferences')}
									</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-3 mt-2 px-6">
							<div className="flex items-center justify-between gap-4">
								<div>
									<h4 className="font-medium">{t('Language')}</h4>
									<p className="text-sm text-text-tertiary">
										{t('Choose the language used across BuzzPlay.')}
									</p>
								</div>
								<Select value={locale} onValueChange={(value) => setLocale(value as AppLocale)}>
									<SelectTrigger className="w-36">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{SUPPORTED_LOCALES.map((item) => (
											<SelectItem key={item} value={item}>
												{LOCALE_LABELS[item]}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</CardContent>
					</Card>

						{/* Security Section */}
					<Card id="security">
						<CardHeader variant="minimal">
							<div className="flex items-center gap-3 border-b w-full py-3 text-text-primary">
								<Lock className="h-5 w-5" />
								<div>
									<CardTitle className="text-lg">
										{t('Security')}
									</CardTitle>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-3 mt-2 px-6">
							{/* Connected Accounts */}
							<div className="space-y-2">
								<h4 className="font-medium">
									{t('Connected Accounts')}
								</h4>
								<div className="flex items-center justify-between">
									<div>
										<p className="text-sm font-medium text-text-primary">
											{accountIdentifier}
										</p>
									</div>
									<Badge variant="secondary">{t('Connected')}</Badge>
								</div>
							</div>

							<Separator />

							{/* Active Sessions */}
							<div className="space-y-2">
								<h4 className="font-medium">{t('Active Sessions')}</h4>
								{activeSessions.loading ? (
									<div className="flex items-center gap-3">
										<Settings className="h-5 w-5 animate-spin text-text-tertiary" />
										<span className="text-sm text-text-tertiary">
											{t('Loading active sessions...')}
										</span>
									</div>
								) : (
									activeSessions.sessions.map((session) => (
										<div
											key={session.id}
											className="flex min-w-0 items-center justify-between gap-3"
										>
											<div className="flex min-w-0 items-center gap-3">
												<Smartphone className="h-5 w-5 shrink-0 text-text-tertiary" />
												<div className="min-w-0">
													<p className="font-medium text-sm">
														{session.isCurrent
															? t('Current Session')
															: t('Other Session')}
													</p>
													<p className="max-w-[52vw] truncate text-sm text-text-tertiary sm:max-w-none">
														{formatSessionAddress(session.ipAddress)} •{' '}
														{formatSessionDate(session.lastActivity)}
													</p>
												</div>
											</div>
											<div className="flex shrink-0 items-center gap-2">
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
														{t('Revoke')}
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
							{t('Danger Zone')}
						</h4>

						<div className="flex items-center justify-between">
							<div>
								<p className="font-medium text-text-primary">{t('Delete Account')}</p>
								<p className="text-sm text-text-tertiary">
									{t('Delete your account and hide your projects')}
								</p>
							</div>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="destructive"
										className="gap-2"
									>
										<Trash2 className="h-4 w-4" />
										{t('Delete Account')}
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											{t('Delete account?')}
										</AlertDialogTitle>
										<AlertDialogDescription>
											{t('Your account info will be deleted. Your projects will be hidden from the app.')}
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>
											{t('Cancel')}
										</AlertDialogCancel>
										<AlertDialogAction
											onClick={handleDeleteAccount}
											disabled={isDeletingAccount}
											className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
										>
											{isDeletingAccount ? `${t('Deleting')}...` : t('Delete')}
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
