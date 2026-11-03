import type { SVGProps } from 'react';

export type LockupProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  /** Height in px; width scales at the fixed 132:32 ratio. Default 32. */
  size?: number;
  /** `inverse` draws the wordmark in inverse ink for `bg-inverse` surfaces. */
  tone?: 'default' | 'inverse';
  /** Hide the English word (tight spots such as the mobile top bar). */
  compact?: boolean;
  title?: string | null;
};

const RATIO = 132 / 32;

/**
 * Horizontal lockup: mark + bilingual wordmark (DESIGN.md §1.3). 132×32 at size 32.
 * Text uses the display stack and CSS variables, so it follows theme and system fonts.
 */
export function Lockup({ size = 32, tone = 'default', compact = false, title = '安窝 Anwo', className, ...rest }: LockupProps) {
  const ink = tone === 'inverse' ? 'var(--ink-inverse)' : 'var(--ink)';
  const ink2 = tone === 'inverse' ? 'var(--ink-inverse)' : 'var(--ink-2)';
  const vbWidth = compact ? 80 : 132;
  const width = Math.round(size * (compact ? 80 / 32 : RATIO));
  const a11y = title === null ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': title };
  return (
    <svg
      viewBox={`0 0 ${vbWidth} 32`}
      width={width}
      height={size}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...a11y}
      {...rest}
    >
      <g fill="none">
        <path d="M6 15 L16 7 L26 15" stroke={ink} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 3.5 V6" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="16" cy="20" r="5.5" fill="var(--accent-vivid)" />
        <path d="M16 25.5 V28.5" stroke="var(--accent-vivid)" strokeWidth="2.5" strokeLinecap="round" />
      </g>
      <text x="38" y="22" fontFamily="var(--font-display)" fontSize="19" fontWeight="700" letterSpacing="-0.01em" fill={ink}>
        安窝
      </text>
      {!compact && (
        <text x="80" y="22" fontFamily="var(--font-display)" fontSize="17" fontWeight="600" letterSpacing="-0.02em" fill={ink2}>
          Anwo
        </text>
      )}
    </svg>
  );
}

export default Lockup;
