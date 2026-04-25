/**
 * Type definitions for User Controller responses
 */

import { EnhancedAppData, PaginationInfo } from '../../../database/types';

/**
 * Response data for getApps
 */
export interface UserAppsData {
    apps: EnhancedAppData[];
    pagination: PaginationInfo;
}

/**
 * Response data for updateProfile
 */
export interface ProfileUpdateData {
    success: boolean;
    message: string;
}

/**
 * Response data for public profile
 */
export interface PublicUserProfileData {
    id: string;
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
    bio: string | null;
    followersCount: number;
    followingCount: number;
}

/**
 * Response data for follow/unfollow
 */
export interface UserFollowData {
    isFollowing: boolean;
    followersCount: number;
    followingCount: number;
}

export interface FollowerInboxItem {
    id: string;
    followerId: string;
    followerName: string | null;
    followerUsername: string | null;
    followerAvatar: string | null;
    followedAt: Date | null;
    isFollowingBack: boolean;
}

export interface FollowerInboxData {
    items: FollowerInboxItem[];
}
