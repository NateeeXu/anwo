// server/src/modules/shuttle/service.ts — OWNED BY THE `shuttle` MODULE AGENT.
// Stable cross-module exports (DATA_MODEL §1): `nearestStop(campusId, lat, lng)` and `commuteEstimate` stay the
// scaffold implementations in server/src/lib/shuttle.ts; the extras below are what listings / map / admin may also use.
export { nearestStop, commuteEstimate } from '../../lib/shuttle';
export {
  campusHasData,
  stopsNear,
  nextDeparturesAtStop,
  activeAlerts,
  importCampusRoutes,
  exportCampusRoutes,
  localInfo,
  serviceDayFor,
  type ImportRouteInput,
  type ImportResult,
} from './lib';
