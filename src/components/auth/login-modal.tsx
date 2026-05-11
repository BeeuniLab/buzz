/**
 * Enhanced Login Modal
 * Supports Clerk sign-in and local email/password authentication fallback.
 */

import { useEffect, useState } from 'react';
import { useSignIn, useSignUp } from '@clerk/react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, Check, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useAuth } from '@/contexts/auth-context';
// import {
// 	validateEmail,
// 	validatePassword,
// 	validateDisplayName,
// } from '../../utils/validationUtils';

const TERMS_URL = '/legal?tab=terms';
const PRIVACY_URL = '/legal?tab=privacy';

interface LoginModalProps {
	isOpen: boolean;
	onClose: () => void;

	// New enhanced interfaces (optional)
	onEmailLogin?: (credentials: {
		email: string;
		password: string;
	}) => Promise<void>;
	onRegister?: (data: {
		email: string;
		password: string;
		name?: string;
	}) => Promise<void>;
	error?: string | null;
	onClearError?: () => void;
	
	// Contextual messaging
	actionContext?: string; // e.g., "to star this app", "to fork this project"
	showCloseButton?: boolean;
}

type AuthMode = 'login' | 'register';

type ClerkAuthProviderFlags = {
	google: boolean;
	facebook: boolean;
	discord: boolean;
	phone: boolean;
	email: boolean;
};

type PhoneFlowMode = 'signIn' | 'signUp';
type PhoneStep = 'input' | 'code';

const PHONE_COUNTRIES = [
	{ code: 'US', name: 'United States', dialCode: '+1' },
	{ code: 'CA', name: 'Canada', dialCode: '+1' },
	{ code: 'BH', name: 'Bahrain', dialCode: '+973' },
	{ code: 'BN', name: 'Brunei', dialCode: '+673' },
	{ code: 'CN', name: 'China', dialCode: '+86' },
	{ code: 'CR', name: 'Costa Rica', dialCode: '+506' },
	{ code: 'GL', name: 'Greenland', dialCode: '+299' },
	{ code: 'GG', name: 'Guernsey', dialCode: '+44' },
	{ code: 'IM', name: 'Isle of Man', dialCode: '+44' },
	{ code: 'JE', name: 'Jersey', dialCode: '+44' },
	{ code: 'LI', name: 'Liechtenstein', dialCode: '+423' },
	{ code: 'NF', name: 'Norfolk Island', dialCode: '+672' },
	{ code: 'PL', name: 'Poland', dialCode: '+48' },
	{ code: 'PT', name: 'Portugal', dialCode: '+351' },
	{ code: 'PR', name: 'Puerto Rico', dialCode: '+1' },
	{ code: 'SC', name: 'Seychelles', dialCode: '+248' },
	{ code: 'SG', name: 'Singapore', dialCode: '+65' },
	{ code: 'ZA', name: 'South Africa', dialCode: '+27' },
	{ code: 'KR', name: 'South Korea', dialCode: '+82' },
	{ code: 'TH', name: 'Thailand', dialCode: '+66' },
	{ code: 'TR', name: 'Türkiye', dialCode: '+90' },
	{ code: 'VI', name: 'U.S. Virgin Islands', dialCode: '+1' },
	{ code: 'GB', name: 'United Kingdom', dialCode: '+44' },
] as const;

type PhoneCountryCode = (typeof PHONE_COUNTRIES)[number]['code'];

const SSO_PROVIDERS = [
	{
		key: 'google',
		strategy: 'oauth_google',
		label: 'Google',
		iconPath: '/auth/google.svg',
	},
	{
		key: 'facebook',
		strategy: 'oauth_facebook',
		label: 'Facebook',
		iconPath: '/auth/facebook.svg',
	},
	{
		key: 'discord',
		strategy: 'oauth_discord',
		label: 'Discord',
		iconPath: '/auth/discord.svg',
	},
] as const;

