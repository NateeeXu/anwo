// Router assembly: core routes + the 10 module route arrays, all children of the AppShell layout.
// Data mode (createBrowserRouter). See docs/WEB.md for conventions.
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { createBrowserRouter, useRouteError, type RouteObject } from 'react-router';
import { AppShell } from './shell/AppShell';
import { PageSkeleton } from './PageSkeleton';
import { ErrorFallback } from './ErrorBoundary';
import { RequireAuth, RequireRole } from './guards';

import listings from '../features/listings/routes';
import wanted from '../features/wanted/routes';
import chat from '../features/chat/routes';
import verify from '../features/verify/routes';
import map from '../features/map/routes';
import shuttle from '../features/shuttle/routes';
import market from '../features/market/routes';
import buddy from '../features/buddy/routes';
import billing from '../features/billing/routes';
import admin from '../features/admin/routes';

const Home = lazy(() => import('../pages/Home'));
const Welcome = lazy(() => import('../pages/Welcome'));
const Login = lazy(() => import('../pages/Login'));
const Register = lazy(() => import('../pages/Register'));
const Forgot = lazy(() => import('../pages/Forgot'));
const VerifyEmail = lazy(() => import('../pages/VerifyEmail'));
const Profile = lazy(() => import('../pages/Profile'));
const Settings = lazy(() => import('../pages/Settings'));
const Notifications = lazy(() => import('../pages/Notifications'));
const Search = lazy(() => import('../pages/Search'));
const Help = lazy(() => import('../pages/Help'));
const Safety = lazy(() => import('../pages/Safety'));
const Terms = lazy(() => import('../pages/Terms'));
const Privacy = lazy(() => import('../pages/Privacy'));
const DevMailbox = lazy(() => import('../pages/DevMailbox'));
const DevKitchen = lazy(() => import('../pages/DevKitchen'));
const NotFound = lazy(() => import('../pages/NotFound'));

function page(C: ComponentType): ReactNode {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <C />
    </Suspense>
  );
}

/** Wraps every element of a module's route tree in Suspense so modules can use React.lazy freely. */
function withSuspense(routes: RouteObject[]): RouteObject[] {
  return routes.map((r) => ({
    ...r,
    element: r.element === undefined ? undefined : <Suspense fallback={<PageSkeleton />}>{r.element}</Suspense>,
    children: r.children ? withSuspense(r.children) : undefined,
  })) as RouteObject[];
}

function RouteError() {
  const error = useRouteError();
  return <ErrorFallback error={error} />;
}

export const coreRoutes: RouteObject[] = [
  { index: true, element: page(Home) },
  { path: 'welcome', element: page(Welcome), handle: { layout: 'bare' } },
  { path: 'login', element: page(Login) },
  { path: 'register', element: page(Register) },
  { path: 'forgot', element: page(Forgot) },
  { path: 'verify-email', element: page(VerifyEmail) },
  { path: 'u/:id', element: page(Profile) },
  { path: 'settings', element: <RequireAuth>{page(Settings)}</RequireAuth> },
  { path: 'notifications', element: <RequireAuth>{page(Notifications)}</RequireAuth> },
  { path: 'search', element: page(Search) },
  { path: 'help', element: page(Help) },
  { path: 'safety', element: page(Safety) },
  { path: 'terms', element: page(Terms) },
  { path: 'privacy', element: page(Privacy) },
  { path: 'dev/mailbox', element: page(DevMailbox) },
  { path: 'dev/kitchen', element: page(DevKitchen) },
];

export const moduleRoutes: RouteObject[] = withSuspense([
  ...listings,
  ...wanted,
  ...chat,
  ...verify,
  ...map,
  ...shuttle,
  ...market,
  ...buddy,
  ...billing,
  // Admin routes are additionally wrapped in the admin role guard.
  ...admin.map((r) => ({ ...r, element: <RequireRole role="admin">{r.element}</RequireRole> })),
]);

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [...coreRoutes, ...moduleRoutes, { path: '*', element: page(NotFound) }],
  },
];

export const router = createBrowserRouter(routes);

export default router;
