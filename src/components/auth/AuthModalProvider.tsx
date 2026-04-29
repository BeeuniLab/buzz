/**
 * Authentication Modal Provider
 * Provides global authentication modal management
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { LoginModal } from './login-modal';
import { useAuth } from '../../contexts/auth-context';
import { setGlobalAuthModalTrigger } from '../../lib/api-client';
import { useLocation } from 'react-router';

interface AuthModalContextType {
  showAuthModal: (context?: string, onSuccess?: () => void, intendedUrl?: string) => void;
  hideAuthModal: () => void;
  isAuthModalOpen: boolean;
}

const AuthModalContext = createContext<AuthModalContextType | undefined>(undefined);

export function useAuthModal() {
  const context = useContext(AuthModalContext);
  if (context === undefined) {
    throw new Error('useAuthModal must be used within an AuthModalProvider');
  }
  return context;
}

interface AuthModalProviderProps {
  children: React.ReactNode;
}

export function AuthModalProvider({ children }: AuthModalProviderProps) {
  const { pathname } = useLocation();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<string | undefined>();
  const [pendingAction, setPendingAction] = useState<(() => void) | undefined>();
  const [intendedUrl, setIntendedUrlState] = useState<string | undefined>();
  const { login, loginWithEmail, register, error, clearError, isAuthenticated, isLoading } = useAuth();

  const showAuthModal = useCallback((context?: string, onSuccess?: () => void, intendedUrl?: string) => {
    setModalContext(context);
    setPendingAction(onSuccess ? () => onSuccess : undefined);
    setIntendedUrlState(intendedUrl);
    setIsAuthModalOpen(true);
  }, []);

  const hideAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    setModalContext(undefined);
    setPendingAction(undefined);
    setIntendedUrlState(undefined);
    clearError();
  }, [clearError]);

  // Close modal and execute pending action when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && isAuthModalOpen) {
      hideAuthModal();
      // Execute the pending action after a brief delay to ensure modal is closed
      if (pendingAction) {
        setTimeout(() => {
          pendingAction();
        }, 100);
      }
    }
  }, [isAuthenticated, pendingAction, isAuthModalOpen, hideAuthModal]);

  const handleLogin = useCallback((provider: 'google' | 'github', redirectUrl?: string) => {
    // Use the intended URL if available, otherwise use the provided redirect URL
    const finalRedirectUrl = intendedUrl || redirectUrl;
    login(provider, finalRedirectUrl);
  }, [login, intendedUrl]);

  // Set up global auth modal trigger for API client
  useEffect(() => {
    setGlobalAuthModalTrigger(showAuthModal);
  }, [showAuthModal]);

  // Auto-show login modal for unauthenticated users on private entry points only.
  // Uses a ref to track the resolved auth state and a brief delay to avoid
  // flashing on OAuth redirects where the cookie is set but profile hasn't loaded
  const authResolvedRef = React.useRef(false);
  const suppressAutoAuthModal =
    pathname === '/' ||
    pathname.startsWith('/feed') ||
    pathname.startsWith('/discover') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/build');

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      authResolvedRef.current = true;
      return;
    }
    if (suppressAutoAuthModal) return;
    if (authResolvedRef.current) return;
    authResolvedRef.current = true;
    showAuthModal();
  }, [isLoading, isAuthenticated, showAuthModal, suppressAutoAuthModal]);

  const value: AuthModalContextType = {
    showAuthModal,
    hideAuthModal,
    isAuthModalOpen,
  };

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <LoginModal
        isOpen={isAuthModalOpen}
        onClose={hideAuthModal}
        onLogin={login} // Fallback for backward compatibility
        onOAuthLogin={handleLogin}
        onEmailLogin={loginWithEmail}
        onRegister={register}
        error={error}
        onClearError={clearError}
        actionContext={modalContext}
      />
    </AuthModalContext.Provider>
  );
}
