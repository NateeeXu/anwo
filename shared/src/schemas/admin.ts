// shared/src/schemas/admin.ts — owned by the `admin` module agent.
// Zod input schemas + response DTO types for /api/admin (API.md §12), shared by the server routes and the web admin shell.
import { z } from 'zod';
import { CampusRequestStatus, ModerationStatus, ReportEntityType, ReportReason, ReportStatus, Role } from '../enums';
import type { AnalyticsEvent, AuditEntry, Campus, CampusLite, FeatureFlag, Report, UserPublic } from '../types';
import { DateYmd, PaginationQuery, zBool } from './common';

// ------------------------------------------------------------------ shared query pieces
/** Date range + campus filter used by every KPI endpoint. Dates are inclusive UTC days. */
export const RangeQuery = z.object({
  from: DateYmd.optional(),
  to: DateYmd.optional(),
  campusId: z.string().max(64).optional(),
});
export type RangeQuery = z.infer<typeof RangeQuery>;

export const KpiQuery = RangeQuery.extend({ groupBy: z.enum(['day', 'week']).default('day') });
export type KpiQuery = z.infer<typeof KpiQuery>;

export const OverviewQuery = z.object({ campusId: z.string().max(64).optional() });

/** Free-text reason required on every destructive admin write. */
export const AdminReason = z.string().trim().min(3, 'Reason must be at least 3 characters').max(500);

// ------------------------------------------------------------------ users
export const AdminUserSort = ['recent', 'active', 'name'] as const;
export const AdminUsersQuery = PaginationQuery.extend({
  q: z.string().trim().max(120).optional(),
  role: z.enum(Role).optional(),
  trustLevel: z.coerce.number().int().min(0).max(3).optional(),
  campusId: z.string().max(64).optional(),
  banned: zBool.optional(),
  sort: z.enum(AdminUserSort).default('recent'),
});
export type AdminUsersQuery = z.infer<typeof AdminUsersQuery>;

export const AdminUserPatch = z
  .object({
    role: z.enum(Role).optional(),
    banned: z.boolean().optional(),
    bannedReason: z.string().trim().max(500).optional(),
    campusId: z.string().max(64).nullable().optional(),
    listingQuota: z.coerce.number().int().min(0).max(100).optional(),
    reason: AdminReason,
  })
  .refine((v) => v.role !== undefined || v.banned !== undefined || v.campusId !== undefined || v.listingQuota !== undefined, {
    message: 'Nothing to change',
    path: ['role'],
  });
export type AdminUserPatch = z.infer<typeof AdminUserPatch>;

export const AdminUsersBulk = z.object({
  ids: z.array(z.string().min(1).max(128)).min(1).max(100),
  action: z.enum(['ban', 'unban']),
  reason: AdminReason,
});
export type AdminUsersBulk = z.infer<typeof AdminUsersBulk>;

// ------------------------------------------------------------------ reports
export const ReportActionType = ['hide', 'remove', 'ban_user', 'warn_user', 'lock_conversation', 'delete_message', 'none'] as const;
export type ReportActionType = (typeof ReportActionType)[number];

export const AdminReportsQuery = PaginationQuery.extend({
  status: z.enum(['open', 'in_review', 'actioned', 'dismissed', 'pending', 'all']).default('pending'),
  entityType: z.enum(ReportEntityType).optional(),
  reason: z.enum(ReportReason).optional(),
  campusId: z.string().max(64).optional(),
  sort: z.enum(['oldest', 'newest', 'count']).default('oldest'),
});
export type AdminReportsQuery = z.infer<typeof AdminReportsQuery>;
export const REPORT_STATUSES = ReportStatus;

export const AdminReportPatch = z.object({
  status: z.enum(['in_review', 'actioned', 'dismissed']),
  resolution: z.string().trim().max(1000).optional(),
  action: z.object({ type: z.enum(ReportActionType), reason: AdminReason }).optional(),
});
export type AdminReportPatch = z.infer<typeof AdminReportPatch>;

export const AdminReportsBulk = z.object({
  ids: z.array(z.string().min(1).max(128)).min(1).max(100),
  status: z.enum(['in_review', 'dismissed']),
  reason: AdminReason,
});
export type AdminReportsBulk = z.infer<typeof AdminReportsBulk>;

// ------------------------------------------------------------------ moderation (listings + generic)
export const ModeratedEntityType = ['listing', 'wanted', 'market_item', 'buddy_post'] as const;
export type ModeratedEntityType = (typeof ModeratedEntityType)[number];

export const AdminModerationQuery = PaginationQuery.extend({
  q: z.string().trim().max(120).optional(),
  status: z.string().max(20).optional(),
  moderationStatus: z.enum(ModerationStatus).optional(),
  campusId: z.string().max(64).optional(),
  ownerId: z.string().max(128).optional(),
  flaggedOnly: zBool.optional(),
  sort: z.enum(['recent', 'reports', 'views', 'price']).default('recent'),
});
export type AdminModerationQuery = z.infer<typeof AdminModerationQuery>;

