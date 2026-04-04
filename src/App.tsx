import { Outlet } from 'react-router';
import { AuthProvider } from './contexts/auth-context';
import { AuthModalProvider } from './components/auth/AuthModalProvider';
import { InviteCodeProvider } from './components/invite-code/InviteCodeProvider';
import { ThemeProvider } from './contexts/theme-context';
import { VaultProvider } from './contexts/vault-context';
import { Toaster } from './components/ui/sonner';
import { AppLayout } from './components/layout/app-layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeatureProvider } from './features';

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <FeatureProvider>
          <AuthProvider>
            <VaultProvider>
              <AuthModalProvider>
                <InviteCodeProvider>
                <AppLayout>
                  <Outlet />
                </AppLayout>
                <Toaster richColors position="top-right" />
                </InviteCodeProvider>
              </AuthModalProvider>
            </VaultProvider>
          </AuthProvider>
        </FeatureProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
