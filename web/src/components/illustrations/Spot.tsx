import type { ReactNode, SVGProps } from 'react';

export type SpotProps = Omit<SVGProps<SVGSVGElement>, 'width' | 'height' | 'children'> & {
  /** Width in px; height follows the 4:3 viewBox. Default 160. */
  size?: number;
  /** Accessible title. Default `null` = decorative (`aria-hidden`), which is right next to a text empty state. */
  title?: string | null;
};

type BaseProps = SpotProps & { children: ReactNode };

/** Shared 160×120 canvas: 2 px ink strokes, round caps, one accent dot. Tokens only (ink / line / accent). */
export function Spot({ size = 160, title = null, className, children, ...rest }: BaseProps) {
  const a11y = title === null ? { 'aria-hidden': true as const } : { role: 'img' as const, 'aria-label': title };
  return (
    <svg
      viewBox="0 0 160 120"
      width={size}
      height={Math.round(size * 0.75)}
      fill="none"
      stroke="var(--ink)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...a11y}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const INK3 = 'var(--ink-3)';
export const LINE = 'var(--line)';
export const LINE_STRONG = 'var(--line-strong)';
export const ACCENT = 'var(--accent-vivid)';
export const ACCENT_SOFT = 'var(--accent-soft)';
