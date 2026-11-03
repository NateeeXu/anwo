// shared/src/schemas/wanted.ts — owned by the `wanted` module agent.
// Zod input schemas for /api/wanted (API.md §4). Used by the server routes and by the web post form.
import { z } from 'zod';
import { GenderPref, PropertyType } from '../enums';
import { DateYmd, PaginationQuery, ScopeQuery, zBool, zCsv } from './common';

export const AreaInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('circle'),
    label: z.string().trim().min(1).max(60),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    radiusM: z.number().int().min(200).max(30000),
  }),
  z.object({
    kind: z.literal('city'),
    label: z.string().trim().min(1).max(60),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().length(2).transform((s) => s.toUpperCase()),
  }),
  z.object({
    kind: z.literal('campus'),
    label: z.string().trim().min(1).max(60),
    campusId: z.string().min(1).max(64),
  }),
]);
export type AreaInput = z.infer<typeof AreaInput>;

export const FurnishedPref = ['any', 'partial', 'full'] as const;
export type FurnishedPref = (typeof FurnishedPref)[number];

/** Base object (no refinement) so PATCH can use `.partial()`. */
export const WantedInputBase = z.object({
  title: z.string().trim().min(4).max(120),
  description: z.string().trim().max(3000).default(''),
  campusId: z.string().min(1).max(64).optional(),
  scope: z.enum(['campus', 'nationwide']).default('campus'),
  budgetMinCents: z.number().int().min(0).max(5_000_000).default(0),
  budgetMaxCents: z.number().int().min(1).max(5_000_000),
  moveInFrom: DateYmd,
  moveInTo: DateYmd,
  moveOutDate: DateYmd.nullable().optional(),
  flexibleDays: z.number().int().min(0).max(60).default(0),
  groupSize: z.number().int().min(1).max(10).default(1),
  bedroomsMin: z.number().min(0).max(10).default(0),
  furnishedPref: z.enum(FurnishedPref).default('any'),
  genderPref: z.enum(GenderPref).default('any'),
  hasPets: z.boolean().default(false),
  needsParking: z.boolean().default(false),
  propertyTypes: z.array(z.enum(PropertyType)).max(6).default([]),
  mustHaves: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  niceToHaves: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  areas: z.array(AreaInput).max(5).default([]),
});

const refineDates = (w: { budgetMaxCents?: number; budgetMinCents?: number; moveInFrom?: string; moveInTo?: string; moveOutDate?: string | null }, ctx: z.RefinementCtx) => {
  if (w.budgetMaxCents !== undefined && w.budgetMinCents !== undefined && w.budgetMaxCents < w.budgetMinCents)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['budgetMaxCents'], message: 'budgetMaxCents must be >= budgetMinCents' });
  if (w.moveInFrom && w.moveInTo && w.moveInTo < w.moveInFrom)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['moveInTo'], message: 'moveInTo must be >= moveInFrom' });
  if (w.moveOutDate && w.moveInFrom && w.moveOutDate <= w.moveInFrom)
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['moveOutDate'], message: 'moveOutDate must be after moveInFrom' });
};

export const WantedInput = WantedInputBase.superRefine(refineDates);
export type WantedInput = z.infer<typeof WantedInput>;

export const WantedPatchInput = WantedInputBase.partial().superRefine(refineDates);
export type WantedPatchInput = z.infer<typeof WantedPatchInput>;

export const WantedSort = ['recent', 'budget_desc', 'budget_asc', 'move_in', 'relevance'] as const;
export type WantedSort = (typeof WantedSort)[number];

export const WantedListQuery = ScopeQuery.merge(PaginationQuery).extend({
  q: z.string().trim().max(80).optional(),
  budgetMin: z.coerce.number().int().min(0).optional(),
  budgetMax: z.coerce.number().int().min(0).optional(),
  moveInFrom: DateYmd.optional(),
  moveInTo: DateYmd.optional(),
  groupSize: z.coerce.number().int().min(1).max(10).optional(),
  groupSizeMin: z.coerce.number().int().min(1).max(10).optional(),
  bedroomsMin: z.coerce.number().min(0).max(10).optional(),
  furnishedPref: z.enum(FurnishedPref).optional(),
  genderPref: z.enum(GenderPref).optional(),
  hasPets: zBool.optional(),
  authorId: z.string().max(128).optional(),
  sort: z.enum(WantedSort).default('recent'),
});
export type WantedListQuery = z.infer<typeof WantedListQuery>;

export const MineQuery = PaginationQuery.extend({
  status: zCsv.optional(),
});

export const MatchesQuery = PaginationQuery.extend({
  minScore: z.coerce.number().int().min(0).max(100).default(50),
  status: zCsv.optional(),
});
export type MatchesQuery = z.infer<typeof MatchesQuery>;

export const ForMeQuery = z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) });

export const AreasInput = z.object({ areas: z.array(AreaInput).max(5) });
export type AreasInput = z.infer<typeof AreasInput>;

export const OfferInput = z.object({
  listingId: z.string().min(1).max(128),
  message: z.string().trim().max(1000).optional(),
});
export type OfferInput = z.infer<typeof OfferInput>;

export const ContactInput = z.object({ message: z.string().trim().max(1000).optional() });
export type ContactInput = z.infer<typeof ContactInput>;

/** Must-have keys the post form offers (amenity keys + the three mapped listing columns). */
export const MUST_HAVE_KEYS = [
  'furnished', 'utilities_included', 'parking', 'laundry_in_unit', 'laundry_in_building', 'wifi', 'ac', 'heating', 'dishwasher', 'gym', 'elevator',
  'doorman', 'balcony', 'private_bath', 'desk', 'bike_storage', 'kitchen', 'near_grocery', 'security', 'accessible',
] as const;
export type MustHaveKey = (typeof MUST_HAVE_KEYS)[number];
