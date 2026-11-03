// Module routes for "map" — owned by the map module agent.
//   /map          explore page (full-bleed map, layers, drawer, draw-radius, nationwide campus bubbles)
//   /map/admin    POI / suggestion / cache admin (admin role) — the admin shell mounts the same component at /admin/map
import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { RequireRole } from '../../app/guards';

const MapExplorePage = lazy(() => import('./pages/MapExplorePage'));
const MapAdminPanel = lazy(() => import('./admin'));

const routes: RouteObject[] = [
  { path: 'map', element: <MapExplorePage />, handle: { layout: 'full' } },
  { path: 'map/admin', element: <RequireRole role="admin"><MapAdminPanel /></RequireRole> },
];

export default routes;
