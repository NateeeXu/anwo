import { ACCENT, ACCENT_SOFT, INK3, LINE_STRONG, Spot, type SpotProps } from './Spot';

/** Student ID card waiting for a shield — verify to unlock this. */
export function NeedVerification(props: SpotProps) {
  return (
    <Spot {...props}>
      <rect x="24" y="30" width="100" height="62" rx="8" />
      <path d="M24 44h100" stroke={LINE_STRONG} />
      <circle cx="48" cy="66" r="9" stroke={INK3} />
      <path d="M34 86a14 14 0 0 1 28 0" stroke={INK3} />
      <path d="M70 60h40M70 70h28M70 80h34" stroke={INK3} />
      <path d="M126 64l18-6 18 6v12c0 12-8 20-18 24-10-4-18-12-18-24z" fill={ACCENT_SOFT} stroke={ACCENT} />
      <path d="M136 80l5 5 10-11" stroke={ACCENT} />
    </Spot>
  );
}
export default NeedVerification;
