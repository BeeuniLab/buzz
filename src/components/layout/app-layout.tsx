import React from 'react';
import { Outlet, useLocation } from 'react-router';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { AppsDataProvider } from '@/contexts/apps-data-context';
import clsx from 'clsx';

interface AppLayoutProps {
  children?: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { pathname } = useLocation();
  const isBuildContext = pathname.startsWith('/build') || pathname.startsWith('/chat');
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
        <SidebarInset className={clsx("bg-bg-3 flex flex-col h-screen relative", pathname !== "/" && "overflow-hidden")}>
          <div className={clsx("flex-1 bg-bg-3", pathname !== "/" && "min-h-0 overflow-auto")}>
            {children || <Outlet />}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AppsDataProvider>
  );
}