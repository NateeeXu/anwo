// Admin data layer — React Query hooks over /api/admin (API.md §12). Query keys: ['admin', resource, params].
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AnalyticsEvent, AuditEntry, CampusLite, Paginated, UserPublic } from '@shared/types';
import type {
  AdminCampusRequest, AdminCampusRow, AdminFlag, AdminNavCounts, AdminReport, AdminReportDetail, AdminUserDetail, AdminUserRow, Kpis,
  ModeratedEntityType, ModerationRow, Overview, SystemHealth,
} from '@shared/schemas/admin';
import { api } from '@/lib/api';

export type Query = Record<string, string | number | boolean | null | undefined>;
const clean = (q: Query) => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export function useOverview(campusId: string | null) {
  return useQuery({ queryKey: ['admin', 'overview', campusId], queryFn: () => api<Overview>('/api/admin/overview', { query: clean({ campusId }) }), refetchInterval: 60_000 });
}
export function useKpis(q: { from: string; to: string; campusId: string | null; groupBy?: 'day' | 'week' }) {
  return useQuery({ queryKey: ['admin', 'kpis', q], queryFn: () => api<Kpis>('/api/admin/kpis', { query: clean(q) }), placeholderData: keepPreviousData });
}
export function useNavCounts() {
  return useQuery({ queryKey: ['admin', 'nav-counts'], queryFn: () => api<AdminNavCounts>('/api/admin/nav-counts'), refetchInterval: 60_000 });
}

export function useAdminUsers(q: Query) {
  return useQuery({ queryKey: ['admin', 'users', q], queryFn: () => api<Paginated<AdminUserRow>>('/api/admin/users', { query: clean(q) }), placeholderData: keepPreviousData });
}
export function useAdminUser(id: string | null) {
  return useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api<AdminUserDetail>(`/api/admin/users/${id}`), enabled: !!id });
}

export type ReportsPage = Paginated<AdminReport> & { byStatus: Record<string, number> };
export function useAdminReports(q: Query) {
  return useQuery({ queryKey: ['admin', 'reports', q], queryFn: () => api<ReportsPage>('/api/admin/reports', { query: clean(q) }), placeholderData: keepPreviousData });
}
export function useAdminReport(id: string | null) {
  return useQuery({ queryKey: ['admin', 'report', id], queryFn: () => api<AdminReportDetail>(`/api/admin/reports/${id}`), enabled: !!id });
}

export type ModerationPage = Paginated<ModerationRow> & { moderationCounts: Record<string, number> };
export function useModeration(type: ModeratedEntityType, q: Query) {
  return useQuery({
    queryKey: ['admin', 'moderation', type, q],
    queryFn: () => api<ModerationPage>(type === 'listing' ? '/api/admin/listings' : `/api/admin/moderation/${type}`, { query: clean(q) }),
    placeholderData: keepPreviousData,
  });
}

export function useFlags() {
  return useQuery({ queryKey: ['admin', 'flags'], queryFn: () => api<AdminFlag[]>('/api/admin/flags') });
}

export type AuditPage = Paginated<AuditEntry> & { actions: { action: string; n: number }[] };
export function useAudit(q: Query) {
  return useQuery({ queryKey: ['admin', 'audit', q], queryFn: () => api<AuditPage>('/api/admin/audit', { query: clean(q) }), placeholderData: keepPreviousData });
}
export type EventRowDto = AnalyticsEvent & { user: UserPublic | null; campus: CampusLite | null };
export type EventsPage = Paginated<EventRowDto> & { from: string; to: string; types: { type: string; n: number }[] };
export function useEvents(q: Query) {
  return useQuery({ queryKey: ['admin', 'events', q], queryFn: () => api<EventsPage>('/api/admin/events', { query: clean(q) }), placeholderData: keepPreviousData });
}

export type CampusesPage = Paginated<AdminCampusRow> & { counts: { all: number; active: number } };
export function useAdminCampuses(q: Query) {
  return useQuery({ queryKey: ['admin', 'campuses', q], queryFn: () => api<CampusesPage>('/api/admin/campuses', { query: clean(q) }), placeholderData: keepPreviousData });
}
export type CampusRequestsPage = Paginated<AdminCampusRequest> & { counts: Record<string, number> };
export function useCampusRequests(q: Query) {
  return useQuery({ queryKey: ['admin', 'campus-requests', q], queryFn: () => api<CampusRequestsPage>('/api/admin/campus-requests', { query: clean(q) }), placeholderData: keepPreviousData });
}

export function useHealth() {
  return useQuery({ queryKey: ['admin', 'health'], queryFn: () => api<SystemHealth>('/api/admin/health'), refetchInterval: 30_000 });
}

/** Generic admin write that invalidates every ['admin', …] query on success. */
export function useAdminMutation<TBody, TRes = unknown>(fn: (body: TBody) => Promise<TRes>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}

export const adminApi = {
  patchUser: (id: string, body: Record<string, unknown>) => api<AdminUserRow>(`/api/admin/users/${id}`, { method: 'PATCH', body }),
  bulkUsers: (body: { ids: string[]; action: 'ban' | 'unban'; reason: string }) => api<{ succeeded: number }>('/api/admin/users/bulk', { method: 'POST', body }),
  trustOverride: (id: string, body: { trustLevel: number; reason: string }) => api(`/api/verify/admin/users/${id}/trust`, { method: 'POST', body }),
  impersonate: (id: string) => api(`/api/admin/users/${id}/impersonate`, { method: 'POST' }),
  patchReport: (id: string, body: Record<string, unknown>) => api<AdminReportDetail>(`/api/admin/reports/${id}`, { method: 'PATCH', body }),
  bulkReports: (body: { ids: string[]; status: 'in_review' | 'dismissed'; reason: string }) => api<{ updated: number }>('/api/admin/reports/bulk', { method: 'POST', body }),
  moderate: (type: ModeratedEntityType, id: string, body: { moderationStatus: string; reason: string; note?: string }) =>
    api<ModerationRow>(type === 'listing' ? `/api/admin/listings/${id}/moderation` : `/api/admin/moderation/${type}/${id}`, { method: 'PATCH', body }),
  moderateBulk: (type: ModeratedEntityType, body: { ids: string[]; moderationStatus: string; reason: string }) =>
    api<{ updated: number }>(`/api/admin/moderation/${type}/bulk`, { method: 'POST', body }),
  putFlag: (key: string, body: Record<string, unknown>) => api<AdminFlag>(`/api/admin/flags/${encodeURIComponent(key)}`, { method: 'PUT', body }),
  createFlag: (body: Record<string, unknown>) => api<AdminFlag>('/api/admin/flags', { method: 'POST', body }),
  deleteFlag: (key: string, reason: string) => api(`/api/admin/flags/${encodeURIComponent(key)}`, { method: 'DELETE', query: { reason } }),
  patchCampus: (id: string, body: Record<string, unknown>) => api(`/api/admin/campuses/${id}`, { method: 'PATCH', body }),
  patchCampusRequest: (id: string, body: { status: string; note?: string }) => api(`/api/admin/campus-requests/${id}`, { method: 'PATCH', body }),
};

export function exportUrl(table: string, q: Query = {}): string {
  const qs = new URLSearchParams(clean(q) as Record<string, string>).toString();
  return `/api/admin/export/${table}.csv${qs ? `?${qs}` : ''}`;
}
