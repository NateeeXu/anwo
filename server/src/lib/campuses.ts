// Campus cache + DTO mapping. The DB `campuses` table is the runtime source of truth (admin may edit);
// shared/src/campuses.ts is the seed source. `syncCampuses()` upserts the seed list (idempotent).
import { CAMPUSES } from '@shared/campuses';
import type { Campus, CampusLite } from '@shared/types';
import { q, parseJson } from '../db';
import type { CampusRow } from './types';
import { nowIso } from './time';

let byId: Map<string, Campus> | null = null;
let bySlug: Map<string, Campus> | null = null;
let loadedAt = 0;
const TTL = 60_000;

export function toCampusDto(r: CampusRow): Campus {
  return {
    id: r.id,
    name: r.name,
    nameZh: r.name_zh,
    shortName: r.short_name,
    slug: r.slug,
    city: r.city,
    state: r.state,
    lat: r.lat,
    lng: r.lng,
    timezone: r.timezone,
    eduDomains: parseJson<string[]>(r.edu_domains_json, []),
    hasShuttle: r.has_shuttle === 1,
    shuttleTrackerUrl: r.shuttle_official_url,
    defaultRadiusM: r.default_radius_m,
    intlStudents: r.intl_students,
    sortOrder: r.sort_order,
    isActive: r.is_active === 1,
  };
}

function load(force = false): void {
  if (!force && byId && Date.now() - loadedAt < TTL) return;
  const rows = q.all<CampusRow>('SELECT * FROM campuses ORDER BY sort_order, intl_students DESC');
  byId = new Map();
  bySlug = new Map();
  for (const r of rows) {
    const c = toCampusDto(r);
    byId.set(c.id, c);
    bySlug.set(c.slug, c);
  }
  loadedAt = Date.now();
}
export function invalidateCampuses(): void {
  byId = null;
  bySlug = null;
}

export function allCampuses(opts: { activeOnly?: boolean } = {}): Campus[] {
  load();
  const list = [...byId!.values()];
  return opts.activeOnly === false ? list : list.filter((c) => c.isActive !== false);
}
export function getCampus(idOrSlug: string | null | undefined): Campus | null {
  if (!idOrSlug) return null;
  load();
  return byId!.get(idOrSlug) ?? bySlug!.get(idOrSlug) ?? null;
}
export function requireCampus(idOrSlug: string): Campus {
  const c = getCampus(idOrSlug);
  if (!c) throw new Error(`unknown campus ${idOrSlug}`);
  return c;
}
export function toCampusLite(idOrCampus: string | Campus | null | undefined): CampusLite | null {
  const c = typeof idOrCampus === 'string' ? getCampus(idOrCampus) : idOrCampus;
  if (!c) return null;
  return { id: c.id, shortName: c.shortName, city: c.city, state: c.state };
}
/** Campus whose edu domain matches the email domain (suffix match; longest domain wins). */
export function campusForEmailDb(email: string): Campus | null {
  const domain = email.toLowerCase().split('@')[1] ?? '';
  if (!domain) return null;
  let best: Campus | null = null;
  let bestLen = 0;
  for (const c of allCampuses({ activeOnly: false })) {
    for (const d of c.eduDomains) {
      const dd = d.toLowerCase();
      if ((domain === dd || domain.endsWith('.' + dd)) && dd.length > bestLen) {
        best = c;
        bestLen = dd.length;
      }
    }
  }
  return best;
}
export function campusesInCity(city: string, state: string): Campus[] {
  const c = city.toLowerCase();
  const s = state.toUpperCase();
  return allCampuses().filter((x) => x.city.toLowerCase() === c && x.state.toUpperCase() === s);
}

/** Upserts every campus from shared/src/campuses.ts. Keeps admin-edited fields when `overwrite` is false. */
export function syncCampuses(opts: { overwrite?: boolean } = {}): number {
  let n = 0;
  q.tx(() => {
    for (const c of CAMPUSES) {
      const exists = q.get('SELECT id FROM campuses WHERE id = ?', [c.id]);
      if (exists && !opts.overwrite) continue;
      q.run(
        `INSERT INTO campuses (id, name, name_zh, short_name, slug, city, state, country, lat, lng, timezone, edu_domains_json,
           has_shuttle, shuttle_official_url, default_radius_m, intl_students, is_active, sort_order, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, name_zh=excluded.name_zh, short_name=excluded.short_name,
           slug=excluded.slug, city=excluded.city, state=excluded.state, lat=excluded.lat, lng=excluded.lng,
           timezone=excluded.timezone, edu_domains_json=excluded.edu_domains_json, has_shuttle=excluded.has_shuttle,
           shuttle_official_url=excluded.shuttle_official_url, default_radius_m=excluded.default_radius_m,
           intl_students=excluded.intl_students, sort_order=excluded.sort_order, updated_at=excluded.updated_at`,
        [
          c.id, c.name, c.nameZh, c.shortName, c.slug, c.city, c.state, c.lat, c.lng, c.timezone,
          JSON.stringify(c.eduDomains), c.hasShuttle ? 1 : 0, c.shuttleTrackerUrl ?? null, c.defaultRadiusM,
          c.intlStudents ?? null, c.sortOrder ?? 0, nowIso(),
        ],
      );
      n++;
    }
  });
  invalidateCampuses();
  return n;
}
/** Boot guard: make sure the campuses table is populated even before `npm run seed`. */
export function ensureCampuses(): void {
  if (q.count('SELECT COUNT(*) FROM campuses') === 0) syncCampuses();
}
