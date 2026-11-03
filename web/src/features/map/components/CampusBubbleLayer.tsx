// Nationwide mode: one bubble per campus with its post count (react-leaflet child of MapView).
// Bubble size scales with sqrt(count); empty campuses render as dashed `sunken` circles so the country still reads.
import { useMemo } from 'react';
import L from 'leaflet';
import { Marker } from 'react-leaflet';
import type { CampusStat } from '@shared/schemas/map';

export type CampusBubbleLayerProps = {
  campuses: CampusStat[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect: (campus: CampusStat) => void;
  onHover?: (id: string | null) => void;
  /** Label under each bubble (short name by default). */
  labelOf?: (c: CampusStat) => string;
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cache = new Map<string, L.DivIcon>();

function bubbleIcon(count: number, label: string, selected: boolean, hovered: boolean): L.DivIcon {
  // empty campuses: a 12 px dashed dot without a label (hover/focus title names it) so the country still reads
  // without 50 overlapping "0" bubbles; the label returns when the campus is selected or hovered.
  const size = count === 0 ? 12 : Math.round(Math.min(64, 34 + Math.sqrt(count) * 3.2));
  const showLabel = count > 0 || selected || hovered;
  const key = `${size}|${count}|${label}|${selected ? 1 : 0}${hovered ? 1 : 0}`;
  let icon = cache.get(key);
  if (!icon) {
    icon = L.divIcon({
      html:
        `<span class="anwo-bubble" data-selected="${selected}" data-hovered="${hovered}" data-empty="${count === 0}" style="--bubble-size:${size}px">` +
        `<span class="anwo-bubble__count">${count === 0 ? '' : count > 999 ? '999+' : count}</span>` +
        (showLabel ? `<span class="anwo-bubble__label">${escapeHtml(label)}</span>` : '') + `</span>`,
      className: 'anwo-marker',
      iconSize: undefined,
      iconAnchor: [0, 0],
    });
    cache.set(key, icon);
  }
  return icon;
}

export function CampusBubbleLayer({ campuses, selectedId, hoveredId, onSelect, onHover, labelOf }: CampusBubbleLayerProps) {
  const sorted = useMemo(() => [...campuses].sort((a, b) => a.total - b.total), [campuses]); // big ones on top
  return (
    <>
      {sorted.map((c) => (
        <Marker
          key={c.id}
          position={[c.lat, c.lng]}
          icon={bubbleIcon(c.total, labelOf ? labelOf(c) : c.shortName, c.id === selectedId, c.id === hoveredId)}
          zIndexOffset={c.id === selectedId ? 1000 : c.total ? Math.min(900, 100 + c.total) : 0}
          keyboard
          title={`${c.name} · ${c.total}`}
          alt={c.name}
          eventHandlers={{ click: () => onSelect(c), mouseover: () => onHover?.(c.id), mouseout: () => onHover?.(null) }}
        />
      ))}
    </>
  );
}

export default CampusBubbleLayer;
