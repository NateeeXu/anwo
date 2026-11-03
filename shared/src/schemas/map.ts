// shared/src/schemas/map.ts — owned by the `map` module agent. REST contract: docs/API.md §7.
// Query/body schemas for /api/map/* plus the DTO shapes the explore page consumes. Re-exported as `mapSchemas`.
import { z } from 'zod';
import { PoiCategory } from '../enums';
import type { Campus, ListingCard, Poi, ShuttleStop } from '../types';
import { DateYmd, zCsv, zLatLngCsv } from './common';

// ---------------------------------------------------------------- constants
export const MAP_LAYERS = ['listings', 'items', 'buddy', 'shuttle', 'pois'] as const;
export type MapLayer = (typeof MAP_LAYERS)[number];
/** Max pins returned per layer by /api/map/layers (API.md §7). */
export const LAYER_PIN_CAP = 300;
/** Max listing cards hydrated for the result drawer (nearest to the viewport centre). */
export const LAYER_CARD_CAP = 40;
/** bbox wider than this (degrees) is rejected with BAD_REQUEST. */
export const MAX_BBOX_DEG = 2;
/** Draw-radius presets in metres (DESIGN §7.9 「画圈搜索」). */
export const RADIUS_PRESETS_M = [500, 1000, 2000, 3000] as const;

const bboxString = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'minLng,minLat,maxLng,maxLat expected');
const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);

// ---------------------------------------------------------------- queries
export const GeocodeQuery = z.object({
  q: z.string().trim().min(3).max(200),
  near: zLatLngCsv.optional(),
  campusId: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(5).default(3),
});
export type GeocodeQuery = z.infer<typeof GeocodeQuery>;

export const ReverseQuery = z.object({ lat, lng });
export type ReverseQuery = z.infer<typeof ReverseQuery>;

export const CommuteQuery = z.object({ lat, lng, campusId: z.string().max(64).optional() });
export type CommuteQuery = z.infer<typeof CommuteQuery>;

export const PoisQuery = z.object({
  campusId: z.string().max(64).optional(),
  category: zCsv.pipe(z.array(z.enum(PoiCategory))).optional(),
  bbox: bboxString.optional(),
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
});
export type PoisQuery = z.infer<typeof PoisQuery>;

export const LayersQuery = z.object({
  campusId: z.string().max(64).optional(),
  bbox: bboxString,
  layers: zCsv.pipe(z.array(z.enum(MAP_LAYERS))).optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  category: z.string().max(40).optional(),
  buddyType: z.string().max(40).optional(),
  dateFrom: DateYmd.optional(),
  dateTo: DateYmd.optional(),
  /** Why the client asked (analytics only): initial | pan | search | draw | layer */
  source: z.enum(['initial', 'pan', 'search', 'draw', 'layer']).optional(),
});
export type LayersQuery = z.infer<typeof LayersQuery>;

export const CampusSuggestQuery = z.object({ lat, lng });
export type CampusSuggestQuery = z.infer<typeof CampusSuggestQuery>;

export const CampusStatsQuery = z.object({ bbox: bboxString.optional() });

export const PoiInput = z.object({
  campusId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  nameZh: z.string().trim().max(120).optional().nullable(),
  category: z.enum(PoiCategory),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  address: z.string().trim().max(200).optional().nullable(),
  url: z.string().trim().url().max(300).optional().nullable().or(z.literal('')),
  icon: z.string().trim().max(40).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
  isActive: z.boolean().default(true),
});
export type PoiInput = z.infer<typeof PoiInput>;

export const PoiUpdateInput = PoiInput.partial();
export type PoiUpdateInput = z.infer<typeof PoiUpdateInput>;

export const AdminPoisQuery = z.object({
  campusId: z.string().max(64).optional(),
  category: z.enum(PoiCategory).optional(),
  q: z.string().trim().max(80).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

export const GeocodeCacheClearInput = z.object({ olderThanDays: z.coerce.number().int().min(0).max(3650).optional() });
export type GeocodeCacheClearInput = z.infer<typeof GeocodeCacheClearInput>;

// ---------------------------------------------------------------- DTOs (server → web)
export type MapPinType = 'listing' | 'item' | 'buddy';
export type MapPin = {
  id: string;
  type: MapPinType;
  lat: number;
  lng: number;
  title: string;
  /** listing: monthly rent · item: price (0 + isFree) · buddy: cost split */
  priceCents?: number;
  isFree?: boolean;
  obo?: boolean;
  subtitle?: string | null;
  imageUrl?: string | null;
  boostTier?: 'basic' | 'plus' | 'max';
  link: string;
  campusId: string;
  /** buddy: ISO start, used for the date pill (「11/08」) */
  startsAt?: string | null;
  /** listing: fuzzed pin (hide_exact_address) · item: rounded pickup */
  approx?: boolean;
  /** listing: shuttle stop within 400 m */
  nearShuttle?: boolean;
  saved?: boolean;
};

export type LayerCounts = Record<MapLayer, number>;
export type ShuttleRouteLite = { id: string; name: string; shortName: string | null; color: string; polyline: [number, number][] };
export type LayersResponse = {
  listings: MapPin[];
  /** Full cards for the nearest LAYER_CARD_CAP listings (for the result drawer / ListingCard). */
  listingCards: ListingCard[];
  items: MapPin[];
  buddy: MapPin[];
  shuttleStops: (ShuttleStop & { routes: Pick<ShuttleRouteLite, 'id' | 'name' | 'shortName' | 'color'>[] })[];
  shuttleRoutes: ShuttleRouteLite[];
  pois: Poi[];
  counts: LayerCounts;
  /** true when a layer hit its cap (the UI nudges to zoom in) */
  truncated: Partial<Record<MapLayer, boolean>>;
  campusId: string | null;
  bbox: [number, number, number, number];
};

export type CommuteResponse = {
  distanceM: number;
  walkMin: number;
  bikeMin: number;
  shuttleMin: number | null;
  nearestStop: { id: string; name: string; nameZh: string | null; lat: number; lng: number; distanceM: number } | null;
  campus: { id: string; name: string; nameZh: string | null; shortName: string; lat: number; lng: number };
  cached: boolean;
};

export type ReverseResponse = {
  displayName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  precision: 'rooftop' | 'street' | 'city' | 'none';
  /** what the label was derived from */
  source: 'cache' | 'poi' | 'stop' | 'campus';
  nearestCampus: { id: string; shortName: string; name: string; nameZh: string | null; distanceM: number } | null;
};

export type GeocodeHit = {
  lat: number;
  lng: number;
  displayName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  precision: 'rooftop' | 'street' | 'city' | 'none';
  approx: boolean;
  campusSuggestion: { suggested: Campus | null; nearest: (Campus & { distanceM: number })[] };
};
export type GeocodeResponse = { results: GeocodeHit[]; cached: boolean; offline: boolean };

export type CampusStat = {
  id: string;
  name: string;
  nameZh: string | null;
  shortName: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  hasShuttle: boolean;
  counts: { listings: number; items: number; buddy: number; stops: number; pois: number };
  total: number;
};
export type CampusStatsResponse = { campuses: CampusStat[]; totals: CampusStat['counts'] };

export type CampusBoundsResponse = { center: { lat: number; lng: number }; bbox: [number, number, number, number]; defaultZoom: number; radiusM: number };
