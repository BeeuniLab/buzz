/**
 * Enhanced Auth Context
 * Provides Clerk Google sign-in plus local email/password fallback.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth as useClerkAuth } from '@clerk/clerk-react';
import { useSignIn as useClerkSignIn } from '@clerk/clerk-react';
import { useNavigate } from 'react-router';
import { apiClient, ApiError } from '@/lib/api-client';
import { useSentryUser } from '@/hooks/useSentryUser';
import type { AuthSession, AuthUser } from '../api-types';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Auth provider configuration
  authProviders: {
    google: boolean;
    email: boolean;
  } | null;
  clerkEnabled: boolean;
  hasThirdPartyAuth: boolean;
  requiresEmailAuth: boolean;
  
  loginWithGoogle: (redirectUrl?: string) => void;
  
  // Email/password login method
  loginWithEmail: (credentials: { email: string; password: string }) => Promise<void>;
  register: (data: { email: string; password: string; name?: string }) => Promise<void>;
  
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  clearError: () => void;
  
  // Redirect URL management
  setIntendedUrl: (url: string) => void;
  getIntendedUrl: () => string | null;
  clearIntendedUrl: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Token refresh interval - refresh every 10 minutes
const TOKEN_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour (check less frequently since tokens last 24h)
const CLERK_ENABLED = !!import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
type ClerkAuthState = ReturnType<typeof useClerkAuth>;
type ClerkSignInState = ReturnType<typeof useClerkSignIn>;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (CLERK_ENABLED) {
    return <ClerkAwareAuthProvider>{children}</ClerkAwareAuthProvider>;
  }

  return <AuthProviderInner clerk={null} clerkSignIn={null}>{children}</AuthProviderInner>;
}

function ClerkAwareAuthProvider({ children }: { children: React.ReactNode }) {
  const clerk = useClerkAuth();
  const clerkSignIn = useClerkSignIn();

  return <AuthProviderInner clerk={clerk} clerkSignIn={clerkSignIn}>{children}</AuthProviderInner>;
}

function AuthProviderInner({
  children,
  clerk,
  clerkSignIn,
}: {
  children: React.ReactNode;
  clerk: ClerkAuthState | null;
  clerkSignIn: ClerkSignInState | null;
}) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authProviders, setAuthProviders] = useState<{ google: boolean; email: boolean; } | null>(null);
  const [clerkEnabled, setClerkEnabled] = useState<boolean>(CLERK_ENABLED);
  const [hasThirdPartyAuth, setHasThirdPartyAuth] = useState<boolean>(false);
  const [requiresEmailAuth, setRequiresEmailAuth] = useState<boolean>(true);
  const navigate = useNavigate();
  
  // Sync user context with Sentry for error tracking
  useSentryUser(user);
  
  // Ref to store the refresh timer
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect URL management
  const INTENDED_URL_KEY = 'auth_intended_url';

  const setIntendedUrl = useCallback((url: string) => {
    try {
      sessionStorage.setItem(INTENDED_URL_KEY, url);
    } catch (error) {
      console.warn('Failed to store intended URL:', error);
    }
  }, []);

  const getIntendedUrl = useCallback((): string | null => {
    try {
      return sessionStorage.getItem(INTENDED_URL_KEY);
    } catch (error) {
      console.warn('Failed to retrieve intended URL:', error);
      return null;
    }
  }, []);

  const clearIntendedUrl = useCallback(() => {
    try {
      sessionStorage.removeItem(INTENDED_URL_KEY);
    } catch (error) {
      console.warn('Failed to clear intended URL:', error);
    }
  }, []);


  // Fetch auth providers configuration
  const fetchAuthProviders = useCallback(async () => {
    try {
      const response = await apiClient.getAuthProviders();
      if (response.success && response.data) {
        setAuthProviders(response.data.providers);
        setClerkEnabled(CLERK_ENABLED && response.data.clerk?.enabled === true);
        setHasThirdPartyAuth(response.data.hasThirdPartyAuth);
        setRequiresEmailAuth(response.data.requiresEmailAuth);
      }
    } catch (error) {
      console.warn('Failed to fetch auth providers:', error);
      // Fallback to defaults
      setAuthProviders({ google: false, email: true });
      setClerkEnabled(false);
      setHasThirdPartyAuth(false);
      setRequiresEmailAuth(true);
    }
  }, []);

  // Setup automatic session validation (cookie-based)
  const setupTokenRefresh = useCallback(() => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }

    // Set up session validation timer - less frequent since cookies handle refresh
    refreshTimerRef.current = setInterval(async () => {
      try {
        const response = await apiClient.getProfile(true);

        if (!response.success || !response.data?.user) {
          // Session invalid, user needs to login again
          setUser(null);
          setToken(null);
          setSession(null);
          clearInterval(refreshTimerRef.current!);
        }
      } catch (error) {
        console.error('Session validation failed:', error);
      }
    }, TOKEN_REFRESH_INTERVAL);
  }, []);

  const applySessionResponse = useCallback((data: {
    user: AuthUser;
    sessionId: string;
    expiresAt: Date | string | null;
  }) => {
    setUser({ ...data.user, isAnonymous: false } as AuthUser);
    setToken(null);
    setSession({
      userId: data.user.id,
      email: data.user.email,
      sessionId: data.sessionId,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    });
    setupTokenRefresh();
  }, [setupTokenRefresh]);

  // Check authentication status
  const checkAuth = useCallback(async () => {
    try {
      const response = await apiClient.getProfile(true);
      
      if (response.success && response.data?.user) {
        setUser({ ...response.data.user, isAnonymous: false } as AuthUser);
        setToken(null); // Profile endpoint doesn't return token, cookies are used
        setSession({
          userId: response.data.user.id,
          email: response.data.user.email,
          sessionId: response.data.sessionId || response.data.user.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours expiry
        });
        
        // Setup token refresh
        setupTokenRefresh();
      } else {
        setUser(null);
        setToken(null);
        setSession(null);
      }
    } catch (error) {
      setUser(null);
      setToken(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }, [setupTokenRefresh]);

  // Cleanup refresh timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  // Initialize auth state on mount
  useEffect(() => {
    const initAuth = async () => {
      await fetchAuthProviders();
      await checkAuth();
    };
    initAuth();
  }, [fetchAuthProviders, checkAuth]);

  useEffect(() => {
    if (!clerkEnabled || !clerk?.isLoaded || !clerk.isSignedIn || user) {
      return;
    }

    let cancelled = false;

    const syncClerkUser = async () => {
      setError(null);
      setIsLoading(true);

      try {
        const clerkToken = await clerk.getToken();
        if (!clerkToken) {
          throw new Error('Missing Clerk session token');
        }

        const response = await apiClient.syncClerkSession(clerkToken);
        if (!cancelled && response.success && response.data) {
          applySessionResponse(response.data);
          const intendedUrl = getIntendedUrl();
          clearIntendedUrl();
          if (intendedUrl) {
            navigate(intendedUrl);
          }
        }
      } catch (error) {
        console.error('Clerk sync error:', error);
        if (!cancelled) {
          setError(error instanceof ApiError ? error.message : 'Unable to complete sign in. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    syncClerkUser();

    return () => {
      cancelled = true;
    };
  }, [applySessionResponse, clearIntendedUrl, clerk, clerkEnabled, getIntendedUrl, navigate, user]);

  const loginWithGoogle = useCallback((redirectUrl?: string) => {
    // Store intended redirect URL if provided, otherwise use current location
    const intendedUrl = redirectUrl || window.location.pathname + window.location.search;
    setIntendedUrl(intendedUrl);

    if (clerkEnabled && clerkSignIn?.isLoaded) {
      clerkSignIn.signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: intendedUrl,
      });
      return;
    }

    setError('Google sign in is not configured yet.');
  }, [clerkEnabled, clerkSignIn, setIntendedUrl]);

  // Email/password login
  const loginWithEmail = useCallback(async (credentials: { email: string; password: string }) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiClient.loginWithEmail(credentials);

      if (response.success && response.data) {
        applySessionResponse(response.data);
        
        // Navigate to intended URL or default to home
        const intendedUrl = getIntendedUrl();
        clearIntendedUrl();
        navigate(intendedUrl || '/');
      }
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError('Connection error. Please try again.');
      }
      // Don't navigate on error - let modal stay open
      throw error; // Re-throw to inform caller
    } finally {
      setIsLoading(false);
    }
  }, [applySessionResponse, navigate, getIntendedUrl, clearIntendedUrl]);

  // Register new user
  const register = useCallback(async (data: { email: string; password: string; name?: string }) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiClient.register(data);

      if (response.success && response.data) {
        applySessionResponse(response.data);
        
        // Navigate to intended URL or default to home
        const intendedUrl = getIntendedUrl();
        clearIntendedUrl();
        navigate(intendedUrl || '/');
      }
    } catch (error) {
      console.error('Registration error:', error);
      if (error instanceof ApiError) {
        setError(error.message);
      } else {
        setError('Connection error. Please try again.');
      }
      throw error; // Re-throw to inform caller
    } finally {
      setIsLoading(false);
    }
  }, [applySessionResponse, navigate, getIntendedUrl, clearIntendedUrl]);

  // Logout
  const logout = useCallback(async () => {
    try {
      await apiClient.logout();
      if (clerkEnabled && clerk?.isLoaded && clerk.isSignedIn) {
        await clerk.signOut();
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
      window.location.href = '/';
    }
  }, [clerk, clerkEnabled]);

  // Refresh user profile
  const refreshUser = useCallback(async () => {
    await checkAuth();
  }, [checkAuth]);


  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clerkLoading = clerkEnabled && clerk?.isLoaded === false;
  const clerkSessionPending = clerkEnabled && clerk?.isLoaded === true && clerk.isSignedIn && !user && !error;

  const value: AuthContextType = {
    user,
    token,
    session,
    isAuthenticated: !!user,
    isLoading: isLoading || clerkLoading || clerkSessionPending,
    error,
    authProviders,
    clerkEnabled,
    hasThirdPartyAuth,
    requiresEmailAuth,
    loginWithGoogle,
    loginWithEmail, // Email/password method
    register,
    logout,
    refreshUser,
    clearError,
    setIntendedUrl,
    getIntendedUrl,
    clearIntendedUrl,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Helper hook for protected routes
export function useRequireAuth(redirectTo = '/') {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(redirectTo);
    }
  }, [isAuthenticated, isLoading, navigate, redirectTo]);

  return { isAuthenticated, isLoading };
}
