import { ACCENT, INK3, Spot, type SpotProps } from './Spot';

/** Cloud with the line cut — offline, reconnecting. */
export function Offline(props: SpotProps) {
  return (
    <Spot {...props}>
      <path d="M50 88h62a18 18 0 0 0 2-36 28 28 0 0 0-52-6 17 17 0 0 0-12 42z" />
      <path d="M62 100h36" stroke={INK3} strokeDasharray="4 4" />
      <path d="M44 100L118 26" stroke={ACCENT} strokeWidth="2.5" />
      <circle cx="80" cy="64" r="3" fill={INK3} stroke="none" />
      <path d="M68 58a16 16 0 0 1 24 0" stroke={INK3} />
      <path d="M60 50a28 28 0 0 1 40 0" stroke={INK3} />
    </Spot>
  );
}
export default Offline;
