// Module routes for "buddy" — /buddy, /buddy/mine, /buddy/:id, /buddy/:id/edit, /post/buddy (docs/WEB.md §2).
import { lazy } from 'react';
import type { RouteObject } from 'react-router';

const BuddyBrowse = lazy(() => import('./pages/BuddyBrowse'));
const BuddyDetail = lazy(() => import('./pages/BuddyDetail'));
const BuddyMine = lazy(() => import('./pages/BuddyMine'));
const BuddyForm = lazy(() => import('./pages/BuddyForm'));

const routes: RouteObject[] = [
  { path: 'buddy', element: <BuddyBrowse /> },
  { path: 'buddy/mine', element: <BuddyMine /> },
  { path: 'buddy/:id', element: <BuddyDetail /> },
  { path: 'buddy/:id/edit', element: <BuddyForm /> },
  { path: 'post/buddy', element: <BuddyForm /> },
];

export default routes;
