// Module routes for "verify" — owned by the verify module agent.
//   /verify                     verification center (auth required)
//   /verify/trust/:userId       public trust profile card (standalone)
//   /verify/admin               the admin review panel (admin role) — the admin shell mounts the same component at /admin/verify
import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { RequireRole } from '../../app/guards';

const VerifyCenter = lazy(() => import('./VerifyCenter'));
const TrustProfilePage = lazy(() => import('./TrustProfilePage'));
const AdminPanel = lazy(() => import('./admin'));

const routes: RouteObject[] = [
  { path: 'verify', element: <VerifyCenter /> },
  { path: 'verify/trust/:userId', element: <TrustProfilePage /> },
  { path: 'verify/admin', element: <RequireRole role="admin"><AdminPanel /></RequireRole> },
  { path: 'verify/*', element: <Navigate to="/verify" replace /> },
];

export default routes;