export const ModerationInput = z.object({
  moderationStatus: z.enum(ModerationStatus),
  note: z.string().trim().max(500).optional(),
  reason: AdminReason,
});
export type ModerationInput = z.infer<typeof ModerationInput>;

export const ModerationBulk = ModerationInput.extend({ ids: z.array(z.string().min(1).max(128)).min(1).max(100) });
export type ModerationBulk = z.infer<typeof ModerationBulk>;

// ------------------------------------------------------------------ flags
export const FlagKey = z.string().trim().regex(/^[a-z][a-z0-9_.]{2,63}$/, 'lowercase letters, digits, dots and underscores');
export const FlagPut = z.object({
  enabled: z.boolean(),
  value: z.unknown().optional(),
  description: z.string().trim().max(300).optional(),
  campusIds: z.array(z.string().max(64)).max(100).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type FlagPut = z.infer<typeof FlagPut>;
export const FlagCreate = FlagPut.extend({ key: FlagKey });
export type FlagCreate = z.infer<typeof FlagCreate>;
/** Flags that cannot be switched off (requirements §5): only their value may be edited. */
export const LOCKED_ON_FLAGS: readonly string[] = ['scam_banner.enabled'];

// ------------------------------------------------------------------ audit / events
export const AdminAuditQuery = PaginationQuery.extend({
  action: z.string().max(60).optional(),
  actorId: z.string().max(128).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(128).optional(),
  q: z.string().trim().max(120).optional(),
  from: DateYmd.optional(),
  to: DateYmd.optional(),
});
export type AdminAuditQuery = z.infer<typeof AdminAuditQuery>;

export const AdminEventsQuery = PaginationQuery.extend({
  type: z.string().max(60).optional(),
  userId: z.string().max(128).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(128).optional(),
  campusId: z.string().max(64).optional(),
  from: DateYmd.optional(),
  to: DateYmd.optional(),
});
export type AdminEventsQuery = z.infer<typeof AdminEventsQuery>;

// ------------------------------------------------------------------ campuses
export const AdminCampusesQuery = PaginationQuery.extend({
  q: z.string().trim().max(120).optional(),
  active: z.enum(['all', 'active', 'inactive']).default('all'),
  sort: z.enum(['order', 'name', 'users', 'listings']).default('order'),
});
export type AdminCampusesQuery = z.infer<typeof AdminCampusesQuery>;

export const AdminCampusPatch = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  nameZh: z.string().trim().max(60).nullable().optional(),
  shortName: z.string().trim().min(2).max(24).optional(),
  eduDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'domain expected')).max(10).optional(),
  hasShuttle: z.boolean().optional(),
  shuttleOfficialUrl: z.string().trim().url().max(300).nullable().optional(),
  defaultRadiusM: z.coerce.number().int().min(500).max(30000).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
  reason: z.string().trim().max(500).optional(),
});
export type AdminCampusPatch = z.infer<typeof AdminCampusPatch>;

export const CampusRequestsQuery = PaginationQuery.extend({ status: z.enum(['open', 'added', 'rejected', 'all']).default('open') });
export const CampusRequestPatch = z.object({ status: z.enum(CampusRequestStatus), note: z.string().trim().max(500).optional() });
export type CampusRequestPatch = z.infer<typeof CampusRequestPatch>;

export const EXPORT_TABLES = ['events', 'orders', 'payments', 'partner_clicks', 'listings', 'users', 'reports', 'audit_log'] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

// ================================================================== response DTOs
export type KpiKey = 'dau' | 'signups' | 'listingsPublished' | 'matches' | 'messages' | 'revenueCents' | 'openReports' | 'pendingVerifications' | 'disputedEscrows';

export type SlaItem = {
  key: 'verifications' | 'reports' | 'disputes' | 'campusRequests';
  count: number;
  oldestAt: string | null;
  oldestHours: number | null;
  targetHours: number;
  status: 'ok' | 'warn' | 'breach';
};

export type Overview = {
  date: string;
  campusId: string | null;
  today: Record<KpiKey, number>;
  deltas7d: Record<KpiKey, number | null>;
  spark30: { date: string; dau: number; listingsPublished: number; revenueCents: number; signups: number }[];
  sla: SlaItem[];
  revenueAtRiskCents: number;
};

export type KpiPoint = {
  date: string;
  dau: number;
  wau: number;
  visitors: number;
  signups: number;
  listingsActive: number;
  listingsPublished: number;
  wantedActive: number;
  matches: number;
  itemsActive: number;
  buddyOpen: number;
  conversations: number;
  messages: number;
  gmvCents: number;
  revenueCents: number;
  boostCents: number;
  proCents: number;
  escrowFeeCents: number;
  affiliateCents: number;
  affiliateClicks: number;
};

