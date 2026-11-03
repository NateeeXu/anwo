import { ACCENT, INK3, LINE_STRONG, Spot, type SpotProps } from './Spot';

/** Open, empty moving box with a price tag — nothing for sale yet. */
export function NoItems(props: SpotProps) {
  return (
    <Spot {...props}>
      <path d="M20 96h120" stroke={LINE_STRONG} />
      <path d="M40 60h80v36H40z" />
      <path d="M40 60L28 44h44l8 16M120 60l12-16H88l-8 16" />
      <path d="M72 44l8 16" stroke={INK3} />
      <path d="M80 60v36" stroke={INK3} />
      <path d="M56 80h10M94 80h10" stroke={INK3} />
      <path d="M118 22l18 4 6 20-14 10-14-14z" stroke={INK3} />
      <circle cx="132" cy="30" r="2.5" fill={ACCENT} stroke="none" />
      <path d="M112 50l-6 8" stroke={INK3} />
    </Spot>
  );
}
export default NoItems;
