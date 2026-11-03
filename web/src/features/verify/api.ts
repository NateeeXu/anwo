// verify — typed API client + React Query hooks (API.md §6).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditEntry, Paginated, PaymentMethod, Upload, UserMe, UserPublic, VerificationRequest, CampusLite } from '@shared/types';
import type { Badge, VerificationStatus, VerificationType } from '@shared/enums';
import type { IdRequestInput, PaymentMethodInput, RejectInput, AdminQueueQuery as AdminQueueQueryT } from '@shared/schemas/verify';
import { api } from '@/lib/api';
import { authStore } from '@/lib/auth';

export type NextStep = 'edu' | 'id' | 'phone' | 'payment' | null;
export type VerifyStatus = {
  trustLevel: number;
  steps: {
    edu: { done: boolean; email: string | null; at: string | null; campusId: string | null };
    id: { done: boolean; at: string | null; type: VerificationType | null; request?: VerificationRequest };
    phone: { done: boolean; phone: string | null; maskedPhone: string | null; at: string | null };
    payment: { done: boolean; at: string | null; method?: PaymentMethod; methods: PaymentMethod[] };
  };
  nextStep: NextStep;
  badges: Badge[];
  verifiedOnlyMessaging: boolean;
  openRequests: number;
};

export type TimelineEntry = {
  id: string;
  source: 'audit' | 'event';
  action: string;
  entityType: string | null;
  entityId: string | null;
  reason: string | null;
  actorRole: string | null;
  data: Record<string, unknown>;
  createdAt: string;
};

export type TrustProfile = {
  user: UserPublic;
  suspended: boolean;
  trust: {
    level: number;
    eduVerified: boolean;
    eduDomain: string | null;
    idVerified: boolean;
    idType: VerificationType | null;
    phoneVerified: boolean;
    paymentOnFile: boolean;
    memberSince: string;
    verifiedAt: { edu: string | null; id: string | null; phone: string | null; payment: string | null };
  };
  stats: { listings: number; itemsSold: number; buddyHosted: number; responseRate: number | null; responseMedianMin: number | null };
};

export type QueueItem = VerificationRequest & {
  user: UserPublic & { email: string; eduEmail: string | null; memberSince: string; priorRequests: number };
  campus: CampusLite | null;
  reviewer: UserPublic | null;
  front?: Upload;
  back?: Upload;
  selfie?: Upload;
  ageHours: number;
  overdue: boolean;
  duplicateDocument: boolean;
  internalNote: string | null;
};
export type QueueDetail = QueueItem & { history: AuditEntry[]; userRequests: VerificationRequest[] };
export type QueueStats = {
  pending: number;
  inReview: number;
  overdue: number;
  approved24h: number;
  rejected24h: number;
  oldestPendingHours: number | null;
  medianDecisionHours7d: number | null;
  slaHours: number;
  byType: Record<string, number>;
  byCampus: { campus: CampusLite | null; count: number }[];
};
export type QueueFilters = { status?: VerificationStatus[]; type?: VerificationType[]; campusId?: string; q?: string; sort?: AdminQueueQueryT['sort']; page?: number; pageSize?: number };

export const verifyKeys = {
  status: ['verify', 'status'] as const,
  requests: ['verify', 'requests'] as const,
  methods: ['verify', 'payment-methods'] as const,
  timeline: ['verify', 'timeline'] as const,
  profile: (userId: string) => ['verify', 'profile', userId] as const,
  adminStats: ['verify', 'admin', 'stats'] as const,
  adminQueue: (f: QueueFilters) => ['verify', 'admin', 'queue', f] as const,
  adminRequest: (id: string) => ['verify', 'admin', 'request', id] as const,
};

/** Refetch everything the verification center shows and refresh the session user (trust level, badges). */
export async function refreshVerifyState(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ['verify'] }),
    authStore.getState().refresh(),
  ]);
}

// ---------------------------------------------------------------- user hooks
export function useVerifyStatus(enabled = true) {
  return useQuery({ queryKey: verifyKeys.status, queryFn: () => api<VerifyStatus>('/api/verify/status'), enabled });
}
export function useMyRequests(enabled = true) {
  return useQuery({ queryKey: verifyKeys.requests, queryFn: () => api<VerificationRequest[]>('/api/verify/id'), enabled });
}
export function useTimeline(enabled = true) {
  return useQuery({ queryKey: verifyKeys.timeline, queryFn: () => api<Paginated<TimelineEntry>>('/api/verify/audit', { query: { pageSize: 50 } }), enabled });
}
export function useTrustProfile(userId: string | undefined) {
  return useQuery({ queryKey: verifyKeys.profile(userId ?? ''), queryFn: () => api<TrustProfile>(`/api/verify/profile/${userId}`), enabled: !!userId });
}

