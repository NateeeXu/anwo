// Buddy module — API types, query keys and hooks. REST contract: docs/API.md §10.
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { Buddy, BuddyCard, BuddyEvent, Paginated, Report, ScopeInfo, UserPublic } from '@shared/types';
import type { BuddyMemberRole, BuddyMemberStatus, BuddyStatus } from '@shared/enums';
import type { BuddyInput, BuddyPatch } from '@shared/schemas/buddy';
import { api } from '@/lib/api';
import { track } from '@/lib/track';

export type MemberPreview = Pick<UserPublic, 'id' | 'name' | 'avatarUrl' | 'trustLevel'>;
export type BuddyListItem = BuddyCard & { memberPreview?: MemberPreview[] };
export type BuddyMember = Omit<UserPublic, 'role'> & { status: BuddyMemberStatus; role: BuddyMemberRole; joinedAt: string; note?: string | null };
export type BuddyDetail = Omit<Buddy, 'members'> & {
  members: BuddyMember[];
  coverUrl: string | null;
  canSeeMembers: boolean;
  pendingCount: number;
  moderationStatus?: 'ok' | 'flagged' | 'hidden';
};
export type BuddyOccurrence = BuddyEvent & { post: BuddyCard; implicit: boolean };
export type BuddyListResponse = Paginated<BuddyListItem> & { scope: ScopeInfo };
export type BuddyMineResponse = Paginated<BuddyListItem> & { pendingRequests: number };
export type BuddyCalendarResponse = { events: BuddyOccurrence[]; campusId: string; timezone: string; from: string; to: string };
export type JoinResult = { membership: { status: BuddyMemberStatus; role: BuddyMemberRole }; conversationId: string | null };

export type BuddyListParams = {
  campusId?: string;
  type?: string[];
  dateFrom?: string;
  dateTo?: string;
  timeOfDay?: string[];
  language?: string[];
  verifiedOnly?: boolean;
  hasSpace?: boolean;
  status?: string[];
  upcoming?: boolean;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  authorId?: string;
};

export const buddyKeys = {
  all: ['buddy'] as const,
  list: (params: BuddyListParams) => ['buddy', 'list', params] as const,
  detail: (id: string) => ['buddy', 'detail', id] as const,
  members: (id: string) => ['buddy', 'members', id] as const,
  mine: (params: Record<string, unknown>) => ['buddy', 'mine', params] as const,
  calendar: (params: Record<string, unknown>) => ['buddy', 'calendar', params] as const,
};

function csv(v: string[] | undefined): string | undefined {
  return v && v.length ? v.join(',') : undefined;
}

export function useBuddyList(params: BuddyListParams, enabled = true): UseQueryResult<BuddyListResponse> {
  return useQuery({
    queryKey: buddyKeys.list(params),
    enabled,
    queryFn: () =>
      api<BuddyListResponse>('/api/buddy/posts', {
        query: {
          campusId: params.campusId, type: csv(params.type), dateFrom: params.dateFrom, dateTo: params.dateTo, timeOfDay: csv(params.timeOfDay),
          language: csv(params.language), verifiedOnly: params.verifiedOnly ? 1 : undefined, hasSpace: params.hasSpace ? 1 : 0, status: csv(params.status),
          upcoming: params.upcoming ? 1 : undefined, q: params.q || undefined, sort: params.sort, page: params.page ?? 1, pageSize: params.pageSize ?? 18, authorId: params.authorId,
        },
      }),
    placeholderData: (prev) => prev,
  });
}

/** `boost`: the sponsored boost id from the card link (`?boost=`), recorded server-side as a boost click */
export function useBuddyDetail(id: string | undefined, boost?: string | null): UseQueryResult<BuddyDetail> {
  return useQuery({
    queryKey: buddyKeys.detail(id ?? ''),
    enabled: !!id,
    queryFn: () => api<BuddyDetail>(`/api/buddy/posts/${id}`, { query: { boost: boost || undefined } }),
  });
}

export function useBuddyMembers(id: string | undefined, enabled: boolean): UseQueryResult<BuddyMember[]> {
  return useQuery({
    queryKey: buddyKeys.members(id ?? ''),
    enabled: !!id && enabled,
    queryFn: () => api<BuddyMember[]>(`/api/buddy/posts/${id}/members`),
  });
}

export function useBuddyMine(params: { when: 'upcoming' | 'past' | 'all'; role?: 'host' | 'member'; page?: number }, enabled = true): UseQueryResult<BuddyMineResponse> {
  return useQuery({
    queryKey: buddyKeys.mine(params),
    enabled,
    queryFn: () => api<BuddyMineResponse>('/api/buddy/posts/mine', { query: { when: params.when, role: params.role, page: params.page ?? 1, pageSize: 24, status: params.when === 'past' ? 'joined,pending,left' : undefined } }),
    placeholderData: (prev) => prev,
  });
}

export function useBuddyCalendar(params: { campusId: string | null; from: string; to: string; type?: string[]; mine?: boolean }): UseQueryResult<BuddyCalendarResponse> {
  return useQuery({
    queryKey: buddyKeys.calendar(params),
    enabled: !!params.campusId,
    queryFn: () => api<BuddyCalendarResponse>('/api/buddy/calendar', { query: { campusId: params.campusId ?? undefined, from: params.from, to: params.to, type: csv(params.type), mine: params.mine ? 1 : undefined } }),
    placeholderData: (prev) => prev,
  });
}

/** Mutations invalidate every buddy query; detail pages also get an optimistic refetch. */
export function useBuddyMutations(id?: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: buddyKeys.all });
  };
  const join = useMutation({
    mutationFn: (note?: string) => api<JoinResult>(`/api/buddy/posts/${id}/join`, { body: note ? { note } : {} }),
    onSuccess: (r) => {
      track('buddy.join', { entityType: 'buddy_post', entityId: id, status: r.membership.status });
      invalidate();
    },
  });
  const leave = useMutation({ mutationFn: () => api<null>(`/api/buddy/posts/${id}/leave`, { body: {} }), onSuccess: invalidate });
  const memberAction = useMutation({
    mutationFn: ({ userId, action, reason }: { userId: string; action: 'approve' | 'decline' | 'remove'; reason?: string }) =>
      api<BuddyMember>(`/api/buddy/posts/${id}/members/${userId}/${action}`, { body: reason ? { reason } : {} }),
    onSuccess: invalidate,
  });
  const status = useMutation({
    mutationFn: ({ action, reason }: { action: 'close' | 'cancel' | 'reopen' | 'complete'; reason?: string }) =>
      api<BuddyDetail>(`/api/buddy/posts/${id}/${action}`, { body: reason ? { reason } : {} }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: () => api<null>(`/api/buddy/posts/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
  const report = useMutation({
    mutationFn: (body: { reason: string; details?: string }) => api<Report>(`/api/buddy/posts/${id}/report`, { body }),
  });
  const create = useMutation({
    mutationFn: (body: BuddyInput) => api<BuddyDetail>('/api/buddy/posts', { body }),
    onSuccess: (d) => {
      track('buddy.create', { entityType: 'buddy_post', entityId: d.id, type: d.type });
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: (body: BuddyPatch) => api<BuddyDetail>(`/api/buddy/posts/${id}`, { method: 'PATCH', body }),
    onSuccess: invalidate,
  });
  return { join, leave, memberAction, status, remove, report, create, update, invalidate };
}

export type BuddyStatusT = BuddyStatus;
