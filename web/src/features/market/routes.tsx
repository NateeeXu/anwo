// Module routes for "market" — owned by the market module agent. Mounted as children of the app shell (docs/WEB.md §2).
import { lazy } from 'react';
import type { RouteObject } from 'react-router';

const MarketBrowse = lazy(() => import('./pages/MarketBrowse'));
const ItemDetail = lazy(() => import('./pages/ItemDetail'));
const PostItem = lazy(() => import('./pages/PostItem'));
const MyItems = lazy(() => import('./pages/MyItems'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const BundleDetail = lazy(() => import('./pages/BundleDetail'));
const BundleForm = lazy(() => import('./pages/BundleForm'));

const routes: RouteObject[] = [
  { path: 'market', element: <MarketBrowse /> },
  { path: 'market/mine', element: <MyItems />, handle: { back: true } },
  { path: 'market/wishlist', element: <Wishlist />, handle: { back: true } },
  { path: 'market/bundles/new', element: <BundleForm />, handle: { back: true } },
  { path: 'market/bundles/:id/edit', element: <BundleForm />, handle: { back: true } },
  { path: 'market/bundles/:id', element: <BundleDetail />, handle: { back: true } },
  { path: 'market/:id/edit', element: <PostItem />, handle: { back: true } },
  { path: 'market/:id', element: <ItemDetail />, handle: { back: true } },
  { path: 'post/item', element: <PostItem />, handle: { back: true } },
];

export default routes;
