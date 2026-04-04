import React from 'react';
import { Outlet, useLocation } from 'react-router';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { MobileBottomNav } from './mobile-bottom-nav';
import { AppsDataProvider } from '@/contexts/apps-data-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/auth-context';
import clsx from 'clsx';

interface AppLayoutProps {
  children?: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const isBuildContext = pathname.startsWith('/build') || pathname.startsWith('/chat') || pathname.startsWith('/app');
  const showMobileSidebarTrigger = isMobile && user && isBuildContext && !pathname.startsWith('/chat');
  const isFeedRoute = pathname === '/' || pathname.startsWith('/feed');
  const hideBottomNav = pathname.startsWith('/chat') || isFeedRoute;
  return (
    <AppsDataProvider>
      <SidebarProvider
        defaultOpen={!isBuildContext}
        style={{
          "--sidebar-width": "250px",
          "--sidebar-width-mobile": "250px",
          "--sidebar-width-icon": "52px",
        } as React.CSSProperties}
      >
        <AppSidebar />
        <SidebarInset className={clsx("bg-bg-3 flex flex-col h-screen relative md:pb-0", !hideBottomNav && "pb-14", pathname !== "/" && "overflow-hidden")}>
          {showMobileSidebarTrigger && (
            <div className="absolute top-2 left-2 z-40">
              <SidebarTrigger className="h-9 w-9 text-text-primary bg-bg-3 rounded-lg border-2 border-[var(--neo-border-color)] shadow-[2px_2px_0px_0px_var(--neo-border-color)]" />
            </div>
          )}
          <div className={clsx("flex-1 bg-bg-3", pathname !== "/" && "min-h-0 overflow-auto")}>
            {children || <Outlet />}
          </div>
        </SidebarInset>
        <MobileBottomNav />
      </SidebarProvider>
    </AppsDataProvider>
  );
}