function getClerkErrorMessage(error: unknown): string {
	const clerkError = error as { longMessage?: string; message?: string; code?: string } | null;
	return clerkError?.longMessage || clerkError?.message || 'Authentication failed. Please try again.';
}

function isMissingPhoneAccountError(error: unknown): boolean {
	const clerkError = error as { code?: string; longMessage?: string; message?: string } | null;
	const text = `${clerkError?.code || ''} ${clerkError?.longMessage || ''} ${clerkError?.message || ''}`.toLowerCase();
	return (
		text.includes('not_found') ||
		text.includes('not found') ||
		text.includes('no account') ||
		text.includes('couldn') ||
		text.includes('doesn')
	);
}

function normalizePhoneNumber(countryDialCode: string, value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return '';
	if (trimmed.startsWith('+')) {
		return `+${trimmed.replace(/\D/g, '')}`;
	}
	return `${countryDialCode}${trimmed.replace(/\D/g, '')}`;
}

function getDefaultPhoneCountryCode(): PhoneCountryCode {
	if (typeof navigator === 'undefined') {
		return 'US';
	}

	const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
	for (const locale of locales) {
		const normalized = locale.replace('_', '-');
		const region = normalized.split('-')[1]?.toUpperCase();
		if (region && PHONE_COUNTRIES.some((country) => country.code === region)) {
			return region as PhoneCountryCode;
		}
		if (normalized.toLowerCase().startsWith('zh')) {
			return 'CN';
		}
	}

	return 'US';
}

