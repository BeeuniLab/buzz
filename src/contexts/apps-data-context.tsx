import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiClient, ApiError } from '@/lib/api-client';
import type { AppWithFavoriteStatus } from '@/api-types';
import { appEvents } from '@/lib/app-events';
import type { AppEvent, AppCreatedEvent, AppDeletedEvent, AppUpdatedEvent } from '@/lib/app-events';
import { useAuth } from '@/contexts/auth-context';

interface AppsDataState {
  allApps: AppWithFavoriteStatus[];
  favoriteApps: AppWithFavoriteStatus[];
  recentApps: AppWithFavoriteStatus[];
  loading: {
    allApps: boolean;
    favoriteApps: boolean;
  };
  error: {
    allApps: string | null;
    favoriteApps: string | null;
  };
  moreRecentAvailable: boolean;
}

interface AppsDataContextValue extends AppsDataState {
  refetchAllApps: () => void;
  refetchFavoriteApps: () => void;
  refetchAll: () => void;
}

const AppsDataContext = createContext<AppsDataContextValue | null>(null);

const RECENT_APPS_LIMIT = 10;
const APP_CREATED_REFETCH_DELAYS_MS = [400, 1200, 3000] as const;
const GENERATING_APPS_POLL_INTERVAL_MS = 5000;

interface AppsDataProviderProps {
  children: React.ReactNode;
}

