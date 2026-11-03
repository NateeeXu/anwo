import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type MapMarkerKind = 'listing' | 'item' | 'buddy' | 'stop' | 'poi' | 'campus';

export type PinState = {
  /** Text in the pill: `$1,250`, `免费 Free`, `11/08` … (already formatted by the caller). */
  label?: string;
  kind?: MapMarkerKind;
  selected?: boolean;
  hovered?: boolean;
  /** Visited / de-emphasised (ink-3 text, line-strong border). */
  muted?: boolean;
  /** Tiny up-right arrow before the price (no color change — search integrity, DESIGN §4.4). */
  boosted?: boolean;
  /** 8px accent dot at the top-right corner. */
  saved?: boolean;
};

const BOOST_GLYPH =
  '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * HTML string for a Leaflet divIcon price pin. The outer element is positioned so that the
 * tail tip sits exactly on the marker anchor (`iconAnchor: [0, 0]`).
 */
export function pricePinHtml(s: PinState): string {
  const label = escapeHtml(s.label ?? '');
  return (
    `<span class="anwo-pin" data-kind="${s.kind ?? 'listing'}" data-selected="${!!s.selected}" data-hovered="${!!s.hovered}" data-muted="${!!s.muted}" data-saved="${!!s.saved}">` +
    `<span class="anwo-pin__pill">${s.boosted ? `<span class="anwo-pin__glyph">${BOOST_GLYPH}</span>` : ''}${label}</span>` +
    `<span class="anwo-pin__tail"></span>` +
    `</span>`
  );
}

/** Stable cache key for a pin state (used to memoise Leaflet icons). */
export function pinStateKey(s: PinState): string {
  return `${s.kind ?? 'listing'}|${s.label ?? ''}|${s.selected ? 1 : 0}${s.hovered ? 1 : 0}${s.muted ? 1 : 0}${s.boosted ? 1 : 0}${s.saved ? 1 : 0}`;
}

export type PricePinProps = PinState & Omit<HTMLAttributes<HTMLSpanElement>, 'children'>;

/**
 * React rendering of the same pin (legends, kitchen sink, list ↔ map link previews).
 * Inside Leaflet, MapView uses `pricePinHtml` through a divIcon instead.
 */
export function PricePin({ label, kind = 'listing', selected, hovered, muted, boosted, saved, className, style, ...rest }: PricePinProps) {
  return (
    <span
      className={cn('anwo-pin anwo-pin--static', className)}
      data-kind={kind}
      data-selected={!!selected}
      data-hovered={!!hovered}
      data-muted={!!muted}
      data-saved={!!saved}
      style={style}
      {...rest}
    >
      <span className="anwo-pin__pill">
        {boosted && (
          <span className="anwo-pin__glyph" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </span>
        )}
        {label}
      </span>
      <span className="anwo-pin__tail" />
    </span>
  );
}

export default PricePin;
