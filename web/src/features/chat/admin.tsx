// Admin panel for "chat" (/admin/chat): stats, searchable conversation table, lock / unlock with reason, message peek.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, LockOpen, MessageSquareText, Search } from 'lucide-react';
import type { Message, Paginated } from '@shared/types';
import type { ConversationDto } from '@shared/schemas/chat';
import { Avatar, AvatarStack, Badge, Button, Input, Modal, Pagination, StatTile, Table, Tabs, Textarea, EmptyState } from '@/components';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { errorMessage } from '@/app/errors';
import { systemText } from './utils';

type AdminRow = Pick<ConversationDto, 'id' | 'kind' | 'title' | 'campusId' | 'context' | 'members' | 'lastMessage' | 'lastMessageAt' | 'isLocked' | 'createdAt' | 'messageCount' | 'memberCount'> & { reportCount: number };
type Stats = { conversations: number; groups: number; messages7d: number; locked: number; openReports: number; blocks: number };
type Filter = 'all' | 'locked' | 'reported';

export default function ChatAdminPanel() {
  const t = useT();
  const { formatRelative } = useLocale();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const dq = useDebounce(q.trim(), 300);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [lockTarget, setLockTarget] = useState<AdminRow | null>(null);
  const [reason, setReason] = useState('');
  const [peek, setPeek] = useState<AdminRow | null>(null);

  const stats = useQuery({ queryKey: ['chat', 'admin', 'stats'], queryFn: () => api<Stats>('/api/chat/admin/stats'), staleTime: 30_000 });
  const list = useQuery({
    queryKey: ['chat', 'admin', 'conversations', { q: dq, filter, page }],
    queryFn: () => api<Paginated<AdminRow>>('/api/chat/admin/conversations', { query: { q: dq || undefined, locked: filter === 'locked' ? 1 : undefined, page, pageSize: 20 } }),
    placeholderData: (prev) => prev,
  });
  const messages = useQuery({
    queryKey: ['chat', 'admin', 'messages', peek?.id],
    queryFn: () => api<{ items: Message[] }>(`/api/chat/admin/conversations/${peek!.id}/messages`),
    enabled: !!peek,
  });
  const lock = useMutation({
    mutationFn: (input: { id: string; locked: boolean; reason?: string }) => api(`/api/chat/admin/conversations/${input.id}/lock`, { method: 'POST', body: { locked: input.locked, reason: input.reason } }),
    onSuccess: (_r, input) => {
      toast.success(t(input.locked ? 'chat.admin.locked' : 'chat.admin.unlocked'));
      qc.invalidateQueries({ queryKey: ['chat', 'admin'] });
      setLockTarget(null);
      setReason('');
    },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  const rows = (list.data?.items ?? []).filter((r) => (filter === 'reported' ? r.reportCount > 0 : true));
  const statItems: { key: keyof Stats; label: string }[] = [
    { key: 'conversations', label: t('chat.admin.stat.conversations') },
    { key: 'groups', label: t('chat.admin.stat.groups') },
    { key: 'messages7d', label: t('chat.admin.stat.messages7d') },
    { key: 'openReports', label: t('chat.admin.stat.openReports') },
    { key: 'locked', label: t('chat.admin.stat.locked') },
    { key: 'blocks', label: t('chat.admin.stat.blocks') },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-h2 text-ink">{t('chat.admin.title')}</h2>
        <p className="text-small text-ink-2">{t('chat.admin.subtitle')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {statItems.map((s) => (
          <StatTile key={s.key} label={s.label} value={stats.data?.[s.key] ?? 0} format="number" />
        ))}
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          variant="pill"
          items={[
            { key: 'all', label: t('chat.admin.filter.all') },
            { key: 'locked', label: t('chat.admin.filter.locked'), count: stats.data?.locked },
            { key: 'reported', label: t('chat.admin.filter.reported'), count: stats.data?.openReports },
          ]}
          value={filter}
          onChange={(k) => { setFilter(k as Filter); setPage(1); }}
          label={t('chat.admin.title')}
        />
        <Input size="sm" type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} iconLeft={<Search />} placeholder={t('chat.admin.search')} aria-label={t('chat.admin.search')} clearable className="md:w-80" />
      </div>
      <Table<AdminRow>
        rows={rows}
        rowKey="id"
        loading={list.isPending}
        empty={<EmptyState size="sm" icon={MessageSquareText} title={t('chat.admin.empty')} />}
        columns={[
          {
            key: 'thread', header: t('chat.admin.col.thread'),
            render: (r) => (
              <div className="min-w-0">
                <p className="truncate text-small font-medium text-ink">{r.kind === 'direct' ? r.members.map((m) => m.name).join(' · ') : r.title ?? t('chat.group')}</p>
                <p className="truncate text-caption text-ink-3">{r.context ? `${t(`chat.context.${r.context.type}`)} · ${r.context.title}` : r.kind}</p>
              </div>
            ),
          },
          { key: 'members', header: t('chat.admin.col.members'), width: 120, render: (r) => <AvatarStack users={r.members} max={3} size="xs" />, hideOnMobile: true },
          {
            key: 'last', header: t('chat.admin.col.last'),
            render: (r) => (
              <div className="min-w-0">
                <p className="line-clamp-1 text-small text-ink-2">{r.lastMessage ? (r.lastMessage.kind === 'system' ? systemText(r.lastMessage, { members: r.members, peer: null }, t) : r.lastMessage.body ?? `[${r.lastMessage.kind}]`) : '—'}</p>
                <p className="text-caption text-ink-3">{r.lastMessageAt ? formatRelative(r.lastMessageAt) : ''} · {r.messageCount}</p>
              </div>
            ),
            hideOnMobile: true,
          },
          { key: 'reports', header: t('chat.admin.col.reports'), width: 90, align: 'right', render: (r) => (r.reportCount ? <Badge variant="danger" size="sm">{r.reportCount}</Badge> : <span className="text-ink-3">0</span>) },
          { key: 'status', header: t('chat.admin.col.status'), width: 110, render: (r) => (r.isLocked ? <Badge variant="warning" size="sm" icon={<Lock />}>{t('chat.locked')}</Badge> : <span className="text-caption text-ink-3">—</span>) },
        ]}
        rowActions={(r) => (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" iconOnly aria-label={t('chat.admin.viewMessages')} onClick={() => setPeek(r)}><MessageSquareText /></Button>
            {r.isLocked ? (
              <Button size="sm" variant="secondary" iconLeft={<LockOpen />} loading={lock.isPending && lock.variables?.id === r.id} onClick={() => lock.mutate({ id: r.id, locked: false })}>{t('chat.admin.unlock')}</Button>
            ) : (
              <Button size="sm" variant="secondary" iconLeft={<Lock />} onClick={() => setLockTarget(r)}>{t('chat.admin.lock')}</Button>
            )}
          </div>
        )}
      />
      {list.data && list.data.total > list.data.pageSize && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onChange={setPage} />}

      <Modal
        open={!!lockTarget}
        onClose={() => setLockTarget(null)}
        title={t('chat.admin.lock')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLockTarget(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={lock.isPending} onClick={() => lockTarget && lock.mutate({ id: lockTarget.id, locked: true, reason: reason.trim() || undefined })}>{t('chat.admin.lock')}</Button>
          </>
        }
      >
        <Textarea label={t('chat.admin.lockReason')} value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={300} />
      </Modal>

      <Modal open={!!peek} onClose={() => setPeek(null)} title={peek ? (peek.kind === 'direct' ? peek.members.map((m) => m.name).join(' · ') : peek.title ?? t('chat.group')) : ''} description={t('chat.admin.messagesTitle')} size="md">
        <ul className="flex flex-col gap-2">
          {(messages.data?.items ?? []).map((m) => {
            const sender = peek?.members.find((x) => x.id === m.senderId);
            return (
              <li key={m.id} className="flex items-start gap-2">
                {m.kind === 'system' ? (
                  <span className="mx-auto rounded-pill bg-sunken px-3 py-1 text-caption text-ink-2">{systemText(m, peek ? { members: peek.members, peer: null } : null, t)}</span>
                ) : (
                  <>
                    <Avatar size="xs" name={sender?.name ?? m.sender?.name} src={sender?.avatarUrl ?? m.sender?.avatarUrl} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="text-caption text-ink-3">{sender?.name ?? m.sender?.name ?? '—'} · {formatRelative(m.createdAt)}</span>
                      <span className="block text-small text-ink">{m.deletedAt ? <em className="text-ink-3">{t('chat.deleted')}</em> : m.kind === 'image' ? t('chat.preview.image') : m.kind === 'context_card' ? `${t('chat.preview.card')} ${m.body ?? ''}` : m.body}</span>
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
