import { ACCENT, INK3, LINE_STRONG, Spot, type SpotProps } from './Spot';

/** Shuttle front view with a clock — no route data for this campus yet. */
export function NoShuttle(props: SpotProps) {
  return (
    <Spot {...props}>
      <path d="M16 104h128" stroke={LINE_STRONG} strokeDasharray="6 6" />
      <rect x="40" y="30" width="72" height="62" rx="10" />
      <rect x="48" y="38" width="56" height="24" rx="4" stroke={INK3} />
      <path d="M62 24h28a4 4 0 0 1 4 4v2H58v-2a4 4 0 0 1 4-4z" stroke={INK3} />
      <circle cx="54" cy="78" r="4" fill={ACCENT} stroke="none" />
      <circle cx="98" cy="78" r="4" stroke={INK3} />
      <path d="M66 78h20" stroke={INK3} />
      <path d="M48 92v8M104 92v8M58 100h6M88 100h6" />
      <circle cx="132" cy="40" r="11" stroke={INK3} />
      <path d="M132 33v7l5 3" stroke={INK3} />
    </Spot>
  );
}
export default NoShuttle;
