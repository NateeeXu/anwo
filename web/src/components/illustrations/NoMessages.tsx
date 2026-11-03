import { ACCENT, INK3, Spot, type SpotProps } from './Spot';

/** Two chat bubbles, the reply still typing — nothing in the inbox. */
export function NoMessages(props: SpotProps) {
  return (
    <Spot {...props}>
      <path d="M36 26h56a10 10 0 0 1 10 10v18a10 10 0 0 1-10 10H54l-14 12V64h-4a10 10 0 0 1-10-10V36a10 10 0 0 1 10-10z" />
      <path d="M48 42h32M48 50h20" stroke={INK3} />
      <path d="M124 56H74a10 10 0 0 0-10 10v16a10 10 0 0 0 10 10h36l14 12V92h0a10 10 0 0 0 10-10V66a10 10 0 0 0-10-10z" stroke={INK3} />
      <circle cx="86" cy="74" r="2.5" fill={INK3} stroke="none" />
      <circle cx="99" cy="74" r="3.5" fill={ACCENT} stroke="none" />
      <circle cx="112" cy="74" r="2.5" fill={INK3} stroke="none" />
    </Spot>
  );
}
export default NoMessages;