export function AppsDataProvider({ children }: AppsDataProviderProps) {
  const { user } = useAuth();
  
  const [state, setState] = useState<AppsDataState>({
    allApps: [],
    favoriteApps: [],
    recentApps: [],
    loading: {
      allApps: true,
      favoriteApps: true,
    },
    error: {
      allApps: null,
      favoriteApps: null,
    },
    moreRecentAvailable: false,
  });

  const buildOptimisticApp = useCallback((event: AppCreatedEvent): AppWithFavoriteStatus => {
    const now = new Date();

    return {
      id: event.appId,
      title: event.data?.title || 'New App',
      description: event.data?.description || null,
      iconUrl: null,
      originalPrompt: event.data?.description || event.data?.title || 'New App',
      finalPrompt: event.data?.description || event.data?.title || 'New App',
      framework: null,
      userId: user?.id ?? null,
      sessionToken: null,
      visibility: 'private',
      status: 'generating',
      deploymentId: null,
      githubRepositoryUrl: null,
      githubRepositoryVisibility: null,
      isArchived: false,
      isFeatured: false,
      version: 1,
      parentAppId: null,
      screenshotUrl: null,
      screenshotCapturedAt: null,
      createdAt: now,
      updatedAt: now,
      lastDeployedAt: null,
      isFavorite: false,
      updatedAtFormatted: 'Just now',
    };
  }, [user?.id]);

  // Compute recent apps from all apps to avoid duplicate API calls
  const computeRecentApps = useCallback((apps: AppWithFavoriteStatus[]) => {
    const sortedApps = [...apps].sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'generating' ? -1 : 1;
      }

      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return bTime - aTime;
    });
    
    return {
      recentApps: sortedApps.slice(0, RECENT_APPS_LIMIT),
      moreRecentAvailable: sortedApps.length > RECENT_APPS_LIMIT,
    };
  }, []);

  // Fetch all apps
  const fetchAllApps = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!user) {
      setState(prev => ({
        ...prev,
        allApps: [],
        ...computeRecentApps([]),
        loading: { ...prev.loading, allApps: false },
        error: { ...prev.error, allApps: null },
      }));
      return;
    }

    try {
      if (!silent) {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, allApps: true },
          error: { ...prev.error, allApps: null },
        }));
      }

      const response = await apiClient.getUserApps();
      
      if (response.success) {
        const apps = response.data?.apps || [];
        const { recentApps, moreRecentAvailable } = computeRecentApps(apps);
        
        setState(prev => ({
          ...prev,
          allApps: apps,
          recentApps,
          moreRecentAvailable,
          loading: silent ? prev.loading : { ...prev.loading, allApps: false },
        }));
      } else {
        if (!silent) {
          setState(prev => ({
            ...prev,
            loading: { ...prev.loading, allApps: false },
            error: { ...prev.error, allApps: response.error?.message || 'Failed to fetch apps' },
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching all apps:', err);
      if (silent) return;

      const errorMessage = err instanceof ApiError 
        ? `${err.message} (${err.status})`
        : err instanceof Error ? err.message : 'Failed to fetch apps';
      
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, allApps: false },
        error: { ...prev.error, allApps: errorMessage },
      }));
    }
  }, [user, computeRecentApps]);

  // Fetch favorite apps
  const fetchFavoriteApps = useCallback(async () => {
    if (!user) {
      setState(prev => ({
        ...prev,
        favoriteApps: [],
        loading: { ...prev.loading, favoriteApps: false },
        error: { ...prev.error, favoriteApps: null },
      }));
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, favoriteApps: true },
        error: { ...prev.error, favoriteApps: null },
      }));

      const response = await apiClient.getFavoriteApps();
      
      if (response.success) {
        setState(prev => ({
          ...prev,
          favoriteApps: response.data?.apps || [],
          loading: { ...prev.loading, favoriteApps: false },
        }));
      } else {
        setState(prev => ({
          ...prev,
          loading: { ...prev.loading, favoriteApps: false },
          error: { ...prev.error, favoriteApps: response.error?.message || 'Failed to fetch favorite apps' },
        }));
      }
    } catch (err) {
      console.error('Error fetching favorite apps:', err);
      const errorMessage = err instanceof ApiError
        ? `${err.message} (${err.status})`
        : err instanceof Error ? err.message : 'Failed to fetch favorite apps';
      
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, favoriteApps: false },
        error: { ...prev.error, favoriteApps: errorMessage },
      }));
    }
  }, [user]);

  // Parallel fetch both data sets
  const fetchAll = useCallback(async () => {
    if (!user) return;
    
    // Execute both API calls in parallel
    await Promise.all([
      fetchAllApps(),
      fetchFavoriteApps(),
    ]);
  }, [user, fetchAllApps, fetchFavoriteApps]);

  // Initial data load with parallel fetching
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!user) return;
    if (!state.allApps.some(app => app.status === 'generating')) return;

    const timer = window.setInterval(() => {
      void fetchAllApps({ silent: true });
    }, GENERATING_APPS_POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [fetchAllApps, state.allApps, user]);

  // Event handlers for real-time updates
  useEffect(() => {
    const createdRefetchTimers: number[] = [];

    const onDeleted = (event: AppEvent) => {
      if (event.type === 'app-deleted') {
        const deletedEvent = event as AppDeletedEvent;
        setState(prev => {
          const filteredAllApps = prev.allApps.filter(app => app.id !== deletedEvent.appId);
          const filteredFavoriteApps = prev.favoriteApps.filter(app => app.id !== deletedEvent.appId);
          const { recentApps, moreRecentAvailable } = computeRecentApps(filteredAllApps);
          
          return {
            ...prev,
            allApps: filteredAllApps,
            favoriteApps: filteredFavoriteApps,
            recentApps,
            moreRecentAvailable,
          };
        });
      }
    };
    
    const onCreated = (event: AppEvent) => {
      if (event.type !== 'app-created') return;

      const createdEvent = event as AppCreatedEvent;

      setState(prev => {
        const existingApp = prev.allApps.find(app => app.id === createdEvent.appId);
        if (existingApp) {
          return prev;
        }

        const optimisticApp = buildOptimisticApp(createdEvent);
        const nextAllApps = [optimisticApp, ...prev.allApps];
        const { recentApps, moreRecentAvailable } = computeRecentApps(nextAllApps);

        return {
          ...prev,
          allApps: nextAllApps,
          recentApps,
          moreRecentAvailable,
        };
      });

      for (const delay of APP_CREATED_REFETCH_DELAYS_MS) {
        const timer = window.setTimeout(() => {
          fetchAllApps();
        }, delay);
        createdRefetchTimers.push(timer);
      }
    };
    
    const onUpdated = (event: AppEvent) => {
      if (event.type === 'app-updated') {
        const updatedEvent = event as AppUpdatedEvent;
        if (updatedEvent.data) {
          setState(prev => {
            // Update all apps
            const updatedAllApps = prev.allApps.map(app => 
              app.id === updatedEvent.appId 
                ? { ...app, ...updatedEvent.data, updatedAt: new Date() }
                : app
            );
            
            // Update favorite apps if present
            const updatedFavoriteApps = prev.favoriteApps.map(app =>
              app.id === updatedEvent.appId
                ? { ...app, ...updatedEvent.data, updatedAt: new Date() }
                : app
            );
            
            // Recompute recent apps with updated data
            const { recentApps, moreRecentAvailable } = computeRecentApps(updatedAllApps);
            
            return {
              ...prev,
              allApps: updatedAllApps,
              favoriteApps: updatedFavoriteApps,
              recentApps,
              moreRecentAvailable,
            };
          });
        }
      }
    };

    const unsubscribeDeleted = appEvents.on('app-deleted', onDeleted);
    const unsubscribeCreated = appEvents.on('app-created', onCreated);
    const unsubscribeUpdated = appEvents.on('app-updated', onUpdated);

    return () => {
      createdRefetchTimers.forEach(window.clearTimeout);
      unsubscribeDeleted();
      unsubscribeCreated();
      unsubscribeUpdated();
    };
  }, [buildOptimisticApp, computeRecentApps, fetchAllApps]);

  const contextValue = useMemo<AppsDataContextValue>(() => ({
    ...state,
    refetchAllApps: fetchAllApps,
    refetchFavoriteApps: fetchFavoriteApps,
    refetchAll: fetchAll,
  }), [state, fetchAllApps, fetchFavoriteApps, fetchAll]);

  return (
    <AppsDataContext.Provider value={contextValue}>
      {children}
    </AppsDataContext.Provider>
  );
}

export function useAppsData() {
  const context = useContext(AppsDataContext);
  if (!context) {
    throw new Error('useAppsData must be used within an AppsDataProvider');
  }
  return context;
}
