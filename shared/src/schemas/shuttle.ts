// shared/src/schemas/shuttle.ts — owned by the `shuttle` module agent.
// Zod input schemas for API.md §8 (`/api/shuttle`). Re-exported from shared/src/index.ts as `shuttleSchemas`.
import { z } from 'zod';
import { AlertSeverity, FavoriteEntityType, ServiceDay, ShuttleRequestStatus } from '../enums';
import { DateYmd, PaginationQuery, zBool, zLatLngCsv } from './common';

export const HHMM = z.string().regex(/^(?:[01]\d|2[0-9]):[0-5]\d$/, 'HH:MM expected (00:00–29:59)');
export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '#RRGGBB expected');
export const WeekDayKey = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'holiday']);
export type WeekDayKey = z.infer<typeof WeekDayKey>;

export const CampusIdQuery = z.object({ campusId: z.string().min(1).max(64) });

export const RoutesQuery = CampusIdQuery.extend({ activeOnly: zBool.default(true) });
export type RoutesQuery = z.infer<typeof RoutesQuery>;

export const TimetableQuery = z.object({
  serviceDay: z.enum(ServiceDay).optional(),
  date: DateYmd.optional(),
});
export type TimetableQuery = z.infer<typeof TimetableQuery>;

export const StopsQuery = CampusIdQuery.extend({
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(),
  near: zLatLngCsv.optional(),
  radiusM: z.coerce.number().int().min(50).max(3000).default(800),
});
export type StopsQuery = z.infer<typeof StopsQuery>;

export const NextQuery = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5),
  at: z.string().datetime({ offset: true }).optional(),
});
export type NextQuery = z.infer<typeof NextQuery>;

export const NearbyQuery = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  campusId: z.string().min(1).max(64),
  radiusM: z.coerce.number().int().min(50).max(1500).default(800),
  limit: z.coerce.number().int().min(1).max(5).default(3),
});
export type NearbyQuery = z.infer<typeof NearbyQuery>;

export const AlertsQuery = CampusIdQuery.extend({ includeInactive: zBool.default(false) });
export type AlertsQuery = z.infer<typeof AlertsQuery>;

export const FavoriteParams = z.object({ entityType: z.enum(FavoriteEntityType), id: z.string().min(1).max(128) });
export type FavoriteParams = z.infer<typeof FavoriteParams>;

export const RequestInput = z.object({
  campusId: z.string().min(1).max(64),
  email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('')),
  officialUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
  note: z.string().trim().max(500).optional(),
});
export type RequestInput = z.infer<typeof RequestInput>;

// ---------------------------------------------------------------- admin
export const AdminAlertsQuery = PaginationQuery.extend({
  campusId: z.string().max(64).optional(),
  includeInactive: zBool.default(true),
});
export type AdminAlertsQuery = z.infer<typeof AdminAlertsQuery>;

const isoOrNull = z.string().datetime({ offset: true }).nullable();

export const AlertCreateInput = z.object({
  campusId: z.string().min(1).max(64),
  routeId: z.string().max(128).nullable().optional(),
  severity: z.enum(AlertSeverity).default('info'),
  title: z.string().trim().min(2).max(140),
  titleZh: z.string().trim().max(140).nullable().optional(),
  body: z.string().trim().max(1000).nullable().optional(),
  bodyZh: z.string().trim().max(1000).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: isoOrNull.optional(),
});
export type AlertCreateInput = z.infer<typeof AlertCreateInput>;

export const AlertPatchInput = AlertCreateInput.omit({ campusId: true }).partial().extend({ isActive: z.boolean().optional() });
export type AlertPatchInput = z.infer<typeof AlertPatchInput>;

export const AdminRequestsQuery = PaginationQuery.extend({
  status: z.enum(ShuttleRequestStatus).optional(),
  campusId: z.string().max(64).optional(),
});
export type AdminRequestsQuery = z.infer<typeof AdminRequestsQuery>;

export const RequestPatchInput = z.object({ status: z.enum(ShuttleRequestStatus) });
export type RequestPatchInput = z.infer<typeof RequestPatchInput>;

/** One stop inside an import payload. `key` lets several routes share one stop; otherwise stops dedupe by name. */
export const ImportStop = z.object({
  key: z.string().max(64).optional(),
  name: z.string().trim().min(1).max(120),
  nameZh: z.string().trim().max(120).nullable().optional(),
  code: z.string().trim().max(16).nullable().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(200).nullable().optional(),
  minutesFromStart: z.number().int().min(0).max(600).default(0),
});
export type ImportStop = z.infer<typeof ImportStop>;

/** Timetable block: departures from the first stop; every later stop adds its `minutesFromStart`. */
export const ImportTimetable = z.object({
  serviceDay: z.enum(ServiceDay),
  departures: z.array(HHMM).min(1).max(400),
  validFrom: DateYmd.nullable().optional(),
  validTo: DateYmd.nullable().optional(),
});
export type ImportTimetable = z.infer<typeof ImportTimetable>;

export const ImportRoute = z.object({
  name: z.string().trim().min(1).max(120),
  shortName: z.string().trim().max(24).nullable().optional(),
  color: HexColor.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  polyline: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).max(2000).optional(),
  serviceDays: z.array(WeekDayKey).min(1).optional(),
  firstDeparture: HHMM.nullable().optional(),
  lastDeparture: HHMM.nullable().optional(),
  headwayMin: z.number().int().min(1).max(240).nullable().optional(),
  officialUrl: z.string().trim().url().max(500).nullable().optional(),
  isApproximate: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().optional(),
  stops: z.array(ImportStop).min(2).max(80),
  timetable: z.array(ImportTimetable).max(8).optional(),
});
export type ImportRoute = z.infer<typeof ImportRoute>;

/** `POST /api/shuttle/admin/import` — add a campus's shuttle system from plain JSON. */
export const ImportInput = z.object({
  campusId: z.string().min(1).max(64),
  /** `true` deletes the campus's existing routes/stops/schedule first (alerts, favorites and requests are kept). */
  replace: z.boolean().default(false),
  routes: z.array(ImportRoute).min(1).max(40),
});
export type ImportInput = z.infer<typeof ImportInput>;
