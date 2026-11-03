// Module routes for "wanted" — owned by the wanted module agent.
// Contract: default-export a React Router RouteObject[] mounted as children of the app shell (docs/WEB.md).
import { lazy } from 'react';
import type { RouteObject } from 'react-router';

const Browse = lazy(() => import('./pages/Browse'));
const Detail = lazy(() => import('./pages/Detail'));
const Matches = lazy(() => import('./pages/Matches'));
const Mine = lazy(() => import('./pages/Mine'));
const PostForm = lazy(() => import('./pages/PostForm'));
const ForMyListings = lazy(() => import('./pages/ForMyListings'));
const Digest = lazy(() => import('./pages/Digest'));

const routes: RouteObject[] = [
  { path: 'wanted', element: <Browse /> },
  { path: 'wanted/mine', element: <Mine /> },
  { path: 'wanted/for-my-listings', element: <ForMyListings /> },
  { path: 'wanted/digest', element: <Digest /> },
  { path: 'wanted/:id', element: <Detail /> },
  { path: 'wanted/:id/matches', element: <Matches /> },
  { path: 'wanted/:id/edit', element: <PostForm /> },
  { path: 'post/wanted', element: <PostForm /> },
];

export default routes;
