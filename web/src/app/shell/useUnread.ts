// Unread counters for the bell and the 消息 tab: REST query + WS refresh + 30 s polling fallback.
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { getWs } from '../../lib/ws';

export type UnreadCounts = { notifications: number; messages: number };
export const UNREAD_KEY = ['notifications', 'unread-count'] as const;

export function useUnread(): UnreadCounts {
  const { status } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => api<UnreadCounts>('/api/notifications/unread-count'),
    enabled: status === 'authed',
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  useEffect(() => {
    if (status !== 'authed') return;
    const ws = getWs();
    const refresh = () => {
      qc.invalidateQueries({ queryKey: UNREAD_KEY });
      qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
    };
    const offs = [
      ws.on('notification', refresh),
      ws.on('notification.count', refresh),
      ws.on('chat.conversation', refresh),
      ws.on('ready', refresh),
    ];
    return () => offs.forEach((off) => off());
  }, [status, qc]);
  return q.data ?? { notifications: 0, messages: 0 };
}