function ClerkAuthPanel({
	authRedirectUrl,
	onPrepareRedirect,
	authProviders,
}: {
	authRedirectUrl: string;
	onPrepareRedirect: (url: string) => void;
	authProviders: ClerkAuthProviderFlags | null;
}) {
	const { signIn } = useSignIn();
	const { signUp } = useSignUp();
	const [countryCode, setCountryCode] = useState<PhoneCountryCode>(() => getDefaultPhoneCountryCode());
	const [phone, setPhone] = useState('');
	const [verificationCode, setVerificationCode] = useState('');
	const [phoneStep, setPhoneStep] = useState<PhoneStep>('input');
	const [phoneFlowMode, setPhoneFlowMode] = useState<PhoneFlowMode>('signIn');
	const [phoneError, setPhoneError] = useState<string | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const [countryMenuOpen, setCountryMenuOpen] = useState(false);

	useEffect(() => {
		onPrepareRedirect(authRedirectUrl);
	}, [authRedirectUrl, onPrepareRedirect]);

	const selectedCountry = PHONE_COUNTRIES.find((country) => country.code === countryCode) || PHONE_COUNTRIES[0];
	const phoneEnabled = authProviders?.phone !== false;
	const enabledSsoProviders = SSO_PROVIDERS.filter((provider) => authProviders?.[provider.key] !== false);
	const isBusy = Boolean(busy);

	const finalizeNavigate = {
		navigate: async ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
			const destination = decorateUrl(authRedirectUrl || '/');
			window.location.href = destination;
		},
	};

	const startSso = async (strategy: string, label: string) => {
		setPhoneError(null);
		setBusy(strategy);

		try {
			const result = await signUp.sso({
				strategy,
				redirectCallbackUrl: '/sso-callback',
				redirectUrl: authRedirectUrl || '/',
			});
			if (result.error) {
				throw result.error;
			}
		} catch (error) {
			try {
				const result = await signIn.sso({
					strategy: strategy as Parameters<typeof signIn.sso>[0]['strategy'],
					redirectCallbackUrl: '/sso-callback',
					redirectUrl: authRedirectUrl || '/',
				});
				if (result.error) {
					throw result.error;
				}
			} catch (fallbackError) {
				console.error(`${label} sign-in error:`, fallbackError);
				setPhoneError(getClerkErrorMessage(fallbackError));
				setBusy(null);
			}
		}
	};

	const sendPhoneCode = async (event: React.FormEvent) => {
		event.preventDefault();
		setPhoneError(null);

		const e164Phone = normalizePhoneNumber(selectedCountry.dialCode, phone);
		if (!/^\+[1-9]\d{6,14}$/.test(e164Phone)) {
			setPhoneError('Enter a valid phone number.');
			return;
		}

		setBusy('phone');
		try {
			const signInResult = await signIn.phoneCode.sendCode({
				phoneNumber: e164Phone,
				channel: 'sms',
			});

			if (signInResult.error) {
				throw signInResult.error;
			}

			setPhoneFlowMode('signIn');
			setPhoneStep('code');
		} catch (signInError) {
			if (!isMissingPhoneAccountError(signInError)) {
				console.error('Phone sign-in error:', signInError);
				setPhoneError(getClerkErrorMessage(signInError));
				setBusy(null);
				return;
			}

			try {
				const signUpResult = await signUp.create({ phoneNumber: e164Phone });
				if (signUpResult.error) {
					throw signUpResult.error;
				}

				const sendResult = await signUp.verifications.sendPhoneCode({ channel: 'sms' });
				if (sendResult.error) {
					throw sendResult.error;
				}

				setPhoneFlowMode('signUp');
				setPhoneStep('code');
			} catch (signUpError) {
				console.error('Phone sign-up error:', signUpError);
				setPhoneError(getClerkErrorMessage(signUpError));
			}
		} finally {
			setBusy(null);
		}
	};

	const verifyPhoneCode = async (event: React.FormEvent) => {
		event.preventDefault();
		setPhoneError(null);

		const code = verificationCode.trim();
		if (!/^\d{4,8}$/.test(code)) {
			setPhoneError('Enter the verification code.');
			return;
		}

		setBusy('code');
		try {
			if (phoneFlowMode === 'signIn') {
				const result = await signIn.phoneCode.verifyCode({ code });
				if (result.error) {
					throw result.error;
				}
				await signIn.finalize(finalizeNavigate);
			} else {
				const result = await signUp.verifications.verifyPhoneCode({ code });
				if (result.error) {
					throw result.error;
				}
				await signUp.finalize(finalizeNavigate);
			}
		} catch (error) {
			console.error('Phone verification error:', error);
			setPhoneError(getClerkErrorMessage(error));
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="w-[min(360px,calc(100vw-2rem))] rounded-2xl bg-white px-7 pb-7 pt-8 shadow-xl ring-1 ring-black/10">
			<div className="mx-auto flex w-full flex-col items-center">
				<img src="/logo.svg" alt="" className="mb-4 h-9 w-9 object-contain" />
				<h2 className="text-center text-base font-semibold text-zinc-900">
					Continue to buzzplay
				</h2>

				{enabledSsoProviders.length > 0 && (
					<div className="mt-7 grid w-full grid-cols-3 gap-1.5">
						{enabledSsoProviders.map((provider) => (
							<button
								key={provider.key}
								type="button"
								onClick={() => startSso(provider.strategy, provider.label)}
								disabled={isBusy}
								className="flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-[15px] font-semibold shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
								aria-label={`Continue with ${provider.label}`}
							>
								<img src={provider.iconPath} alt="" className="h-4 w-4 object-contain" />
							</button>
						))}
					</div>
				)}

				{phoneEnabled && enabledSsoProviders.length > 0 && (
					<div className="my-5 flex w-full items-center gap-3 text-xs font-medium text-zinc-500">
						<div className="h-px flex-1 bg-zinc-200" />
						<span>or</span>
						<div className="h-px flex-1 bg-zinc-200" />
					</div>
				)}

				{phoneEnabled && (
					<form
						onSubmit={phoneStep === 'input' ? sendPhoneCode : verifyPhoneCode}
						className="w-full space-y-4"
					>
						{phoneStep === 'input' ? (
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-3">
									<label className="block text-xs font-medium text-zinc-900" htmlFor="auth-phone">
										Phone number
									</label>
									<span className="min-w-0 truncate text-[11px] font-medium text-zinc-500">
										{selectedCountry.name}
									</span>
								</div>
								<div className="relative">
									<div className="flex h-8 rounded-md border border-zinc-300 bg-white shadow-sm focus-within:border-zinc-500">
										<button
											type="button"
											onClick={() => setCountryMenuOpen((open) => !open)}
											disabled={isBusy}
											className="flex w-[86px] shrink-0 items-center justify-between gap-1 rounded-l-md border-r border-zinc-200 px-2 text-xs font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
											aria-label={`Country: ${selectedCountry.name}`}
											aria-expanded={countryMenuOpen}
											aria-haspopup="listbox"
										>
											<span>{selectedCountry.code}</span>
											<span className="text-zinc-500">{selectedCountry.dialCode}</span>
											<ChevronDown className="h-3 w-3 text-zinc-400" />
										</button>
										<input
											id="auth-phone"
											value={phone}
											onChange={(event) => setPhone(event.target.value)}
											onFocus={() => setCountryMenuOpen(false)}
											disabled={isBusy}
											inputMode="tel"
											autoComplete="tel"
											placeholder="Phone number"
											className="min-w-0 flex-1 rounded-r-md px-2 text-xs font-medium text-zinc-900 outline-none placeholder:text-zinc-400"
										/>
									</div>

									{countryMenuOpen && (
										<div
											className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[min(220px,38vh)] overflow-y-auto rounded-md border border-zinc-200 bg-white py-1 shadow-lg"
											role="listbox"
										>
											{PHONE_COUNTRIES.map((country) => {
												const selected = country.code === selectedCountry.code;
												return (
													<button
														key={country.code}
														type="button"
														onClick={() => {
															setCountryCode(country.code);
															setCountryMenuOpen(false);
														}}
														className="flex h-8 w-full items-center gap-2 px-2.5 text-left text-xs text-zinc-800 hover:bg-zinc-50"
														role="option"
														aria-selected={selected}
													>
														<span className="w-7 shrink-0 font-semibold text-zinc-900">
															{country.code}
														</span>
														<span className="w-10 shrink-0 font-medium text-zinc-500">
															{country.dialCode}
														</span>
														<span className="min-w-0 flex-1 truncate font-medium">
															{country.name}
														</span>
														{selected && <Check className="h-3 w-3 shrink-0 text-zinc-700" />}
													</button>
												);
											})}
										</div>
									)}
								</div>
							</div>
						) : (
							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<label className="block text-xs font-medium text-zinc-900" htmlFor="auth-phone-code">
										Verification code
									</label>
									<button
										type="button"
										onClick={() => {
											setVerificationCode('');
											setPhoneStep('input');
											setPhoneError(null);
										}}
										disabled={isBusy}
										className="text-xs font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-60"
									>
										Change number
									</button>
								</div>
								<input
									id="auth-phone-code"
									value={verificationCode}
									onChange={(event) => setVerificationCode(event.target.value)}
									disabled={isBusy}
									inputMode="numeric"
									autoComplete="one-time-code"
									placeholder="Enter SMS code"
									className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-xs font-medium text-zinc-900 shadow-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500"
								/>
							</div>
						)}

						{phoneError && (
							<div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-medium text-red-700">
								{phoneError}
							</div>
						)}

						<div id="clerk-captcha" />

						<button
							type="submit"
							disabled={isBusy}
							className="h-8 w-full rounded-md bg-zinc-800 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{busy === 'phone'
								? 'Sending...'
								: busy === 'code'
									? 'Verifying...'
									: phoneStep === 'input'
										? 'Continue'
										: 'Verify'}
						</button>
					</form>
				)}
			</div>
		</div>
	);
}

