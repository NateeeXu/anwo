// Module routes for "billing" (paths relative to "/"; the shell wraps every element in Suspense).
//   /pricing (?tab=students|landlords|businesses, ?boost=<entityType>:<id> opens the BoostSheet)
//   /checkout/:orderId · /billing/success?order= · /billing/cancel · /billing/boosts · /wallet · /pro
//   /kit · /kit/:slug · /kit/share/:campusId (public pre-arrival page)
//   /escrow · /escrow/new?listingId= · /escrow/:id  (+ /billing/escrows/:id and /billing/secure/:id aliases used in links)
//   /billing/admin — standalone fallback for the admin panel until the admin shell mounts admin.tsx at /admin/revenue
import { lazy } from 'react';
import { Navigate, useParams, type RouteObject } from 'react-router';
import { RequireRole } from '../../app/guards';

const Pricing = lazy(() => import('./pages/Pricing'));
const Checkout = lazy(() => import('./pages/Checkout'));
const CheckoutSuccess = lazy(() => import('./pages/CheckoutResult').then((m) => ({ default: m.CheckoutSuccessPage })));
const CheckoutCancel = lazy(() => import('./pages/CheckoutResult').then((m) => ({ default: m.CheckoutCancelPage })));
const Wallet = lazy(() => import('./pages/Wallet'));
const Pro = lazy(() => import('./pages/Pro'));
const Kit = lazy(() => import('./pages/Kit'));
const KitShare = lazy(() => import('./pages/Kit').then((m) => ({ default: m.KitSharePage })));
const PartnerDetail = lazy(() => import('./pages/PartnerDetail'));
const MyBoosts = lazy(() => import('./pages/MyBoosts'));
const EscrowList = lazy(() => import('./pages/Escrow').then((m) => ({ default: m.EscrowListPage })));
const EscrowNew = lazy(() => import('./pages/Escrow').then((m) => ({ default: m.EscrowNewPage })));
const EscrowDetail = lazy(() => import('./pages/Escrow').then((m) => ({ default: m.EscrowDetailPage })));
const AdminPanel = lazy(() => import('./admin'));

function EscrowAlias() {
  const { id } = useParams();
  return <Navigate to={`/escrow/${id ?? ''}`} replace />;
}

const routes: RouteObject[] = [
  { path: 'pricing', element: <Pricing /> },
  { path: 'checkout/:orderId', element: <Checkout /> },
  { path: 'checkout', element: <Navigate to="/billing/boosts" replace /> },
  { path: 'wallet', element: <Wallet /> },
  { path: 'pro', element: <Pro /> },
  { path: 'pro/dashboard', element: <Navigate to="/pro" replace /> },
  { path: 'kit', element: <Kit /> },
  { path: 'kit/share/:campusId', element: <KitShare /> },
  { path: 'kit/:slug', element: <PartnerDetail /> },
  { path: 'escrow', element: <EscrowList /> },
  { path: 'escrow/new', element: <EscrowNew /> },
  { path: 'escrow/:id', element: <EscrowDetail /> },
  { path: 'billing/success', element: <CheckoutSuccess /> },
  { path: 'billing/cancel', element: <CheckoutCancel /> },
  { path: 'billing/boosts', element: <MyBoosts /> },
  { path: 'billing/escrows', element: <Navigate to="/escrow" replace /> },
  { path: 'billing/escrows/:id', element: <EscrowAlias /> },
  { path: 'billing/secure/:id', element: <EscrowAlias /> },
  { path: 'billing/admin', element: <RequireRole role="admin"><div className="mx-auto w-full max-w-content px-4 lg:px-8"><AdminPanel /></div></RequireRole> },
];

export default routes;
