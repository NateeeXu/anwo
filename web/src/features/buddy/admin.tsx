// Admin panel for "buddy" — moderation table mounted by the admin shell under /admin/buddy.
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Flag, Search } from 'lucide-react';
import type { Paginated } from '@shared/types';
import { Badge, Button, EmptyState, Input, Modal, Pagination, Table, Tabs, Textarea, TrustBadge } from '@/components';
import { errorMessage } from '@/app/errors';
import { api } from '@/lib/api';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import type { BuddyListItem } from './api';
import { StatusBadge, useBuddyTime } from './shared';

type AdminRow = BuddyListItem & { moderationStatus: 'ok' | 'flagged' | 'hidden'; openReports: number; viewCount: number };

export default function BuddyAdminPanel() {
  const t = useT();
  const { formatNumber } = useLocale();
  const time = useBuddyTime();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'flagged' | 'hidden'>('all');
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<{ row: AdminRow; to: 'ok' | 'flagged' | 'hidden' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ['buddy', 'admin', { filter, dq, page }],
    queryFn: () => api<Paginated<AdminRow>>('/api/buddy/admin/posts', { query: { moderationStatus: filter === 'all' ? undefined : filter, q: dq || undefined, page, pageSize: 20 } }),
    placeholderData: (prev) => prev,
  });

  const moderate = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/api/buddy/posts/${target.row.id}/moderate`, { body: { moderationStatus: target.to, reason: reason.trim() || undefined } });
      toast.success(t(target.to === 'hidden' ? 'buddy.admin.hide' : target.to === 'flagged' ? 'buddy.admin.flag' : 'buddy.admin.restore'));
      setTarget(null);
      setReason('');
      void qc.invalidateQueries({ queryKey: ['buddy'] });
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="buddy-admin-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="buddy-admin-title" className="text-h2 text-ink">
          {t('buddy.admin.title')}
        </h2>
        <Input size="sm" iconLeft={<Search />} placeholder={t('buddy.admin.search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} clearable className="w-64" aria-label={t('buddy.admin.search')} />
      </div>
      <Tabs
        variant="pill"
        items={[
          { key: 'all', label: t('buddy.admin.all') },
          { key: 'flagged', label: t('buddy.admin.flagged') },
          { key: 'hidden', label: t('buddy.admin.hidden') },
        ]}
        value={filter}
        onChange={(k) => { setFilter(k); setPage(1); }}
      />
      <Table<AdminRow>
        rows={query.data?.items ?? []}
        rowKey="id"
        loading={query.isPending}
        empty={<EmptyState size="sm" icon={Flag} title={t('buddy.admin.empty')} />}
        columns={[
          {
            key: 'title', header: t('buddy.title'),
            render: (r) => (
              <div className="min-w-0">
                <Link to={`/buddy/${r.id}`} className="block truncate text-small font-semibold text-ink hover:underline">{r.title}</Link>
                <span className="text-caption text-ink-3">{t(`buddy.type.${r.type}`)} · {r.campus.shortName}{r.startsAt ? ` · ${time.dayLabel(r.startsAt)}` : ''}</span>
              </div>
            ),
          },
          {
            key: 'host', header: t('buddy.admin.host'), hideOnMobile: true,
            render: (r) => (
              <span className="inline-flex items-center gap-1 text-small text-ink-2">{r.author.name} <TrustBadge level={r.author.trustLevel} size="inline" /></span>
            ),
          },
          { key: 'members', header: t('buddy.detail.members'), width: 90, render: (r) => <span className="tnum text-small">{r.memberCount}/{r.maxMembers}</span> },
          { key: 'views', header: t('buddy.admin.views'), width: 80, hideOnMobile: true, render: (r) => <span className="tnum text-small">{formatNumber(r.viewCount)}</span> },
          {
            key: 'status', header: t('buddy.admin.status'), width: 160,
            render: (r) => (
              <span className="flex flex-wrap gap-1">
                <StatusBadge status={r.status} />
                {r.moderationStatus !== 'ok' && <Badge variant={r.moderationStatus === 'hidden' ? 'danger' : 'warning'} size="sm">{t(`buddy.admin.${r.moderationStatus}`)}</Badge>}
                {r.openReports > 0 && <Badge variant="warning" size="sm" icon={<Flag size={12} />}>{r.openReports}</Badge>}
              </span>
            ),
          },
        ]}
        rowActions={(r) => (
          <span className="flex gap-1">
            {r.moderationStatus === 'hidden' ? (
              <Button size="sm" variant="secondary" iconLeft={<Eye />} onClick={() => setTarget({ row: r, to: 'ok' })}>{t('buddy.admin.restore')}</Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={() => setTarget({ row: r, to: r.moderationStatus === 'flagged' ? 'ok' : 'flagged' })}>
                  {r.moderationStatus === 'flagged' ? t('buddy.admin.unflag') : t('buddy.admin.flag')}
                </Button>
                <Button size="sm" variant="danger" iconLeft={<EyeOff />} onClick={() => setTarget({ row: r, to: 'hidden' })}>{t('buddy.admin.hide')}</Button>
              </>
            )}
          </span>
        )}
      />
      {query.data && query.data.total > 20 && <Pagination page={page} pageSize={20} total={query.data.total} onChange={setPage} />}
      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target ? `${t(target.to === 'hidden' ? 'buddy.admin.hide' : target.to === 'flagged' ? 'buddy.admin.flag' : 'buddy.admin.restore')}：${target.row.title}` : ''}
        size="sm"
        footer={<><Button variant="ghost" onClick={() => setTarget(null)}>{t('common.cancel')}</Button><Button variant={target?.to === 'hidden' ? 'danger' : 'primary'} loading={busy} onClick={moderate}>{t('common.confirm')}</Button></>}
      >
        <Textarea label={t('buddy.admin.reason')} rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Modal>
    </section>
  );
}
