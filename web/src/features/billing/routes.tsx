// Module routes for "billing" — owned by the billing module agent; replace freely.
// Contract: default-export a React Router RouteObject[] mounted as children of the app shell
// (see docs/WEB.md). Paths are relative to "/" (no leading slash). Lazy-load heavy pages with
// React.lazy — the router wraps every route element in Suspense with a skeleton fallback.
import type { RouteObject } from 'react-router';
import { ModulePlaceholder } from '../../app/ModulePlaceholder';

const routes: RouteObject[] = [
  { path: 'pricing', element: <ModulePlaceholder moduleKey="billing" titleKey="billing.pricing.title" /> },
  { path: 'kit', element: <ModulePlaceholder moduleKey="billing" titleKey="billing.kit.title" /> },
  { path: 'checkout/*', element: <ModulePlaceholder moduleKey="billing" titleKey="billing.checkout.title" /> },
  { path: 'wallet', element: <ModulePlaceholder moduleKey="billing" titleKey="billing.wallet.title" /> },
  { path: 'pro', element: <ModulePlaceholder moduleKey="billing" titleKey="billing.pro.title" /> },
];

export default routes;
