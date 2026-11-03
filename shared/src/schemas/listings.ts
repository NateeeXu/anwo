// shared/src/schemas/listings.ts — owned by the `listings` module agent.
// Zod input schemas for /api/listings (API.md §3). Used by the server (parseBody/parseQuery) and by the web wizard.
import { z } from 'zod';
import { Amenity, AvailabilityStatus, Furnished, GenderPref, GeocodePrecision, LeadStatus, LeaseType, ListingStatus, ListingType, Parking, PropertyType } from '../enums';
import { DateYmd, PaginationQuery, ScopeQuery, zBool, zCsv } from './common';

export const LISTING_SORTS = ['recent', 'relevance', 'price_asc', 'price_desc', 'distance', 'date', 'hot'] as const;
export type ListingSort = (typeof LISTING_SORTS)[number];

export const BEDROOM_FILTERS = ['0', '1', '2', '3', '4+'] as const;

export const AMENITY_KEYS = Amenity;

/** GET /api/listings query (ScopeQuery + filters + sort + view). */
export const ListingListQuery = ScopeQuery.merge(PaginationQuery).extend({
  q: z.string().trim().max(80).optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  bedrooms: zCsv.optional(),
  bathroomsMin: z.coerce.number().min(0).max(10).optional(),
  propertyType: zCsv.optional(),
  listingType: zCsv.optional(),
  furnished: zCsv.optional(),
  availableFrom: DateYmd.optional(),
  availableTo: DateYmd.optional(),
  minTermMax: z.coerce.number().int().min(1).max(24).optional(),
  genderPref: z.enum(GenderPref).optional(),
  petsAllowed: zBool.optional(),
  parking: zBool.optional(),
  utilitiesIncluded: zBool.optional(),
  amenities: zCsv.optional(),
  verifiedOnly: zBool.optional(),
  nearShuttle: zBool.optional(),
  ownerRole: z.enum(['student', 'landlord']).optional(),
  ownerId: z.string().max(64).optional(),
  sort: z.enum(LISTING_SORTS).optional(),
  view: z.enum(['list', 'pins']).default('list'),
});
export type ListingListQuery = z.infer<typeof ListingListQuery>;

export const AddressInput = z.object({
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(60).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/).optional(),
});
export type AddressInput = z.infer<typeof AddressInput>;

export const PhotoInput = z.object({ uploadId: z.string().min(1).max(64), caption: z.string().trim().max(120).optional() });

/** POST /api/listings body (API.md §3). */
export const ListingInput = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().max(5000).default(''),
  listingType: z.enum(ListingType).default('sublet'),
  propertyType: z.enum(PropertyType).default('apartment'),
  campusId: z.string().max(64).optional(),
  address: AddressInput,
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  geocodePrecision: z.enum(GeocodePrecision).optional(),
  hideExactAddress: z.boolean().default(true),
  neighborhood: z.string().trim().max(60).optional(),
  priceCents: z.number().int().min(0).max(5_000_000),
  depositCents: z.number().int().min(0).max(10_000_000).default(0),
  utilitiesIncluded: z.boolean().default(false),
  utilitiesNote: z.string().trim().max(200).optional(),
  utilitiesEstCents: z.number().int().min(0).max(1_000_000).optional(),
  bedrooms: z.number().min(0).max(10),
  bathrooms: z.number().min(0.5).max(10),
  sqft: z.number().int().positive().max(20_000).optional(),
  furnished: z.enum(Furnished).default('none'),
  availableFrom: DateYmd,
  availableTo: DateYmd.nullable().optional(),
  minTermMonths: z.number().int().min(1).max(24).default(1),
  flexibleDates: z.boolean().default(false),
  leaseType: z.enum(LeaseType).default('sublease'),
  roommatesCount: z.number().int().min(0).max(10).default(0),
  genderPref: z.enum(GenderPref).default('any'),
  petsAllowed: z.boolean().default(false),
  parking: z.enum(Parking).default('none'),
  smokingAllowed: z.boolean().default(false),
  amenities: z.array(z.enum(Amenity)).max(40).optional(),
  photos: z.array(PhotoInput).max(20).optional(),
});
export type ListingInput = z.infer<typeof ListingInput>;

/** PATCH /api/listings/:id body. */
export const ListingUpdateInput = ListingInput.partial();
export type ListingUpdateInput = z.infer<typeof ListingUpdateInput>;

export const PhotosInput = z.object({ photos: z.array(PhotoInput).min(1).max(20) });
export const AmenitiesInput = z.object({ amenities: z.array(z.enum(Amenity)).max(40) });
export const AvailabilityRangeInput = z.object({
  startDate: DateYmd,
  endDate: DateYmd,
  status: z.enum(AvailabilityStatus),
  note: z.string().trim().max(200).optional(),
});
export const AvailabilityInput = z.object({ ranges: z.array(AvailabilityRangeInput).max(60) });
export type AvailabilityInput = z.infer<typeof AvailabilityInput>;

export const ContactInput = z.object({ message: z.string().trim().max(1000).optional() });
export const RentedInput = z.object({ closeBundle: z.boolean().optional() });
export const LeadStatusInput = z.object({ status: z.enum(LeadStatus) });
export const LeadsQuery = PaginationQuery.extend({ status: z.enum(LeadStatus).optional() });
export const MineQuery = PaginationQuery.extend({ status: zCsv.optional() });
export const StatsQuery = z.object({ days: z.coerce.number().refine((n) => [7, 30, 90].includes(n), '7, 30 or 90').default(30) });
export const SimilarQuery = z.object({ limit: z.coerce.number().int().min(1).max(6).default(6) });
export const CampusStatsQuery = z.object({ campusId: z.string().max(64).optional(), scope: z.enum(['campus', 'nationwide']).optional(), city: z.string().max(80).optional(), state: z.string().length(2).optional() });
export const GeocodeQuery = z.object({ q: z.string().trim().min(3).max(200), campusId: z.string().max(64).optional(), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() });
export const SuggestCampusQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

export const LISTING_STATUSES = ListingStatus;
