// server/src/modules/map/service.ts — OWNED BY THE `map` MODULE AGENT.
// Scaffold provides geocode() (cache → Nominatim → campus fallback) and commuteEstimate(); the map module may wrap/extend them.
export { geocode, suggestCampus } from '../../lib/geo';
export { commuteEstimate as commute } from '../../lib/shuttle';
