import { AuthenticateWithRedirectCallback } from '@clerk/react';
import { Skeleton } from '@/components/ui/skeleton';

export default function SsoCallback() {
	return (
		<div className="min-h-screen flex items-center justify-center">
			<div className="space-y-4">
				<Skeleton className="h-12 w-48" />
				<Skeleton className="h-4 w-32 mx-auto" />
				<AuthenticateWithRedirectCallback />
			</div>
		</div>
	);
}
