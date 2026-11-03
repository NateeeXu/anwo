// Public surface of the "shuttle" module — owned by the shuttle module agent.
// Other modules import only from here (listing / item / buddy cards: `NearestStopChip`; detail pages: `AlertsBanner`).
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
export { NearestStopChip, type NearestStopChipProps } from './components/NearestStopChip';
export { AlertsBanner } from './components/AlertsBanner';
export { RouteSwatch, RouteDot } from './components/RouteSwatch';
export { DeparturesList } from './components/Departures';
export { useCampusShuttle, useNearbyStops, useNextDepartures, useRoute, shuttleKeys, type NearbyStop, type RouteListItem, type StopItem } from './api';
export { stopName, serviceDaysLabel, serviceSummary, clock as formatShuttleTime } from './labels';
