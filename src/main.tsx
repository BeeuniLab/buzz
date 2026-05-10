import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/clerk-react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { initSentry } from './utils/sentry';

import { routes } from './routes.ts';
import './index.css';

// Initialize Sentry before rendering
initSentry();

// Type for React Router hydration data  
import type { RouterState } from 'react-router';

declare global {
  interface Window {
    __staticRouterHydrationData?: Partial<Pick<RouterState, 'loaderData' | 'actionData' | 'errors'>>;
  }
}

const router = createBrowserRouter(routes, {
	hydrationData: window.__staticRouterHydrationData,
});

const app = <RouterProvider router={router} />;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById('root')!).render(
  clerkPublishableKey
    ? (
      <ClerkProvider
        publishableKey={clerkPublishableKey}
        signInFallbackRedirectUrl="/"
        signUpFallbackRedirectUrl="/"
        afterSignOutUrl="/"
      >
        {app}
      </ClerkProvider>
    )
    : app
);
