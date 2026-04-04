import { useAuth } from '@/contexts/auth-context';
import { useFeature } from '@/features';
import { useInviteCodeModal } from '@/components/invite-code/InviteCodeProvider';

/**
 * Hook to guard actions behind invite code verification.
 * Checks capabilities to see if invite codes are required,
 * then checks the user's inviteCodeVerified status.
 */
export function useInviteCode() {
	const { user } = useAuth();
	const { capabilities } = useFeature();
	const { showInviteCodeModal } = useInviteCodeModal();

	const requireInviteCode = (options?: { onSuccess?: () => void }): boolean => {
		if (!capabilities?.inviteCodeRequired) {
			return true;
		}
		if (user?.inviteCodeVerified) {
			return true;
		}
		showInviteCodeModal(options?.onSuccess);
		return false;
	};

	return { requireInviteCode };
}
