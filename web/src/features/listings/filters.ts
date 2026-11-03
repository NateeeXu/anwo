// Browse filter state ⇄ URL search params. Keys mirror the API query names (API.md §3) so a URL is a complete search.
import type { Query } from '@/lib/api';

export type ListingSort = 'recent' | 'relevance' | 'price_asc' | 'price_desc' | 'distance' | 'date';
export const SORTS: ListingSort[] = ['recent', 'price_asc', 'price_desc', 'distance', 'date'];

export type Filters = {
  q: string;
  priceMin: number | null;
  priceMax: number | null;
  bedrooms: string[];
  bathroomsMin: number | null;
  propertyType: string[];
  listingType: string[];
  furnished: string[];
  availableFrom: string | null;
  availableTo: string | null;
  minTermMax: number | null;
  genderPref: 'any' | 'female' | 'male' | null;
  petsAllowed: boolean;
  parking: boolean;
  utilitiesIncluded: boolean;
  amenities: string[];
  verifiedOnly: boolean;
  nearShuttle: boolean;
  sort: ListingSort;
  page: number;
  /** nationwide city search */
  city: string | null;
  state: string | null;
  radiusKm: number | null;
};

export const EMPTY: Filters = {
  q: '', priceMin: null, priceMax: null, bedrooms: [], bathroomsMin: null, propertyType: [], listingType: [], furnished: [],
  availableFrom: null, availableTo: null, minTermMax: null, genderPref: null, petsAllowed: false, parking: false, utilitiesIncluded: false,
  amenities: [], verifiedOnly: false, nearShuttle: false, sort: 'recent', page: 1, city: null, state: null, radiusKm: null,
};

const csv = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const num = (v: string | null) => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export function fromSearchParams(sp: URLSearchParams): Filters {
  const sort = sp.get('sort') as ListingSort | null;
  return {
    q: sp.get('q') ?? '',
    priceMin: num(sp.get('priceMin')),
    priceMax: num(sp.get('priceMax')),
    bedrooms: csv(sp.get('bedrooms')),
    bathroomsMin: num(sp.get('bathroomsMin')),
    propertyType: csv(sp.get('propertyType')),
    listingType: csv(sp.get('listingType')),
    furnished: csv(sp.get('furnished')),
    availableFrom: sp.get('availableFrom'),
    availableTo: sp.get('availableTo'),
    minTermMax: num(sp.get('minTermMax')),
    genderPref: (['any', 'female', 'male'].includes(sp.get('genderPref') ?? '') ? sp.get('genderPref') : null) as Filters['genderPref'],
    petsAllowed: sp.get('petsAllowed') === '1',
    parking: sp.get('parking') === '1',
    utilitiesIncluded: sp.get('utilitiesIncluded') === '1',
    amenities: csv(sp.get('amenities')),
    verifiedOnly: sp.get('verifiedOnly') === '1',
    nearShuttle: sp.get('nearShuttle') === '1',
    sort: sort && [...SORTS, 'relevance'].includes(sort) ? sort : 'recent',
    page: Math.max(1, num(sp.get('page')) ?? 1),
    city: sp.get('city'),
    state: sp.get('state'),
    radiusKm: num(sp.get('radiusKm')),
  };
}

/** Writes only non-default values so URLs stay short. */
export function toSearchParams(f: Filters, keep: URLSearchParams = new URLSearchParams()): URLSearchParams {
  const sp = new URLSearchParams();
  for (const [k, v] of keep) if (k === 'campus' || k === 'scope' || k === 'view') sp.set(k, v);
  const set = (k: string, v: string | number | null | undefined | false) => { if (v !== null && v !== undefined && v !== false && v !== '') sp.set(k, String(v)); };
  set('q', f.q);
  set('priceMin', f.priceMin);
  set('priceMax', f.priceMax);
  set('bedrooms', f.bedrooms.join(','));
  set('bathroomsMin', f.bathroomsMin);
  set('propertyType', f.propertyType.join(','));
  set('listingType', f.listingType.join(','));
  set('furnished', f.furnished.join(','));
  set('availableFrom', f.availableFrom);
  set('availableTo', f.availableTo);
  set('minTermMax', f.minTermMax);
  set('genderPref', f.genderPref);
  set('petsAllowed', f.petsAllowed && '1');
  set('parking', f.parking && '1');
  set('utilitiesIncluded', f.utilitiesIncluded && '1');
  set('amenities', f.amenities.join(','));
  set('verifiedOnly', f.verifiedOnly && '1');
  set('nearShuttle', f.nearShuttle && '1');
  set('sort', f.sort !== 'recent' ? f.sort : null);
  set('page', f.page > 1 ? f.page : null);
  set('city', f.city);
  set('state', f.state);
  set('radiusKm', f.radiusKm);
  return sp;
}

