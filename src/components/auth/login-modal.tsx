/**
 * Enhanced Login Modal
 * Supports Clerk Google sign-in and local email/password authentication.
 */

import { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, Eye, EyeOff } from 'lucide-react';
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

function GoogleButtonContent() {
	return (
		<div className="relative z-10 flex items-center justify-center gap-3">
			<svg
				className="h-5 w-5"
				viewBox="0 0 24 24"
			>
				<path
					d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					fill="#4285F4"
				/>
				<path
					d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					fill="#34A853"
				/>
				<path
					d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					fill="#FBBC05"
				/>
				<path
					d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					fill="#EA4335"
				/>
			</svg>
			<span className="font-bold">
				Continue with Google
			</span>
		</div>
	);
}

function ClerkGoogleButton({
	authRedirectUrl,
	onPrepareRedirect,
}: {
	authRedirectUrl: string;
	onPrepareRedirect: (url: string) => void;
}) {
	const { isLoaded, signIn } = useSignIn();

	const handleClick = async () => {
		onPrepareRedirect(authRedirectUrl);

		if (!isLoaded) {
			return;
		}

		await signIn.authenticateWithRedirect({
			strategy: 'oauth_google',
			redirectUrl: '/sso-callback',
			redirectUrlComplete: authRedirectUrl,
		});
	};

	return (
		<motion.button
			whileTap={{ scale: 0.98 }}
			onClick={handleClick}
			disabled={!isLoaded}
			className="w-full group relative overflow-hidden rounded-xl bg-bg-4 p-4 text-text-primary transition-all border-2 border-[var(--neo-border-color)] shadow-[4px_4px_0px_0px_var(--neo-border-color)] hover:shadow-[6px_6px_0px_0px_var(--neo-border-color)] hover:-translate-x-[1px] hover:-translate-y-[1px] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)] disabled:opacity-50 disabled:cursor-not-allowed"
		>
			<GoogleButtonContent />
		</motion.button>
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
	const { authProviders, clerkEnabled, hasThirdPartyAuth, requiresEmailAuth, setIntendedUrl } = useAuth();
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
	const showGoogle = clerkEnabled && authProviders?.google && hasThirdPartyAuth;
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
								{/* Google */}
								{showGoogle && (
									<ClerkGoogleButton
										authRedirectUrl={authRedirectUrl}
										onPrepareRedirect={setIntendedUrl}
									/>
								)}

								{hasEmailAuth && hasThirdPartyAuth && (
									<div className="relative">
										<div className="absolute inset-0 flex items-center">
											<div className="w-full border-t-2 border-[var(--neo-border-color)]" />
										</div>
										<div className="relative flex justify-center text-xs uppercase">
											<span className="bg-bg-4 px-3 text-text-tertiary font-bold">Or continue with</span>
										</div>
									</div>
								)}

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
