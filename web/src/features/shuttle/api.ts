// shuttle — typed API client + React Query hooks (API.md §8).
import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import type { ServiceDay } from '@shared/enums';
import type { CampusLite, Paginated, ShuttleAlert, ShuttleDeparture, ShuttleRoute, ShuttleStop } from '@shared/types';
import type { AlertCreateInput, AlertPatchInput, ImportInput, RequestInput } from '@shared/schemas/shuttle';
import { api } from '@/lib/api';
import { track } from '@/lib/track';

export type RouteSummary = Pick<ShuttleRoute, 'id' | 'name' | 'shortName' | 'color'>;
export type RouteListItem = Omit<ShuttleRoute, 'stops'> & { stopCount: number; stopIds: string[]; favorited?: boolean };
export type StopItem = ShuttleStop & { routes: RouteSummary[]; favorited?: boolean };
export type RouteStop = ShuttleRoute['stops'][number] & { favorited?: boolean };
export type CampusPublic = {
  id: string; name: string; nameZh: string | null; shortName: string; city: string; state: string; lat: number; lng: number; timezone: string;
  hasShuttle: boolean; shuttleOfficialUrl: string | null; shuttleTrackerUrl: string | null;
};
export type CampusShuttle = {
  campus: CampusPublic;
  routes: RouteListItem[];
  stops: StopItem[];
  alerts: ShuttleAlert[];
  serviceDayToday: ServiceDay;
  nowLocal: string;
  today: string;
  hasData: boolean;
  request?: { status: string };
};
export type RouteDetail = Omit<ShuttleRoute, 'stops'> & {
  stops: RouteStop[];
  favorited: boolean;
  alerts: ShuttleAlert[];
  campus: CampusPublic;
  serviceDayToday: ServiceDay;
  nowLocal: string;
  today: string;
  runsToday: boolean;
};
export type TimetableKind = 'timetable' | 'headway' | 'none';
export type Timetable = {
  route: RouteSummary;
  serviceDay: ServiceDay;
  date: string;
  kind: TimetableKind;
  stops: (ShuttleStop & { sequence: number; minutesFromStart: number })[];
  trips: { tripIndex: number; departures: { stopId: string; time: string }[] }[];
  nowLocal: string;
  isToday: boolean;
};
export type NextDepartures = {
  stop: StopItem;
  serviceDay: ServiceDay;
  nowLocal: string;
  at: string;
  departures: ShuttleDeparture[];
  alerts: ShuttleAlert[];
};
export type NearbyStop = StopItem & { distanceM: number; walkMin: number };
export type Favorites = { stops: StopItem[]; routes: RouteListItem[] };
export type AdminAlert = ShuttleAlert & { route: RouteSummary | null; campus: CampusLite | null; live: boolean; createdAt: string; updatedAt: string };
export type AdminRequest = {
  id: string; campus: CampusLite | null; campusName: string; campusHasData: boolean; userId: string | null; userName: string | null;
  email: string | null; officialUrl: string | null; note: string | null; status: 'open' | 'planned' | 'done' | 'rejected'; createdAt: string;
};
export type ImportResult = { campusId: string; routes: number; stops: number; scheduleRows: number; routeIds: string[]; closedRequests: number };

export const shuttleKeys = {
  all: ['shuttle'] as const,
  campus: (campusId: string | null) => ['shuttle', 'campus', campusId] as const,
  route: (id: string) => ['shuttle', 'route', id] as const,
  timetable: (id: string, serviceDay?: string, date?: string) => ['shuttle', 'timetable', id, serviceDay ?? 'today', date ?? ''] as const,
  next: (stopId: string) => ['shuttle', 'next', stopId] as const,
  nearby: (campusId: string, lat: number, lng: number) => ['shuttle', 'nearby', campusId, lat, lng] as const,
  favorites: ['shuttle', 'favorites'] as const,
  adminAlerts: (p: Record<string, unknown>) => ['shuttle', 'admin', 'alerts', p] as const,
  adminRequests: (p: Record<string, unknown>) => ['shuttle', 'admin', 'requests', p] as const,
  adminRoutes: (campusId: string) => ['shuttle', 'admin', 'routes', campusId] as const,
};

export function useCampusShuttle(campusId: string | null | undefined) {
  return useQuery({
    queryKey: shuttleKeys.campus(campusId ?? null),
    queryFn: () => api<CampusShuttle>(`/api/shuttle/campus/${encodeURIComponent(campusId!)}`),
    enabled: Boolean(campusId),
    staleTime: 60_000,
  });
}

