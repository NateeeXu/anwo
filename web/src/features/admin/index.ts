// Public surface of the "admin" module — other modules may import these (all render inside any page).
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
export { LineChart, BarList, Funnel, MiniColumns } from './charts';
export { ReasonDialog, Panel as AdminPanelCard, DefHint, CampusFilter, useAdminFilters } from './ui';
