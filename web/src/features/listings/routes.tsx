// Module routes for "listings" — owned by the listings module agent. Mounted as children of the app shell (docs/WEB.md §2).
import { lazy } from 'react';
import type { RouteObject } from 'react-router';

const Browse = lazy(() => import('./pages/Browse'));
const Detail = lazy(() => import('./pages/Detail'));
const Mine = lazy(() => import('./pages/Mine'));
const Saved = lazy(() => import('./pages/Saved'));
const PostWizard = lazy(() => import('./pages/PostWizard'));
const EditListing = lazy(() => import('./pages/PostWizard').then((m) => ({ default: m.EditListing })));
const PostSuccess = lazy(() => import('./pages/PostSuccess'));

const routes: RouteObject[] = [
  { path: 'listings', element: <Browse /> },
  { path: 'listings/mine', element: <Mine /> },
  { path: 'listings/saved', element: <Saved /> },
  { path: 'listings/:id', element: <Detail /> },
  { path: 'listings/:id/edit', element: <EditListing />, handle: { hideTabs: true } },
  { path: 'listings/:id/success', element: <PostSuccess />, handle: { hideTabs: true } },
  { path: 'post/listing', element: <PostWizard />, handle: { hideTabs: true } },
];

export default routes;