export function useRoute(id: string | undefined) {
  return useQuery({
    queryKey: shuttleKeys.route(id ?? ''),
    queryFn: () => api<RouteDetail>(`/api/shuttle/routes/${encodeURIComponent(id!)}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

export function useTimetable(id: string | undefined, serviceDay?: ServiceDay, date?: string) {
  return useQuery({
    queryKey: shuttleKeys.timetable(id ?? '', serviceDay, date),
    queryFn: () => api<Timetable>(`/api/shuttle/routes/${encodeURIComponent(id!)}/timetable`, { query: { serviceDay, date } }),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}

/** Next departures at a stop — refetched every 30 s while mounted (DESIGN §7.10 countdown). */
export function useNextDepartures(stopId: string | null | undefined, opts: { limit?: number; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: shuttleKeys.next(stopId ?? ''),
    queryFn: () => api<NextDepartures>(`/api/shuttle/stops/${encodeURIComponent(stopId!)}/next`, { query: { limit: opts.limit ?? 5 } }),
    enabled: Boolean(stopId) && (opts.enabled ?? true),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });
}

export function useNearbyStops(p: { campusId: string | null | undefined; lat: number | null | undefined; lng: number | null | undefined; radiusM?: number; limit?: number }, options: Partial<Pick<UseQueryOptions<{ stops: NearbyStop[] }>, 'enabled'>> = {}) {
  const ready = Boolean(p.campusId) && typeof p.lat === 'number' && typeof p.lng === 'number';
  return useQuery({
    queryKey: shuttleKeys.nearby(p.campusId ?? '', Number(p.lat?.toFixed(4)), Number(p.lng?.toFixed(4))),
    queryFn: () => api<{ stops: NearbyStop[] }>('/api/shuttle/nearby', { query: { campusId: p.campusId!, lat: p.lat!, lng: p.lng!, radiusM: p.radiusM ?? 800, limit: p.limit ?? 3 } }),
    enabled: ready && (options.enabled ?? true),
    staleTime: 10 * 60_000,
  });
}

export function useFavorites(enabled: boolean) {
  return useQuery({
    queryKey: shuttleKeys.favorites,
    queryFn: () => api<Favorites>('/api/shuttle/favorites'),
    enabled,
    staleTime: 30_000,
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { entityType: 'stop' | 'route'; id: string; favorited: boolean }) => {
      const r = await api<{ favorited: boolean }>(`/api/shuttle/favorites/${v.entityType}/${encodeURIComponent(v.id)}`, { method: v.favorited ? 'DELETE' : 'PUT' });
      track(v.favorited ? 'shuttle.unfavorite' : 'shuttle.favorite', { entityType: `shuttle_${v.entityType}`, entityId: v.id });
      return r;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: shuttleKeys.all });
    },
  });
}

export function useRequestCampus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestInput) => api<{ id: string; status: string; duplicate?: boolean }>('/api/shuttle/requests', { body: input }),
    onSuccess: (_d, v) => {
      track('shuttle.request', { entityType: 'campus', entityId: v.campusId });
      void qc.invalidateQueries({ queryKey: shuttleKeys.campus(v.campusId) });
    },
  });
}

// ---------------------------------------------------------------- admin
export type AdminAlertsParams = { campusId?: string; page?: number; pageSize?: number; includeInactive?: boolean };
export function useAdminAlerts(p: AdminAlertsParams) {
  return useQuery({
    queryKey: shuttleKeys.adminAlerts(p),
    queryFn: () => api<Paginated<AdminAlert>>('/api/shuttle/admin/alerts', { query: { ...p } }),
    staleTime: 10_000,
  });
}
export function useAdminRoutes(campusId: string | null | undefined) {
  return useQuery({
    queryKey: shuttleKeys.adminRoutes(campusId ?? ''),
    queryFn: () => api<RouteListItem[]>('/api/shuttle/routes', { query: { campusId: campusId!, activeOnly: false } }),
    enabled: Boolean(campusId),
    staleTime: 60_000,
  });
}
function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: shuttleKeys.all });
  };
}
export function useCreateAlert() {
  const inv = useInvalidateAdmin();
  return useMutation({ mutationFn: (input: AlertCreateInput) => api<AdminAlert & { notified: number }>('/api/shuttle/admin/alerts', { body: input }), onSuccess: inv });
}
export function usePatchAlert() {
  const inv = useInvalidateAdmin();
  return useMutation({ mutationFn: (v: { id: string; patch: AlertPatchInput }) => api<ShuttleAlert>(`/api/shuttle/admin/alerts/${v.id}`, { method: 'PATCH', body: v.patch }), onSuccess: inv });
}
export function useDeleteAlert() {
  const inv = useInvalidateAdmin();
  return useMutation({ mutationFn: (id: string) => api<null>(`/api/shuttle/admin/alerts/${id}`, { method: 'DELETE' }), onSuccess: inv });
}
export type AdminRequestsParams = { status?: string; campusId?: string; page?: number; pageSize?: number };
export function useAdminRequests(p: AdminRequestsParams) {
  return useQuery({
    queryKey: shuttleKeys.adminRequests(p),
    queryFn: () => api<Paginated<AdminRequest> & { counts: Record<string, number> }>('/api/shuttle/admin/requests', { query: { ...p } }),
    staleTime: 10_000,
  });
}
export function usePatchRequest() {
  const inv = useInvalidateAdmin();
  return useMutation({ mutationFn: (v: { id: string; status: AdminRequest['status'] }) => api<AdminRequest>(`/api/shuttle/admin/requests/${v.id}`, { method: 'PATCH', body: { status: v.status } }), onSuccess: inv });
}
export function useImportRoutes() {
  const inv = useInvalidateAdmin();
  return useMutation({ mutationFn: (input: ImportInput) => api<ImportResult>('/api/shuttle/admin/import', { body: input }), onSuccess: inv });
}
export function exportRoutes(campusId: string) {
  return api<{ campusId: string; routes: unknown[] }>(`/api/shuttle/admin/export/${encodeURIComponent(campusId)}`);
}
