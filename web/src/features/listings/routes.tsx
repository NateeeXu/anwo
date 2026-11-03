// Module routes for "listings" — owned by the listings module agent; replace freely.
// Contract: default-export a React Router RouteObject[] mounted as children of the app shell
// (see docs/WEB.md). Paths are relative to "/" (no leading slash). Lazy-load heavy pages with
// React.lazy — the router wraps every route element in Suspense with a skeleton fallback.
import type { RouteObject } from 'react-router';
import { ModulePlaceholder } from '../../app/ModulePlaceholder';

const routes: RouteObject[] = [
  { path: 'listings/*', element: <ModulePlaceholder moduleKey="listings" titleKey="listings.title" tabs /> },
  { path: 'post/listing', element: <ModulePlaceholder moduleKey="listings" titleKey="listings.post.listing.title" tabs /> },
];

export default routes;
