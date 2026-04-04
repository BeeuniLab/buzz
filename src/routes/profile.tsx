import React from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useNavigate, useParams } from 'react-router';
import { useFavoriteApps } from '@/hooks/use-apps';
import { AppCard } from '@/components/shared/AppCard';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Bookmark, Code2, Loader2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AppWithUserAndStats } from '@/api-types';

type ProfileTab = 'favorites' | 'created';

interface PublicUserProfile {
  id: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
}

function formatStatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function Profile() {
  const { userId } = useParams<{ userId?: string }>();
  const { user } = useAuth();
  const { requireAuth } = useAuthGuard();
  const navigate = useNavigate();
  const isViewingOther = !!userId && userId !== user?.id;
  const [activeTab, setActiveTab] = React.useState<ProfileTab>(isViewingOther ? 'created' : 'favorites');

  // Own profile data
  const { apps: favoriteApps, loading: favLoading } = useFavoriteApps();

  // Created apps with stats (fetched via getPublicApps for both own and public profiles)
  const [createdApps, setCreatedApps] = React.useState<AppWithUserAndStats[]>([]);
  const [createdLoading, setCreatedLoading] = React.useState(false);

  // Public profile data (for viewing other users)
  const [publicProfile, setPublicProfile] = React.useState<PublicUserProfile | null>(null);
  const [publicLoading, setPublicLoading] = React.useState(false);

  const isOwnProfile = !userId || userId === user?.id;
  const targetUserId = isOwnProfile ? user?.id : userId;

  // Fetch created apps with stats for any profile
  React.useEffect(() => {
    if (!targetUserId) return;

    setCreatedLoading(true);
    apiClient.getPublicApps({ authorId: targetUserId, sort: 'recent', limit: 50 })
      .then((res) => {
        if (res.success && res.data) {
          setCreatedApps(res.data.apps);
        }
      })
      .catch(() => {})
      .finally(() => setCreatedLoading(false));
  }, [targetUserId]);

  React.useEffect(() => {
    setActiveTab(isViewingOther ? 'created' : 'favorites');
  }, [isViewingOther]);

  // Fetch public profile info for other users
  React.useEffect(() => {
    if (isOwnProfile || !userId) return;

    setPublicLoading(true);
    apiClient.getPublicUserProfile(userId)
      .then((res) => {
        if (res.success && res.data) {
          setPublicProfile(res.data);
        }
      })
      .catch(() => {})
      .finally(() => setPublicLoading(false));
  }, [userId, isOwnProfile]);

  // Own profile: require auth — use effect to avoid setState during render
  React.useEffect(() => {
    if (isOwnProfile && !user) {
      requireAuth({ actionContext: 'to view your profile' });
      navigate('/', { replace: true });
    }
  }, [isOwnProfile, user, requireAuth, navigate]);

  if (isOwnProfile && !user) {
    return null;
  }

  // Public profile loading
  if (!isOwnProfile && (publicLoading || createdLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-text-tertiary animate-spin" />
      </div>
    );
  }

  // Public profile not found
  if (!isOwnProfile && !publicProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-text-tertiary">User not found.</p>
      </div>
    );
  }

  // Determine display data
  const displayName = isOwnProfile
    ? (user!.displayName || user!.email || 'user')
    : (publicProfile!.displayName || publicProfile!.username || 'user');
  const displayUsername = isOwnProfile
    ? (user!.username || user!.displayName || 'user')
    : (publicProfile!.username || publicProfile!.displayName || 'user');
  const displayAvatar = isOwnProfile ? user!.avatarUrl : publicProfile!.avatarUrl;

  // Compute aggregate stats from created apps (now always has viewCount/starCount)
  const totalPlays = createdApps.reduce((sum, app) => sum + (app.viewCount || 0), 0);
  const totalLikes = createdApps.reduce((sum, app) => sum + (app.starCount || 0), 0);

  const apps = isOwnProfile
    ? (activeTab === 'favorites' ? favoriteApps : createdApps)
    : createdApps;
  const loading = isOwnProfile
    ? (activeTab === 'favorites' ? favLoading : createdLoading)
    : createdLoading;

  const handleShare = () => {
    const profileUrl = `${window.location.origin}/profile/${userId || user?.id}`;
    navigator.clipboard.writeText(profileUrl).then(() => {
      toast.success('Profile link copied');
    });
  };

  return (
    <div className="min-h-screen">
      {/* Profile Header Banner */}
      <div className="bg-bg-2 border-b border-border-primary">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <Avatar className="h-20 w-20 ring-4 ring-bg-3 shadow-xl flex-shrink-0">
              <AvatarImage src={displayAvatar || undefined} />
              <AvatarFallback className="text-2xl bg-gradient-to-br from-[#f48120] to-[#faae42] text-white">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>

            {/* Name + share */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">@{displayUsername}</h1>
              <button
                onClick={handleShare}
                className="p-2 rounded-full hover:bg-bg-3 transition-colors flex-shrink-0"
                title="Share profile"
              >
                <Share2 className="h-4 w-4 text-text-tertiary" />
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-0 flex-shrink-0">
              <div className="flex flex-col items-center px-5 border-r border-border-primary">
                <span className="text-xs text-text-tertiary">Plays</span>
                <span className="text-lg font-bold">{formatStatCount(totalPlays)}</span>
              </div>
              <div className="flex flex-col items-center px-5">
                <span className="text-xs text-text-tertiary">Likes</span>
                <span className="text-lg font-bold">{formatStatCount(totalLikes)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        {/* Tabs — only show for own profile */}
        {isOwnProfile && (
          <div className="flex gap-2 mb-6">
            <button
              className={cn(
                'px-5 py-2 rounded-full text-sm font-medium transition-colors',
                activeTab === 'favorites'
                  ? 'bg-text-primary text-bg-1'
                  : 'bg-bg-3 text-text-tertiary hover:text-text-primary',
              )}
              onClick={() => setActiveTab('favorites')}
            >
              Favorites
            </button>
            <button
              className={cn(
                'px-5 py-2 rounded-full text-sm font-medium transition-colors',
                activeTab === 'created'
                  ? 'bg-text-primary text-bg-1'
                  : 'bg-bg-3 text-text-tertiary hover:text-text-primary',
              )}
              onClick={() => setActiveTab('created')}
            >
              Created
            </button>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 text-text-tertiary animate-spin" />
          </div>
        ) : apps.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7 gap-3">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onClick={(id) => navigate(`/feed/${id}`)}
                showStats={true}
                showUser={true}
                showAuthor={false}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16">
            {isOwnProfile && activeTab === 'favorites' ? (
              <>
                <Bookmark className="h-12 w-12 text-text-tertiary/40 mb-4" />
                <p className="text-text-tertiary font-medium">No favorites yet</p>
                <p className="text-sm text-text-tertiary/60 mt-1">
                  Tap the bookmark icon on apps you like!
                </p>
              </>
            ) : (
              <>
                <Code2 className="h-12 w-12 text-text-tertiary/40 mb-4" />
                <p className="text-text-tertiary font-medium">No apps created yet</p>
                {isOwnProfile && (
                  <p className="text-sm text-text-tertiary/60 mt-1">Start building!</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
