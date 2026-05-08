import React, { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Ticket, Loader2, ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';
import { toast } from 'sonner';

interface InviteCodeContextType {
	showInviteCodeModal: (onSuccess?: () => void) => void;
	hideInviteCodeModal: () => void;
	isInviteCodeModalOpen: boolean;
}

const InviteCodeContext = createContext<InviteCodeContextType | undefined>(undefined);
const DISCORD_INVITE_URL = 'https://discord.gg/bYdVPGqEsf';

export function useInviteCodeModal() {
	const context = useContext(InviteCodeContext);
	if (context === undefined) {
		throw new Error('useInviteCodeModal must be used within an InviteCodeProvider');
	}
	return context;
}

export function InviteCodeProvider({ children }: { children: React.ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);
	const [pendingAction, setPendingAction] = useState<(() => void) | undefined>();
	const [code, setCode] = useState('');
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const { refreshUser } = useAuth();

	const showInviteCodeModal = useCallback((onSuccess?: () => void) => {
		setCode('');
		setError('');
		setPendingAction(onSuccess ? () => onSuccess : undefined);
		setIsOpen(true);
	}, []);

	const hideInviteCodeModal = useCallback(() => {
		setIsOpen(false);
		setPendingAction(undefined);
		setCode('');
		setError('');
	}, []);

	const handleVerify = async () => {
		if (!code.trim()) {
			setError('Please enter an invite code');
			return;
		}
		setLoading(true);
		setError('');
		try {
			const res = await apiClient.verifyInviteCode(code.trim());
			if (res.success && res.data?.verified) {
				toast.success('Invite code verified');
				await refreshUser();
				hideInviteCodeModal();
				if (pendingAction) {
					setTimeout(() => pendingAction(), 100);
				}
			} else {
				setError('Invalid invite code');
			}
		} catch {
			setError('Invalid invite code');
		} finally {
			setLoading(false);
		}
	};

	const modal = createPortal(
		<AnimatePresence>
			{isOpen && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					className="fixed inset-0 z-[100] flex items-center justify-center p-4"
				>
					<div className="absolute inset-0 bg-black/60" onClick={hideInviteCodeModal} />
					<motion.div
						initial={{ scale: 0.95, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.95, opacity: 0 }}
						className="relative w-full max-w-sm bg-bg-2 border-2 border-[var(--neo-border-color)] shadow-[4px_4px_0px_0px_var(--neo-border-color)] rounded-xl p-6"
					>
						<button
							onClick={hideInviteCodeModal}
							className="absolute top-3 right-3 p-1 text-text-tertiary hover:text-text-primary transition-colors"
						>
							<X className="h-5 w-5" />
						</button>

						<div className="flex flex-col items-center gap-4">
							<div className="bg-accent/10 rounded-full p-3">
								<Ticket className="h-6 w-6 text-accent" />
							</div>
							<div className="text-center">
								<h2 className="text-lg font-bold text-text-primary">Invite Code Required</h2>
								<p className="text-sm text-text-secondary mt-1">Enter your invite code to start creating</p>
							</div>

							<div className="w-full space-y-3">
								<input
									type="text"
									value={code}
									onChange={(e) => { setCode(e.target.value); setError(''); }}
									onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
									placeholder="Enter invite code"
									className="w-full px-4 py-2.5 bg-bg-3 border-2 border-[var(--neo-border-color)] rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50"
									autoFocus
									disabled={loading}
								/>
								{error && (
									<p className="text-sm text-red-500">{error}</p>
								)}
								<button
									onClick={handleVerify}
									disabled={loading || !code.trim()}
									className="w-full py-2.5 bg-accent text-white font-semibold rounded-lg border-2 border-[var(--neo-border-color)] shadow-[2px_2px_0px_0px_var(--neo-border-color)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_0px_var(--neo-border-color)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
								>
									{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
									{loading ? 'Verifying...' : 'Verify'}
								</button>
								<a
									href={DISCORD_INVITE_URL}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center justify-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
								>
									Apply for an invite code
									<ExternalLink className="h-3.5 w-3.5" />
								</a>
							</div>
						</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>,
		document.body,
	);

	return (
		<InviteCodeContext.Provider value={{ showInviteCodeModal, hideInviteCodeModal, isInviteCodeModalOpen: isOpen }}>
			{children}
			{modal}
		</InviteCodeContext.Provider>
	);
}
