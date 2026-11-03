import L from 'leaflet';
import { markSvgString } from '@/components/brand/Mark';
import { clusterPinHtml } from './ClusterPin';
import { pricePinHtml, pinStateKey, type MapMarkerKind, type PinState } from './PricePin';

// ---------------------------------------------------------------------
// Leaflet's default marker icon resolves image paths from the CSS file
// URL, which breaks under bundlers. We never use the teardrop in the UI,
// but anything that falls back to `L.Marker` without an icon (modules,
// popups, tests) should still get an on-brand pin instead of a 404.
// ---------------------------------------------------------------------
const DEFAULT_PIN_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 36" width="28" height="36">` +
  `<path d="M14 1C7 1 2 6.2 2 12.8 2 22 14 35 14 35s12-13 12-22.2C26 6.2 21 1 14 1z" fill="#C2410C" stroke="#FFFFFF" stroke-width="2"/>` +
  `<circle cx="14" cy="13" r="4.5" fill="#FFFFFF"/></svg>`;
const DEFAULT_PIN_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(DEFAULT_PIN_SVG)}`;

let defaultFixed = false;
export function fixLeafletDefaultIcon(): void {
  if (defaultFixed) return;
  defaultFixed = true;
  // Remove the URL-sniffing getter and point every default marker at the inline SVG.
  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconUrl: DEFAULT_PIN_URL,
    iconRetinaUrl: DEFAULT_PIN_URL,
    shadowUrl: undefined,
    shadowRetinaUrl: undefined,
    shadowSize: undefined,
    iconSize: [28, 36],
    iconAnchor: [14, 35],
    popupAnchor: [0, -30],
  });
}

const cache = new Map<string, L.DivIcon>();
function memo(key: string, make: () => L.DivIcon): L.DivIcon {
  let icon = cache.get(key);
  if (!icon) {
    icon = make();
    cache.set(key, icon);
    if (cache.size > 2000) cache.clear();
  }
  return icon;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Price pill pin (listing / item / buddy). Anchor = tail tip. */
export function pricePinIcon(state: PinState): L.DivIcon {
  return memo(`pin:${pinStateKey(state)}`, () =>
    L.divIcon({ html: pricePinHtml(state), className: 'anwo-marker', iconSize: undefined, iconAnchor: [0, 0] }),
  );
}

export function clusterIcon(count: number): L.DivIcon {
  return memo(`cluster:${count >= 50 ? 'lg' : 'md'}:${count > 99 ? '99+' : count}`, () =>
    L.divIcon({ html: clusterPinHtml(count), className: 'anwo-marker', iconSize: undefined, iconAnchor: [0, 0] }),
  );
}

export function stopIcon(s: { selected?: boolean; hovered?: boolean; muted?: boolean; label?: string }): L.DivIcon {
  const key = `stop:${s.selected ? 1 : 0}${s.hovered ? 1 : 0}${s.muted ? 1 : 0}`;
  return memo(key, () =>
    L.divIcon({
      html: `<span class="anwo-stop" data-selected="${!!s.selected}" data-hovered="${!!s.hovered}" data-muted="${!!s.muted}"><span class="anwo-stop__dot"></span></span>`,
      className: 'anwo-marker',
      iconSize: undefined,
      iconAnchor: [0, 0],
    }),
  );
}

export function poiIcon(s: { label?: string; selected?: boolean; hovered?: boolean }): L.DivIcon {
  const key = `poi:${s.label ?? ''}:${s.selected ? 1 : 0}${s.hovered ? 1 : 0}`;
  return memo(key, () =>
    L.divIcon({
      html:
        `<span class="anwo-poi" data-selected="${!!s.selected}" data-hovered="${!!s.hovered}"><span class="anwo-poi__dot"></span>` +
        (s.label ? `<span class="anwo-poi__label">${escapeHtml(s.label)}</span>` : '') +
        `</span>`,
      className: 'anwo-marker',
      iconSize: undefined,
      iconAnchor: [0, 0],
    }),
  );
}

export function campusIcon(label?: string): L.DivIcon {
  return memo(`campus:${label ?? ''}`, () =>
    L.divIcon({
      html: `<span class="anwo-campus">${markSvgString({ size: 28 })}${label ? `<span class="anwo-campus__label">${escapeHtml(label)}</span>` : ''}</span>`,
      className: 'anwo-marker',
      iconSize: undefined,
      iconAnchor: [0, 0],
    }),
  );
}

export function meIcon(): L.DivIcon {
  return memo('me', () => L.divIcon({ html: '<span class="anwo-me"></span>', className: 'anwo-marker', iconSize: undefined, iconAnchor: [0, 0] }));
}

/** Pick the icon for a marker by kind. */
export function iconFor(kind: MapMarkerKind | undefined, state: PinState): L.DivIcon {
  switch (kind) {
    case 'stop':
      return stopIcon(state);
    case 'poi':
      return poiIcon(state);
    case 'campus':
      return campusIcon(state.label);
    default:
      return pricePinIcon({ ...state, kind: kind ?? 'listing' });
  }
}
