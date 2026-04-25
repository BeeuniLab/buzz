import React from 'react';
import { useNavigate } from 'react-router';
import { formatDistanceToNow, isValid } from 'date-fns';
import { Loader2, UserPlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiClient } from '@/lib/api-client';
import type { FollowerInboxData } from '@/api-types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type InboxItem = FollowerInboxData['items'][number];

function formatFollowedAt(value: InboxItem['followedAt']) {
	if (!value) return 'Recently';
	const date = new Date(value);
	if (!isValid(date)) return 'Recently';
	return formatDistanceToNow(date, { addSuffix: true });
}

function getDisplayName(item: InboxItem) {
	return item.followerName || item.followerUsername || 'Creator';
}

export default function Inbox() {
	const navigate = useNavigate();
	const [items, setItems] = React.useState<InboxItem[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [followLoadingId, setFollowLoadingId] = React.useState<string | null>(null);

	React.useEffect(() => {
		let cancelled = false;
		setLoading(true);

		apiClient.getFollowerInbox()
			.then((res) => {
				if (!cancelled && res.success && res.data) {
					setItems(res.data.items);
				}
			})
			.catch(() => {
				if (!cancelled) toast.error('Failed to load inbox');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, []);

	const followBack = async (item: InboxItem) => {
		if (followLoadingId || item.isFollowingBack) return;

		setFollowLoadingId(item.followerId);
		try {
			const res = await apiClient.followUser(item.followerId);
			if (res.success && res.data) {
				setItems((prev) =>
					prev.map((candidate) =>
						candidate.followerId === item.followerId
							? { ...candidate, isFollowingBack: res.data!.isFollowing }
							: candidate,
					),
				);
			}
		} catch {
			toast.error('Failed to follow back');
		} finally {
			setFollowLoadingId(null);
		}
	};

	return (
		<div className="min-h-screen bg-bg-1">
			<div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-6 sm:px-6 sm:py-8">
				<div className="mb-6">
					<h1 className="text-2xl font-black text-text-primary">Inbox</h1>
					<p className="mt-1 text-sm text-text-tertiary">Followers and creator updates</p>
				</div>

				{loading ? (
					<div className="flex items-center justify-center py-20">
						<Loader2 className="h-7 w-7 animate-spin text-text-tertiary" />
					</div>
				) : items.length === 0 ? (
					<div className="flex flex-col items-center justify-center px-6 py-16 text-center">
						<UserPlus className="mb-4 h-10 w-10 text-text-tertiary/50" />
						<p className="font-bold text-text-primary">No follower activity yet</p>
						<p className="mt-1 text-sm text-text-tertiary">New followers will show up here.</p>
					</div>
				) : (
					<div className="flex flex-col divide-y divide-border-primary rounded-xl border-2 border-border-primary bg-bg-2">
						{items.map((item) => {
							const displayName = getDisplayName(item);
							const loadingFollow = followLoadingId === item.followerId;

							return (
								<div key={item.id} className="flex items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
									<button
										type="button"
										onClick={() => navigate(`/profile/${item.followerId}`)}
										className="relative flex-shrink-0"
									>
										<Avatar className="h-14 w-14 ring-2 ring-border-primary sm:h-16 sm:w-16">
											<AvatarImage src={item.followerAvatar ?? undefined} />
											<AvatarFallback className="bg-bg-3 text-lg font-black text-text-primary">
												{displayName.charAt(0).toUpperCase()}
											</AvatarFallback>
										</Avatar>
									</button>

									<button
										type="button"
										onClick={() => navigate(`/profile/${item.followerId}`)}
										className="min-w-0 flex-1 text-left"
									>
										<div className="flex flex-wrap items-baseline gap-x-2">
											<span className="truncate text-lg font-black text-text-primary sm:text-xl">{displayName}</span>
											<span className="text-sm font-semibold text-text-tertiary">
												{formatFollowedAt(item.followedAt)}
											</span>
										</div>
										<div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-text-tertiary sm:text-base">
											<UserPlus className="h-4 w-4 rounded-full bg-green-500 p-0.5 text-white" />
											<span>started following you</span>
										</div>
									</button>

									<button
										type="button"
										onClick={() => followBack(item)}
										disabled={item.isFollowingBack || loadingFollow}
										className={cn(
											'flex h-10 min-w-[104px] items-center justify-center rounded-full px-4 text-sm font-black transition-colors sm:h-11 sm:min-w-[128px] sm:text-base',
											item.isFollowingBack
												? 'border-2 border-border-primary bg-transparent text-text-primary'
												: 'bg-neo-orange text-[#1a1a1a] hover:bg-neo-orange/90',
										)}
									>
										{loadingFollow ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : item.isFollowingBack ? (
											'Friends'
										) : (
											'Follow back'
										)}
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