/** API query (without scope); `page` omitted for pins/stats callers that pass their own. */
export function toQuery(f: Filters): Query {
  const out: Query = {};
  if (f.q) out.q = f.q;
  if (f.priceMin !== null) out.priceMin = f.priceMin;
  if (f.priceMax !== null) out.priceMax = f.priceMax;
  if (f.bedrooms.length) out.bedrooms = f.bedrooms.join(',');
  if (f.bathroomsMin !== null) out.bathroomsMin = f.bathroomsMin;
  if (f.propertyType.length) out.propertyType = f.propertyType.join(',');
  if (f.listingType.length) out.listingType = f.listingType.join(',');
  if (f.furnished.length) out.furnished = f.furnished.join(',');
  if (f.availableFrom) out.availableFrom = f.availableFrom;
  if (f.availableTo) out.availableTo = f.availableTo;
  if (f.minTermMax !== null) out.minTermMax = f.minTermMax;
  if (f.genderPref) out.genderPref = f.genderPref;
  if (f.petsAllowed) out.petsAllowed = 1;
  if (f.parking) out.parking = 1;
  if (f.utilitiesIncluded) out.utilitiesIncluded = 1;
  if (f.amenities.length) out.amenities = f.amenities.join(',');
  if (f.verifiedOnly) out.verifiedOnly = 1;
  if (f.nearShuttle) out.nearShuttle = 1;
  if (f.sort !== 'recent') out.sort = f.sort;
  if (f.city && f.state) { out.city = f.city; out.state = f.state; }
  if (f.radiusKm !== null) out.radiusKm = f.radiusKm;
  return out;
}

/** Number of non-default filter groups (for the 「更多筛选」 count and the reset button). */
export function activeCount(f: Filters): number {
  let n = 0;
  if (f.priceMin !== null || f.priceMax !== null) n++;
  if (f.bedrooms.length) n++;
  if (f.bathroomsMin !== null) n++;
  if (f.propertyType.length) n++;
  if (f.listingType.length) n++;
  if (f.furnished.length) n++;
  if (f.availableFrom || f.availableTo) n++;
  if (f.minTermMax !== null) n++;
  if (f.genderPref) n++;
  if (f.petsAllowed) n++;
  if (f.parking) n++;
  if (f.utilitiesIncluded) n++;
  if (f.amenities.length) n++;
  if (f.verifiedOnly) n++;
  if (f.nearShuttle) n++;
  return n;
}
export function moreCount(f: Filters): number {
  let n = 0;
  if (f.bathroomsMin !== null) n++;
  if (f.propertyType.length) n++;
  if (f.listingType.length) n++;
  if (f.minTermMax !== null) n++;
  if (f.genderPref) n++;
  if (f.parking) n++;
  if (f.utilitiesIncluded) n++;
  if (f.amenities.length) n++;
  if (f.verifiedOnly) n++;
  return n;
}

export function isPristine(f: Filters): boolean {
  return activeCount(f) === 0 && !f.q && !f.city;
}

/** Date presets relative to today (DESIGN §7.4 整个暑假 / 秋季学期). */
export function datePresets(now = new Date()): { key: string; start: string; end: string }[] {
  const y = now.getFullYear();
  const summerYear = now.getMonth() >= 7 ? y + 1 : y; // after August → next summer
  const fallYear = now.getMonth() >= 8 ? y + 1 : y;
  return [
    { key: 'summer', start: `${summerYear}-06-15`, end: `${summerYear}-08-31` },
    { key: 'fall', start: `${fallYear}-09-01`, end: `${fallYear}-12-15` },
    { key: 'winter', start: `${y}-12-10`, end: `${y + 1}-01-05` },
    { key: 'spring', start: `${y + 1}-01-05`, end: `${y + 1}-06-10` },
  ];
}