export function useSubmitId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IdRequestInput) => api<VerificationRequest>('/api/verify/id', { method: 'POST', body }),
    onSuccess: () => refreshVerifyState(qc),
  });
}
export function useCancelId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<VerificationRequest>(`/api/verify/id/${id}`, { method: 'DELETE' }),
    onSuccess: () => refreshVerifyState(qc),
  });
}
export function useRequestPhone() {
  return useMutation({ mutationFn: (phone: string) => api<{ sent: true; expiresInSec: number; devCode?: string }>('/api/verify/phone/request', { method: 'POST', body: { phone } }) });
}
export function useConfirmPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<UserMe>('/api/verify/phone/confirm', { method: 'POST', body: { code } }),
    onSuccess: (me) => {
      authStore.getState().setUser(me);
      return qc.invalidateQueries({ queryKey: ['verify'] });
    },
  });
}
export function useRequestEdu() {
  return useMutation({ mutationFn: (email: string) => api<{ sent: true; expiresInSec: number; campusId: string | null; devCode?: string }>('/api/verify/edu/request', { method: 'POST', body: { email } }) });
}
export function useConfirmEdu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; code: string }) => api<UserMe>('/api/verify/edu/confirm', { method: 'POST', body: v }),
    onSuccess: (me) => {
      authStore.getState().setUser(me);
      return qc.invalidateQueries({ queryKey: ['verify'] });
    },
  });
}
export function useAddPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PaymentMethodInput) => api<{ method: PaymentMethod; methods: PaymentMethod[]; trustLevel: number }>('/api/verify/payment-methods', { method: 'POST', body }),
    onSuccess: () => refreshVerifyState(qc),
  });
}
export function useRemovePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ removed: PaymentMethod; methods: PaymentMethod[]; trustLevel: number }>(`/api/verify/payment-methods/${id}`, { method: 'DELETE' }),
    onSuccess: () => refreshVerifyState(qc),
  });
}
export function useSetDefaultPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<PaymentMethod>(`/api/verify/payment-methods/${id}/default`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: verifyKeys.status }),
  });
}
export function useVerifiedOnlySetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (verifiedOnlyMessaging: boolean) => api<UserMe>('/api/users/me', { method: 'PATCH', body: { verifiedOnlyMessaging } }),
    onSuccess: (me) => {
      authStore.getState().setUser(me);
      return qc.invalidateQueries({ queryKey: verifyKeys.status });
    },
  });
}

// ---------------------------------------------------------------- admin hooks
export function useQueueStats() {
  return useQuery({ queryKey: verifyKeys.adminStats, queryFn: () => api<QueueStats>('/api/verify/admin/stats'), refetchInterval: 60_000 });
}
export function useQueue(filters: QueueFilters) {
  return useQuery({
    queryKey: verifyKeys.adminQueue(filters),
    queryFn: () =>
      api<Paginated<QueueItem> & { slaHours: number }>('/api/verify/admin/queue', {
        query: {
          status: filters.status?.length ? filters.status.join(',') : undefined,
          type: filters.type?.length ? filters.type.join(',') : undefined,
          campusId: filters.campusId || undefined,
          q: filters.q || undefined,
          sort: filters.sort,
          page: filters.page ?? 1,
          pageSize: filters.pageSize ?? 20,
        },
      }),
    placeholderData: (prev) => prev,
  });
}
export function useQueueRequest(id: string | null) {
  return useQuery({ queryKey: verifyKeys.adminRequest(id ?? ''), queryFn: () => api<QueueDetail>(`/api/verify/admin/requests/${id}`), enabled: !!id });
}
function useAdminAction<TVars>(fn: (v: TVars) => Promise<QueueItem>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (item) => Promise.all([qc.invalidateQueries({ queryKey: ['verify', 'admin'] }), qc.setQueryData(verifyKeys.adminRequest(item.id), (prev: QueueDetail | undefined) => (prev ? { ...prev, ...item } : prev))]),
  });
}
export function useClaim() {
  return useAdminAction((id: string) => api<QueueItem>(`/api/verify/admin/requests/${id}/claim`, { method: 'POST' }));
}
export function useApprove() {
  return useAdminAction((v: { id: string; note?: string }) => api<QueueItem>(`/api/verify/admin/requests/${v.id}/approve`, { method: 'POST', body: { note: v.note || undefined } }));
}
export function useReject() {
  return useAdminAction((v: { id: string } & RejectInput) => api<QueueItem>(`/api/verify/admin/requests/${v.id}/reject`, { method: 'POST', body: { reason: v.reason, code: v.code, note: v.note || undefined } }));
}
export function useTrustOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; trustLevel: number; reason: string }) => api<UserMe>(`/api/verify/admin/users/${v.userId}/trust`, { method: 'POST', body: { trustLevel: v.trustLevel, reason: v.reason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['verify', 'admin'] }),
  });
}

/** Admin-only, audited document URL (API: GET /api/verify/admin/requests/:id/files/:side). */
export function adminDocumentUrl(requestId: string, side: 'front' | 'back' | 'selfie'): string {
  return `/api/verify/admin/requests/${requestId}/files/${side}`;
}
