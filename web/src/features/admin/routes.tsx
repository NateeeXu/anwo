// Admin module routes — /admin/* inside the app shell (layout 'full'); the app router wraps the top-level element in
// <RequireRole role="admin">. Pages are lazy-loaded; other modules' panels mount through ModuleSection.
import { lazy } from 'react';
import type { RouteObject } from 'react-router';

const AdminShell = lazy(() => import('./AdminShell'));
const Overview = lazy(() => import('./pages/Overview'));
const Users = lazy(() => import('./pages/Users'));
const Reports = lazy(() => import('./pages/Reports'));
const Revenue = lazy(() => import('./pages/Revenue'));
const Flags = lazy(() => import('./pages/Flags'));
const Campuses = lazy(() => import('./pages/Campuses'));
const Audit = lazy(() => import('./pages/Audit'));
const System = lazy(() => import('./pages/System'));
const ListingsModeration = lazy(() => import('./pages/Listings'));
const Section = lazy(() => import('./pages/Sections'));

const routes: RouteObject[] = [
  {
    path: 'admin',
    element: <AdminShell />,
    handle: { layout: 'full' },
    children: [
      { index: true, element: <Overview /> },
      { path: 'users', element: <Users /> },
      { path: 'verify', element: <Section moduleKey="verify" navKey="verify" /> },
      { path: 'reports', element: <Reports /> },
      { path: 'listings', element: <ListingsModeration /> },
      { path: 'wanted', element: <Section moduleKey="wanted" navKey="wanted" fallback="wanted" /> },
      { path: 'market', element: <Section moduleKey="market" navKey="market" fallback="market_item" /> },
      { path: 'buddy', element: <Section moduleKey="buddy" navKey="buddy" fallback="buddy_post" /> },
      { path: 'chat', element: <Section moduleKey="chat" navKey="chat" /> },
      { path: 'shuttle', element: <Section moduleKey="shuttle" navKey="shuttle" /> },
      { path: 'map', element: <Section moduleKey="map" navKey="map" /> },
      { path: 'revenue', element: <Revenue /> },
      { path: 'campuses', element: <Campuses /> },
      { path: 'flags', element: <Flags /> },
      { path: 'audit', element: <Audit /> },
      { path: 'system', element: <System /> },
      { path: '*', element: <Section moduleKey="__missing" navKey="notFound" /> },
    ],
  },
];

export default routes;
