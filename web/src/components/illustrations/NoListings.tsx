import { ACCENT, LINE_STRONG, INK3, Spot, type SpotProps } from './Spot';

/** Empty house with a blank "for rent" sign — no sublets here yet. */
export function NoListings(props: SpotProps) {
  return (
    <Spot {...props}>
      <path d="M20 96h120" stroke={LINE_STRONG} />
      <path d="M30 62 80 24l50 38" />
      <path d="M42 54v42h76V54" />
      <path d="M72 96V72a8 8 0 0 1 16 0v24" />
      <rect x="50" y="64" width="14" height="12" rx="2" stroke={INK3} />
      <rect x="96" y="64" width="14" height="12" rx="2" stroke={INK3} />
      <circle cx="80" cy="46" r="5" fill={ACCENT} stroke="none" />
      <path d="M136 96V76" stroke={INK3} />
      <rect x="124" y="60" width="24" height="16" rx="3" stroke={INK3} />
      <path d="M130 66h12M130 70h8" stroke={INK3} strokeDasharray="2 3" />
    </Spot>
  );
}
export default NoListings;
