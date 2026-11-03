import type { SVGProps } from 'react';

export type MarkProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  /** Rendered size in px (square). Minimum 20 per DESIGN.md §1.3. */
  size?: number;
  /** `pin` (default) keeps the short tail that turns the nest dot into a map pin; `nest` drops it. */
  variant?: 'pin' | 'nest';
  /** `inverse` draws the roof in `--ink-inverse` for use on `bg-inverse` surfaces. */
  tone?: 'default' | 'inverse';
  /** Accessible label; pass `null` to mark the mark as decorative. */
  title?: string | null;
};

/**
 * 安窝 Anwo mark — the roof radical 宀 of 安 as a two-stroke chevron sheltering a
 * persimmon dot (nest + map pin). Uses CSS variables so it is correct in both themes.
 * Never gradient-filled, never rotated (DESIGN.md §1.3).
 */
export function Mark({ size = 32, variant = 'pin', tone = 'default', title = '安窝 Anwo', className, ...rest }: MarkProps) {
  const ink = tone === 'inverse' ? 'var(--ink-inverse)' : 'var(--ink)';
  const a11y = title === null ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': title };
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...a11y}
      {...rest}
    >
      <path d="M6 15 L16 7 L26 15" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3.5 V6" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="16" cy="20" r="5.5" fill="var(--accent-vivid)" />
      {variant === 'pin' && <path d="M16 25.5 V28.5" stroke="var(--accent-vivid)" strokeWidth="2.5" strokeLinecap="round" />}
    </svg>
  );
}

/** The mark as a plain SVG string (same geometry) for Leaflet divIcons and other non-React hosts. */
export function markSvgString({ size = 28, ink = 'var(--ink)', accent = 'var(--accent-vivid)' }: { size?: number; ink?: string; accent?: string } = {}): string {
  return (
    `<svg viewBox="0 0 32 32" width="${size}" height="${size}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<path d="M6 15 L16 7 L26 15" stroke="${ink}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M16 3.5 V6" stroke="${ink}" stroke-width="2.5" stroke-linecap="round"/>` +
    `<circle cx="16" cy="20" r="5.5" fill="${accent}"/>` +
    `<path d="M16 25.5 V28.5" stroke="${accent}" stroke-width="2.5" stroke-linecap="round"/>` +
    `</svg>`
  );
}

export default Mark;
