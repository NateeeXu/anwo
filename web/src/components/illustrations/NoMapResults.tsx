import { ACCENT, INK3, LINE_STRONG, Spot, type SpotProps } from './Spot';

/** Folded map under a magnifier with nothing inside — move the map or widen the search. */
export function NoMapResults(props: SpotProps) {
  return (
    <Spot {...props}>
      <path d="M22 36l38-10 40 10 38-10v60l-38 10-40-10-38 10z" />
      <path d="M60 26v70M100 36v70" stroke={LINE_STRONG} />
      <path d="M30 70c14-8 24-2 36-10s20 2 32-6" stroke={INK3} strokeDasharray="4 4" />
      <circle cx="52" cy="54" r="5" fill={ACCENT} stroke="none" />
      <path d="M52 59v6" stroke={ACCENT} strokeWidth="2.5" />
      <circle cx="116" cy="56" r="15" fill="var(--surface)" />
      <path d="M127 67l12 12" strokeWidth="3" />
      <path d="M108 56h16" stroke={INK3} strokeDasharray="2 3" />
    </Spot>
  );
}
export default NoMapResults;
