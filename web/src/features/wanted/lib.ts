// Small shared helpers for the wanted feature (labels, score colours, URL state).
import type { Area, Match } from '@shared/types';
import type { AreaInput } from '@shared/schemas/wanted';
import type { TFunction } from '@/lib/i18n';

export const BREAKDOWN_MAX: Record<string, number> = { price: 30, dates: 25, location: 20, mustHaves: 15, fit: 10, trust: 5 };
export const BREAKDOWN_ORDER = ['price', 'dates', 'location', 'mustHaves', 'fit', 'trust'] as const;

export function scoreTone(score: number): 'strong' | 'good' | 'weak' {
  return score >= 80 ? 'strong' : score >= 60 ? 'good' : 'weak';
}

export function areaToInput(a: Area): AreaInput | null {
  if (a.kind === 'circle' && a.lat != null && a.lng != null) return { kind: 'circle', label: a.label, lat: a.lat, lng: a.lng, radiusM: a.radiusM ?? 1500 };
  if (a.kind === 'city' && a.city && a.state) return { kind: 'city', label: a.label, city: a.city, state: a.state };
  if (a.kind === 'campus' && a.campusId) return { kind: 'campus', label: a.label, campusId: a.campusId };
  return null;
}

export function areaKey(a: AreaInput | Area): string {
  if (a.kind === 'circle') return `c:${(a.lat ?? 0).toFixed(4)},${(a.lng ?? 0).toFixed(4)}`;
  if (a.kind === 'city') return `city:${(a.city ?? '').toLowerCase()},${(a.state ?? '').toLowerCase()}`;
  return `campus:${a.campusId ?? ''}`;
}

export function matchStatusKey(m: Pick<Match, 'status' | 'offeredByHost'>): string {
  if (m.status === 'offered' || (m.offeredByHost && m.status !== 'contacted')) return 'wanted.match.status.offered';
  return `wanted.match.status.${m.status}`;
}

export function groupLabel(t: TFunction, n: number): string {
  return n === 1 ? t('wanted.group.one') : t('wanted.group.n', { n });
}

export function bedroomsLabel(t: TFunction, n: number): string {
  if (n <= 0) return t('wanted.bedrooms.any');
  return t('wanted.bedrooms.min', { n: Number.isInteger(n) ? n : n.toFixed(1) });
}

export function pct(score: number): string {
  return `${Math.round(score)}%`;
}

/** Monthly budget presets for the filter / form sliders (cents). */
export const BUDGET_BOUNDS: [number, number] = [0, 600_000];
export const BUDGET_STEP = 5_000;

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
] as const;
