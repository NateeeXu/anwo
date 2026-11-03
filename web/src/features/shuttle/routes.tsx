// Module routes for "shuttle" — owned by the shuttle module agent.
//   /shuttle              campus shuttle page (routes · stops · favorites · map · stop sheet · request-my-campus)
//   /shuttle/admin        alerts editor (admin role) — the admin shell mounts the same component at /admin/shuttle
//   /shuttle/:routeId     route detail (stops, map, timetable)
import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { RequireRole } from '../../app/guards';

const ShuttlePage = lazy(() => import('./ShuttlePage'));
const RouteDetailPage = lazy(() => import('./RouteDetailPage'));
const AdminPanel = lazy(() => import('./admin'));

const routes: RouteObject[] = [
  { path: 'shuttle', element: <ShuttlePage /> },
  { path: 'shuttle/admin', element: <RequireRole role="admin"><AdminPanel /></RequireRole> },
  { path: 'shuttle/:routeId', element: <RouteDetailPage /> },
];

export default routes;
