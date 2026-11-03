import { ACCENT, INK3, LINE_STRONG, Spot, type SpotProps } from './Spot';

/** Two people with room for a third — be the first to post a buddy request. */
export function NoBuddy(props: SpotProps) {
  return (
    <Spot {...props}>
      <path d="M20 96h120" stroke={LINE_STRONG} />
      <circle cx="58" cy="44" r="11" />
      <path d="M34 88a24 24 0 0 1 48 0" />
      <circle cx="96" cy="50" r="10" stroke={INK3} />
      <path d="M76 88a20 20 0 0 1 40 0" stroke={INK3} />
      <circle cx="128" cy="42" r="12" stroke={ACCENT} strokeDasharray="3 3" />
      <path d="M128 36v12M122 42h12" stroke={ACCENT} strokeWidth="2.5" />
    </Spot>
  );
}
export default NoBuddy;
