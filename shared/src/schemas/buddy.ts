// shared/src/schemas/buddy.ts — owned by the `buddy` module agent.
// Zod input schemas for /api/buddy (API.md §10), shared by the server routes and the web forms.
import { z } from 'zod';
import { BuddyLanguage, BuddyMemberStatus, BuddyStatus, BuddyType } from '../enums';
import { DateYmd, PaginationQuery, ScopeQuery, zBool, zCsv } from './common';

export const TimeOfDay = ['morning', 'afternoon', 'evening', 'night'] as const;
export type TimeOfDay = (typeof TimeOfDay)[number];

export const BuddySort = ['upcoming', 'recent', 'relevance', 'distance'] as const;
export type BuddySort = (typeof BuddySort)[number];

/** Hour windows (campus-local) for the time-of-day filter. */
export const TIME_OF_DAY_HOURS: Record<TimeOfDay, [number, number]> = {
  morning: [5, 12],
  afternoon: [12, 17],
  evening: [17, 21],
  night: [21, 29], // 21:00 → 05:00 next day
};

const isoDateTime = z.string().datetime({ offset: true });

export const BuddyEventInput = z.object({
  startsAt: isoDateTime,
  endsAt: isoDateTime.optional(),
  locationName: z.string().max(120).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type BuddyEventInput = z.infer<typeof BuddyEventInput>;

export const BuddyInput = z
  .object({
    type: z.enum(BuddyType),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(3000).default(''),
    campusId: z.string().max(64).optional(),
    startsAt: isoDateTime.nullable().optional(),
    endsAt: isoDateTime.nullable().optional(),
    isAllDay: z.boolean().default(false),
    locationName: z.string().trim().max(120).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    destinationName: z.string().trim().max(120).optional(),
    destLat: z.number().min(-90).max(90).optional(),
    destLng: z.number().min(-180).max(180).optional(),
    languages: z.array(z.enum(BuddyLanguage)).min(1).max(6).default(['zh', 'en']),
    maxMembers: z.number().int().min(2).max(50).default(4),
    verifiedOnly: z.boolean().default(false),
    minTrustLevel: z.number().int().min(0).max(3).default(1),
    requiresApproval: z.boolean().default(false),
    costSplitCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
    events: z.array(BuddyEventInput).max(20).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && new Date(v.endsAt).getTime() < new Date(v.startsAt).getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'endsAt must be after startsAt' });
    }
  });
export type BuddyInput = z.infer<typeof BuddyInput>;

/** PATCH body: every field optional (the server merges with the stored row). */
export const BuddyPatch = BuddyInput.innerType().partial();
export type BuddyPatch = z.infer<typeof BuddyPatch>;

export const BuddyListQuery = ScopeQuery.merge(PaginationQuery).extend({
  q: z.string().trim().max(120).optional(),
  type: zCsv.optional(),
  dateFrom: z.string().max(40).optional(),
  dateTo: z.string().max(40).optional(),
  timeOfDay: zCsv.optional(),
  language: zCsv.optional(),
  verifiedOnly: zBool.optional(),
  hasSpace: zBool.default(true),
  status: zCsv.optional(),
  upcoming: zBool.optional(),
  authorId: z.string().max(64).optional(),
  sort: z.enum(BuddySort).optional(),
});
export type BuddyListQuery = z.infer<typeof BuddyListQuery>;

export const BuddyMineQuery = PaginationQuery.extend({
  role: z.enum(['host', 'member']).optional(),
  status: zCsv.optional(),
  when: z.enum(['upcoming', 'past', 'all']).default('all'),
});
export type BuddyMineQuery = z.infer<typeof BuddyMineQuery>;

export const BuddyCalendarQuery = z.object({
  campusId: z.string().max(64).optional(),
  from: DateYmd,
  to: DateYmd,
  type: zCsv.optional(),
  mine: zBool.optional(),
});
export type BuddyCalendarQuery = z.infer<typeof BuddyCalendarQuery>;

export const BuddyJoinInput = z.object({ note: z.string().trim().max(300).optional() });
export type BuddyJoinInput = z.infer<typeof BuddyJoinInput>;

export const BuddyReasonInput = z.object({ reason: z.string().trim().max(300).optional() });
export type BuddyReasonInput = z.infer<typeof BuddyReasonInput>;

export const BuddyMembersQuery = z.object({ status: z.enum(BuddyMemberStatus).optional() });
export type BuddyMembersQuery = z.infer<typeof BuddyMembersQuery>;

export const BuddyEventsPut = z.object({ events: z.array(BuddyEventInput).max(20) });
export type BuddyEventsPut = z.infer<typeof BuddyEventsPut>;

export const BuddyModerateInput = z.object({
  moderationStatus: z.enum(['ok', 'flagged', 'hidden']),
  reason: z.string().trim().max(300).optional(),
});
export type BuddyModerateInput = z.infer<typeof BuddyModerateInput>;

export const BuddyAdminQuery = PaginationQuery.extend({
  campusId: z.string().max(64).optional(),
  status: z.enum(BuddyStatus).optional(),
  moderationStatus: z.enum(['ok', 'flagged', 'hidden']).optional(),
  q: z.string().trim().max(120).optional(),
});
export type BuddyAdminQuery = z.infer<typeof BuddyAdminQuery>;

/** Buddy types that have a fixed start time by nature (roommate search has none). */
export const TIMED_BUDDY_TYPES: readonly BuddyType[] = ['airport_pickup', 'carpool', 'study', 'gym', 'dining', 'travel', 'costco_run', 'event'];
/** Types with a destination (origin → destination). */
export const DESTINATION_BUDDY_TYPES: readonly BuddyType[] = ['airport_pickup', 'carpool', 'travel', 'costco_run'];
/** Types where a per-person cost split makes sense. */
export const COST_SPLIT_BUDDY_TYPES: readonly BuddyType[] = ['airport_pickup', 'carpool', 'travel', 'costco_run', 'dining', 'event'];