export type FunnelStep = { key: string; count: number };
export type CampusKpiRow = {
  campus: CampusLite;
  mau: number;
  signups: number;
  listingsActive: number;
  itemsActive: number;
  buddyOpen: number;
  revenueCents: number;
  revenuePerMauCents: number;
  affiliateClicks: number;
};

export type Kpis = {
  from: string;
  to: string;
  campusId: string | null;
  groupBy: 'day' | 'week';
  series: KpiPoint[];
  totals: {
    mau: number;
    signups: number;
    listingsPublished: number;
    matches: number;
    messages: number;
    gmvCents: number;
    revenueCents: number;
    takeRate: number | null;
    affiliateClicks: number;
    byStream: { boost: number; pro: number; escrowFee: number; affiliate: number };
    statusCounts: {
      listings: Record<string, number>;
      wanted: Record<string, number>;
      items: Record<string, number>;
      buddy: Record<string, number>;
    };
  };
  funnels: {
    listing: FunnelStep[];
    checkout: FunnelStep[];
    verification: FunnelStep[];
  };
  byCampus: CampusKpiRow[];
  topPartners: { partnerId: string; name: string; nameZh: string | null; clicks: number; conversions: number; estCents: number }[];
};

export type AdminUserRow = UserPublic & {
  email: string;
  phone: string | null;
  locale: string;
  banned: boolean;
  bannedReason: string | null;
  bannedAt: string | null;
  listingQuota: number;
  walletBalanceCents: number;
  lastActiveAt: string | null;
  createdAt: string;
  counts: { listings: number; items: number; buddy: number; reports: number; orders: number };
};

export type AdminUserDetail = AdminUserRow & {
  eduEmail: string | null;
  emailVerifiedAt: string | null;
  idVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  paymentVerifiedAt: string | null;
  wechatId: string | null;
  campus: Campus | null;
  recentEvents: AnalyticsEvent[];
  reportsAgainst: AdminReport[];
  reportsFiled: number;
  audit: AuditEntry[];
  orders: { id: string; kind: string; status: string; totalCents: number; createdAt: string }[];
  verifications: { id: string; type: string; status: string; createdAt: string; reviewedAt: string | null }[];
};

export type EntitySummary = {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  link: string | null;
  status: string | null;
  moderationStatus: string | null;
  owner: UserPublic | null;
  campus: CampusLite | null;
  createdAt: string | null;
  body?: string | null;
  missing?: boolean;
};

export type AdminReport = Report & {
  entity: EntitySummary | null;
  reporter?: UserPublic;
  reviewer?: UserPublic | null;
  reportCountForEntity: number;
  campus: CampusLite | null;
  ageHours: number;
};

export type AdminReportDetail = AdminReport & {
  related: AdminReport[];
  history: AuditEntry[];
  messages?: { id: string; senderName: string | null; body: string | null; createdAt: string; deletedAt: string | null }[];
};

export type ModerationRow = {
  id: string;
  entityType: ModeratedEntityType;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  link: string;
  status: string;
  moderationStatus: 'ok' | 'flagged' | 'hidden';
  moderationNote: string | null;
  priceCents: number | null;
  viewCount: number;
  reportCount: number;
  openReports: number;
  campus: CampusLite | null;
  owner: (UserPublic & { email: string }) | null;
  createdAt: string;
  boosted: boolean;
};

export type AdminFlag = FeatureFlag & { updatedByUser: UserPublic | null; locked: boolean };

export type AdminCampusRow = Campus & {
  shuttleOfficialUrl: string | null;
  stats: { users: number; listingsActive: number; itemsActive: number; buddyOpen: number; wantedActive: number; mau: number; openReports: number };
};

export type AdminCampusRequest = {
  id: string;
  userId: string | null;
  user: UserPublic | null;
  schoolName: string;
  city: string | null;
  state: string | null;
  email: string | null;
  note: string | null;
  status: 'open' | 'added' | 'rejected';
  createdAt: string;
  similarCount: number;
};

export type AdminNavCounts = {
  pendingVerifications: number;
  openReports: number;
  flaggedListings: number;
  flaggedOther: number;
  openCampusRequests: number;
  disputedEscrows: number;
  /** map module: POI suggestions awaiting review */
  pendingPoiSuggestions: number;
  /** shuttle module: open 「request my campus」 shuttle requests */
  openShuttleRequests: number;
};

export type SystemHealth = {
  status: 'ok' | 'degraded';
  version: string;
  env: string;
  node: string;
  uptimeSec: number;
  startedAt: string;
  serverTime: string;
  clockOffsetSec: number;
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  db: { path: string; sizeBytes: number; walBytes: number; migrations: string[]; integrity: string; latencyMs: number };
  tables: { name: string; rows: number }[];
  ws: { clients: number; onlineUsers: number };
  jobs: { name: string; everyMs: number; lastRunAt: string | null; lastError: string | null; runs: number }[];
  traffic: { eventsLastHour: number; eventsLast24h: number; lastEventAt: string | null; notificationsLast24h: number; auditLast24h: number };
  checks: { key: string; ok: boolean; detail: string }[];
};