export function LoginModal({
	isOpen,
	onClose,
	onEmailLogin,
	onRegister,
	error,
	onClearError,
	actionContext,
	showCloseButton = true,
}: LoginModalProps) {
	const { clerkEnabled, hasThirdPartyAuth, requiresEmailAuth, authProviders, setIntendedUrl } = useAuth();
	const [mode, setMode] = useState<AuthMode>('login');
	const [showPassword, setShowPassword] = useState(false);
	const [isLoading, setIsLoading] = useState(false);

	// Form state
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [name, setName] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');

	// Validation errors
	const [validationErrors, setValidationErrors] = useState<
		Record<string, string>
	>({});

	// Determine if enhanced features are available
	const hasEmailAuth = requiresEmailAuth && !!onEmailLogin;
	const hasRegistration = requiresEmailAuth && !!onRegister;
	const showClerkAuth = clerkEnabled && hasThirdPartyAuth;
	const authRedirectUrl = window.location.pathname + window.location.search;

	const resetForm = () => {
		setEmail('');
		setPassword('');
		setName('');
		setConfirmPassword('');
		setValidationErrors({});
		setShowPassword(false);
		if (onClearError) onClearError();
	};

	const handleClose = () => {
		resetForm();
		onClose();
	};

	const switchMode = (newMode: AuthMode) => {
		setMode(newMode);
		resetForm();
		setValidationErrors({});
		if (onClearError) onClearError();
	};

	const validateForm = (): boolean => {
		const errors: Record<string, string> = {};

		// Basic email validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!email.trim()) {
			errors.email = 'Email is required';
		} else if (!emailRegex.test(email)) {
			errors.email = 'Invalid email format';
		}

		// Basic password validation
		if (!password) {
			errors.password = 'Password is required';
		} else if (password.length < 8) {
			errors.password = 'Password must be at least 8 characters';
		}

		// Additional validation for registration
		if (mode === 'register') {
			// Name validation
			if (!name.trim()) {
				errors.name = 'Name is required';
			} else if (name.trim().length < 2) {
				errors.name = 'Name must be at least 2 characters';
			}

			// Confirm password validation
			if (password !== confirmPassword) {
				errors.confirmPassword = 'Passwords do not match';
			}
		}

		setValidationErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!validateForm()) return;

		setIsLoading(true);
		try {
			if (mode === 'login' && onEmailLogin) {
				await onEmailLogin({ email, password });
			} else if (mode === 'register' && onRegister) {
				await onRegister({ email, password, name: name.trim() });
			}
			// Don't auto-close here - let the parent handle success/error
		} catch (err) {
			// Error handling is done in the auth context
		} finally {
			setIsLoading(false);
		}
	};

	if (!isOpen) return null;

	if (showClerkAuth) {
		return createPortal(
			<AnimatePresence>
				{isOpen && (
					<div
						data-nosnippet
						className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto"
					>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="fixed inset-0 bg-black/50 backdrop-blur-md"
							onClick={handleClose}
						/>

						<motion.div
							initial={{ opacity: 0, scale: 0.96, y: 16 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.96, y: 16 }}
							transition={{ type: 'spring', duration: 0.45 }}
							className="relative z-10 mx-auto my-8 flex w-fit max-w-[calc(100vw-2rem)] justify-center"
						>
							{showCloseButton && (
								<button
									onClick={handleClose}
									className="absolute right-2.5 top-2.5 z-20 grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition-colors hover:bg-black/[0.04] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
									aria-label="Close sign in"
								>
									<X className="h-3 w-3" />
								</button>
							)}

							<ClerkAuthPanel
								authRedirectUrl={authRedirectUrl}
								onPrepareRedirect={setIntendedUrl}
								authProviders={authProviders}
							/>
						</motion.div>
					</div>
				)}
			</AnimatePresence>,
			document.body,
		);
	}

	return createPortal(
		<AnimatePresence>
			{isOpen && (
				<div
					data-nosnippet
					className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto"
				>
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 bg-black/50 backdrop-blur-md"
						onClick={handleClose}
					/>

					{/* Modal */}
					<motion.div
						initial={{ opacity: 0, scale: 0.95, y: 20 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.95, y: 20 }}
						transition={{ type: 'spring', duration: 0.5 }}
						className="relative z-10 w-full max-w-md mx-auto my-8"
					>
						<div className="bg-bg-4 text-text-primary border-3 border-[var(--neo-border-color)] rounded-2xl shadow-[8px_8px_0px_0px_var(--neo-border-color)] overflow-hidden">
							<div className="relative p-6 pb-0">
								{showCloseButton && (
									<button
										onClick={handleClose}
										className="absolute right-4 top-4 p-1.5 rounded-lg border-2 border-[var(--neo-border-color)] bg-bg-4 shadow-[2px_2px_0px_0px_var(--neo-border-color)] hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:-translate-x-[0.5px] hover:-translate-y-[0.5px] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
									>
										<X className="h-4 w-4" />
									</button>
								)}

								<div className="text-center space-y-2">
									<div className="mx-auto w-14 h-14 rounded-xl bg-neo-yellow border-2 border-[var(--neo-border-color)] shadow-[3px_3px_0px_0px_var(--neo-border-color)] flex items-center justify-center mb-4">
										<svg
											className="w-7 h-7 text-[#1a1a1a]"
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={2.5}
												d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
											/>
										</svg>
									</div>
									<h2 className="text-2xl font-extrabold mb-2">
										{actionContext
											? `Sign in ${actionContext}`
											: hasEmailAuth && mode === 'register'
											? 'Create an account'
											: 'Welcome back'}
									</h2>
									<p className="text-text-tertiary font-medium">
										{actionContext
											? 'Authentication required for this action'
											: hasEmailAuth && mode === 'register'
											? 'Join to start building amazing applications'
											: 'Sign in to save your apps and access your workspace'}
									</p>
								</div>
							</div>

							{/* Error display */}
							{error && (
								<div className="mx-6 mt-4 p-3 rounded-lg bg-destructive/10 border-2 border-destructive flex items-start gap-2 shadow-[2px_2px_0px_0px_#ef4444]">
									<AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
									<p className="text-sm text-destructive font-bold">
										{error}
									</p>
								</div>
							)}

							{/* Authentication Options */}
							<div className={clsx('p-6 space-y-5 pt-12')}>
								{/* Email/Password Form */}
								{hasEmailAuth && (
									<form onSubmit={handleSubmit} className="space-y-4">
										{mode === 'register' && (
											<div>
												<input
													type="text"
													placeholder="Full name"
													value={name}
													onChange={(e) => setName(e.target.value)}
													className={clsx(
														'w-full p-3 rounded-lg border-2 bg-bg-4 font-medium transition-all shadow-[2px_2px_0px_0px_var(--neo-border-color)] focus:shadow-[4px_4px_0px_0px_var(--neo-border-color)] focus:-translate-x-[1px] focus:-translate-y-[1px] outline-none',
														validationErrors.name ? 'border-destructive' : 'border-[var(--neo-border-color)]'
													)}
													disabled={isLoading}
												/>
												{validationErrors.name && (
													<p className="mt-1 text-sm text-destructive">{validationErrors.name}</p>
												)}
											</div>
										)}

										<div>
											<input
												type="email"
												placeholder="Email address"
												value={email}
												onChange={(e) => setEmail(e.target.value)}
												className={clsx(
													'w-full p-3 rounded-lg border-2 bg-bg-4 font-medium transition-all shadow-[2px_2px_0px_0px_var(--neo-border-color)] focus:shadow-[4px_4px_0px_0px_var(--neo-border-color)] focus:-translate-x-[1px] focus:-translate-y-[1px] outline-none',
													validationErrors.email ? 'border-destructive' : 'border-[var(--neo-border-color)]'
												)}
												disabled={isLoading}
											/>
											{validationErrors.email && (
												<p className="mt-1 text-sm text-destructive">{validationErrors.email}</p>
											)}
										</div>

										<div className="relative">
											<input
												type={showPassword ? 'text' : 'password'}
												placeholder="Password"
												value={password}
												onChange={(e) => setPassword(e.target.value)}
												className={clsx(
													'w-full p-3 pr-10 rounded-lg border-2 bg-bg-4 font-medium transition-all shadow-[2px_2px_0px_0px_var(--neo-border-color)] focus:shadow-[4px_4px_0px_0px_var(--neo-border-color)] focus:-translate-x-[1px] focus:-translate-y-[1px] outline-none',
													validationErrors.password ? 'border-destructive' : 'border-[var(--neo-border-color)]'
												)}
												disabled={isLoading}
											/>
											<button
												type="button"
												onClick={() => setShowPassword(!showPassword)}
												className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
												disabled={isLoading}
											>
												{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
											</button>
											{validationErrors.password && (
												<p className="mt-1 text-sm text-destructive">{validationErrors.password}</p>
											)}
										</div>

										{mode === 'register' && (
											<div>
												<input
													type="password"
													placeholder="Confirm password"
													value={confirmPassword}
													onChange={(e) => setConfirmPassword(e.target.value)}
													className={clsx(
														'w-full p-3 rounded-lg border-2 bg-bg-4 font-medium transition-all shadow-[2px_2px_0px_0px_var(--neo-border-color)] focus:shadow-[4px_4px_0px_0px_var(--neo-border-color)] focus:-translate-x-[1px] focus:-translate-y-[1px] outline-none',
														validationErrors.confirmPassword ? 'border-destructive' : 'border-[var(--neo-border-color)]'
													)}
													disabled={isLoading}
												/>
												{validationErrors.confirmPassword && (
													<p className="mt-1 text-sm text-destructive">{validationErrors.confirmPassword}</p>
												)}
											</div>
										)}

										<motion.button
											type="submit"
											whileTap={{ scale: 0.98 }}
											disabled={isLoading}
											className="w-full bg-neo-orange text-[#1a1a1a] p-3 rounded-xl font-bold border-2 border-[var(--neo-border-color)] shadow-[4px_4px_0px_0px_var(--neo-border-color)] hover:shadow-[6px_6px_0px_0px_var(--neo-border-color)] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
										>
											{isLoading 
												? (mode === 'register' ? 'Creating account...' : 'Signing in...')
												: (mode === 'register' ? 'Create account' : 'Sign in')
											}
										</motion.button>
									</form>
								)}
							</div>

							{/* Footer */}
							<div className="px-6 pb-6 space-y-4">
								{/* Mode switching (only if registration is available) */}
								{hasRegistration && hasEmailAuth && (
									<div className="text-center">
										<button
											type="button"
											onClick={() =>
												switchMode(
													mode === 'login'
														? 'register'
														: 'login',
												)
											}
											className="text-sm text-text-tertiary hover:text-text-primary transition-colors"
										>
											{mode === 'login' 
												? "Don't have an account? Sign up" 
												: "Already have an account? Sign in"
											}
										</button>
									</div>
								)}

								<p className="text-center text-xs leading-relaxed text-text-tertiary">
									By continuing, you agree to BuzzPlay&apos;s{' '}
									<a
										href={TERMS_URL}
										target="_blank"
										rel="noopener noreferrer"
										className="underline hover:text-text-primary"
									>
										Terms of Service
									</a>{' '}
									and acknowledge its{' '}
									<a
										href={PRIVACY_URL}
										target="_blank"
										rel="noopener noreferrer"
										className="underline hover:text-text-primary"
									>
										Privacy Policy
									</a>
								</p>
							</div>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>,
		document.body,
	);
}
