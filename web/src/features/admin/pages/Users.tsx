// /admin/users — 用户: search + filters, keyboard bulk ban/unban, detail drawer (role, quota, campus, trust override, ban with reason).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Ban, ExternalLink, Search, ShieldCheck, Undo2, UserCog, Users as UsersIcon } from 'lucide-react';
import type { Role } from '@shared/enums';
import type { AdminUserRow } from '@shared/schemas/admin';
import { Avatar, Badge, Button, EmptyState, Input, Modal, Pagination, Select, Skeleton, Table, Tabs, TrustBadge } from '@/components';
import { useDebounce } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { useAuth } from '@/lib/auth';
import { Head } from '@/app/Head';
import { adminApi, useAdminMutation, useAdminUser, useAdminUsers } from '../api';
import { BulkBar, CampusFilter, ErrorState, ExportLink, KeyHints, PageTitle, ReasonDialog, ReportStatusBadge, useAdminFilters, useRowKeys } from '../ui';

const ROLES: Role[] = ['student', 'landlord', 'admin'];

export default function Users() {
  const t = useT();
  const { formatRelative, formatNumber } = useLocale();
  const f = useAdminFilters();
  const [q, setQ] = useState(f.param('q') ?? '');
  const dq = useDebounce(q, 300);
  const [role, setRole] = useState<string>('all');
  const [trust, setTrust] = useState<string>('all');
  const [banned, setBanned] = useState<string>('all');
  const [sort, setSort] = useState<'recent' | 'active' | 'name'>('recent');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<'ban' | 'unban' | null>(null);
  const openId = f.param('u');
  const setOpenId = (id: string | null) => f.setParam('u', id);

  useEffect(() => setPage(1), [dq, role, trust, banned, sort, f.campusId]);
  const list = useAdminUsers({ q: dq, role: role === 'all' ? undefined : role, trustLevel: trust === 'all' ? undefined : trust, banned: banned === 'all' ? undefined : banned === 'yes', campusId: f.campusId, sort, page, pageSize: 20 });
  const rows = list.data?.items ?? [];
  const { cursor } = useRowKeys(rows, (r) => r.id, { selected, setSelected, onOpen: (r) => setOpenId(r.id), enabled: !openId });
  const bulkMut = useAdminMutation((body: { ids: string[]; action: 'ban' | 'unban'; reason: string }) => adminApi.bulkUsers(body));

  return (
    <div className="flex flex-col gap-5">
      <Head title={t('admin.nav.users')} />
      <PageTitle title={t('admin.nav.users')} subtitle={list.data ? t('admin.users.subtitle', { count: formatNumber(list.data.total) }) : undefined} actions={<ExportLink table="users" query={{ campusId: f.campusId }} />} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))]">
        <Input size="sm" iconLeft={<Search />} placeholder={t('admin.users.search')} aria-label={t('admin.users.search')} value={q} onChange={(e) => setQ(e.target.value)} clearable />
        <CampusFilter value={f.campusId} onChange={f.setCampus} />
        <Select size="sm" aria-label={t('admin.col.role')} value={role} onChange={setRole} options={[{ value: 'all', label: t('admin.users.allRoles') }, ...ROLES.map((r) => ({ value: r, label: t(`admin.role.${r}`) }))]} />
        <Select size="sm" aria-label={t('admin.col.trust')} value={trust} onChange={setTrust} options={[{ value: 'all', label: t('admin.users.allTrust') }, ...[0, 1, 2, 3].map((l) => ({ value: String(l), label: `L${l}` }))]} />
        <Select
          size="sm"
          aria-label={t('admin.users.status')}
          value={banned}
          onChange={setBanned}
          options={[
            { value: 'all', label: t('admin.users.anyStatus') },
            { value: 'no', label: t('admin.users.activeOnly') },
            { value: 'yes', label: t('admin.users.bannedOnly') },
          ]}
        />
        <Select
          size="sm"
          aria-label={t('admin.common.sort')}
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
          options={[
            { value: 'recent', label: t('admin.users.sortRecent') },
            { value: 'active', label: t('admin.users.sortActive') },
            { value: 'name', label: t('admin.users.sortName') },
          ]}
        />
      </div>
      <KeyHints />

      {list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : (
        <Table<AdminUserRow>
          rows={rows}
          rowKey="id"
          loading={list.isLoading}
          selectable
          selected={selected}
          onSelectChange={setSelected}
          onRowClick={(r) => setOpenId(r.id)}
          caption={t('admin.nav.users')}
          data-testid="users-table"
          className="[&_tbody_tr[data-cursor=true]]:bg-sunken"
          empty={<EmptyState icon={UsersIcon} title={t('admin.users.empty')} description={t('admin.users.emptyHint')} size="sm" />}
          columns={[
            {
              key: 'name',
              header: t('admin.col.user'),
              render: (r, i) => (
                <div className="flex min-w-0 items-center gap-2.5" data-cursor={i === cursor || undefined}>
                  <Avatar src={r.avatarUrl} name={r.name} size="sm" trustLevel={r.trustLevel} />
                  <div className="min-w-0">
                    <p className={i === cursor ? 'truncate font-medium text-ink underline decoration-accent decoration-2 underline-offset-4' : 'truncate font-medium text-ink'}>{r.name}</p>
                    <p className="truncate text-caption text-ink-3">{r.email}</p>
                  </div>
                </div>
              ),
            },
            { key: 'role', header: t('admin.col.role'), render: (r) => <span className="text-ink-2">{t(`admin.role.${r.role}`)}</span> },
            { key: 'trust', header: t('admin.col.trust'), render: (r) => <span className="inline-flex items-center gap-1 text-ink-2"><TrustBadge level={r.trustLevel} size="inline" noTooltip />L{r.trustLevel}</span> },
            { key: 'campus', header: t('admin.col.campus'), hideOnMobile: true, render: (r) => r.campus?.shortName ?? <span className="text-ink-3">{t('admin.common.none')}</span> },
            { key: 'content', header: t('admin.users.content'), hideOnMobile: true, align: 'right', render: (r) => <span className="tabular-nums text-ink-2">{r.counts.listings + r.counts.items + r.counts.buddy}</span> },
            { key: 'reports', header: t('admin.users.reports'), align: 'right', render: (r) => (r.counts.reports ? <Badge size="sm" variant="warning">{r.counts.reports}</Badge> : <span className="text-ink-3">0</span>) },
            { key: 'status', header: t('admin.users.status'), render: (r) => (r.banned ? <Badge size="sm" variant="danger" icon={<Ban size={12} />}>{t('admin.users.banned')}</Badge> : <Badge size="sm" variant="success">{t('admin.users.active')}</Badge>) },
            { key: 'last', header: t('admin.users.lastActive'), hideOnMobile: true, render: (r) => <span className="text-ink-2">{r.lastActiveAt ? formatRelative(r.lastActiveAt) : '—'}</span> },
          ]}
        />
      )}
      {list.data && list.data.total > list.data.pageSize && <Pagination page={page} pageSize={20} total={list.data.total} onChange={setPage} loading={list.isFetching} />}

      <BulkBar count={selected.length} onClear={() => setSelected([])}>
        <Button size="sm" variant="secondary" iconLeft={<Undo2 />} onClick={() => setBulk('unban')}>
          {t('admin.users.unban')}
        </Button>
        <Button size="sm" variant="danger" iconLeft={<Ban />} onClick={() => setBulk('ban')} data-testid="bulk-ban">
          {t('admin.users.ban')}
        </Button>
      </BulkBar>

      <ReasonDialog
        open={!!bulk}
        danger={bulk === 'ban'}
        title={bulk === 'ban' ? t('admin.users.bulkBanTitle', { count: selected.length }) : t('admin.users.bulkUnbanTitle', { count: selected.length })}
        description={bulk === 'ban' ? t('admin.users.banEffects') : undefined}
        confirmLabel={bulk === 'ban' ? t('admin.users.ban') : t('admin.users.unban')}
        presets={bulk === 'ban' ? [t('admin.reason.preset.scam'), t('admin.reason.preset.spam'), t('admin.reason.preset.harassment')] : [t('admin.reason.preset.appeal')]}
        onClose={() => setBulk(null)}
        onConfirm={async (reason) => {
          const r = await bulkMut.mutateAsync({ ids: selected, action: bulk!, reason });
          toast.success(t('admin.users.bulkDone', { count: r.succeeded }));
          setSelected([]);
        }}
      />

      <UserDrawer id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption text-ink-3">{label}</dt>
      <dd className="truncate text-small text-ink">{children}</dd>
    </div>
  );
}

export function UserDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useT();
  const { formatDate, formatRelative, formatMoney } = useLocale();
  const me = useAuth().user;
  const user = useAdminUser(id);
  const u = user.data;
  const [tab, setTab] = useState<'activity' | 'reports' | 'audit' | 'orders'>('activity');
  const [dialog, setDialog] = useState<null | { kind: 'ban' | 'unban' | 'role' | 'quota' | 'campus' | 'trust'; value?: string }>(null);
  const [role, setRole] = useState<string>('student');
  const [quota, setQuota] = useState('2');
  const [trust, setTrust] = useState('0');
  const [campus, setCampus] = useState<string | null>(null);
  useEffect(() => {
    if (u) {
      setRole(u.role);
      setQuota(String(u.listingQuota));
      setTrust(String(u.trustLevel));
      setCampus(u.campusId);
    }
  }, [u]);
  const patch = useAdminMutation((body: Record<string, unknown>) => adminApi.patchUser(id!, body));
  const trustMut = useAdminMutation((body: { trustLevel: number; reason: string }) => adminApi.trustOverride(id!, body));
  const isSelf = me?.id === id;

  const confirm = async (reason: string) => {
    if (!dialog) return;
    if (dialog.kind === 'trust') {
      await trustMut.mutateAsync({ trustLevel: Number(trust), reason });
    } else {
      const body: Record<string, unknown> = { reason };
      if (dialog.kind === 'ban') Object.assign(body, { banned: true, bannedReason: reason });
      if (dialog.kind === 'unban') body.banned = false;
      if (dialog.kind === 'role') body.role = role;
      if (dialog.kind === 'quota') body.listingQuota = Number(quota);
      if (dialog.kind === 'campus') body.campusId = campus;
      await patch.mutateAsync(body);
    }
    toast.success(t(`admin.users.done.${dialog.kind}`));
  };

  return (
    <Modal open={!!id} onClose={onClose} size="lg" title={u?.name ?? t('admin.users.detail')} description={u?.email}>
      {user.isError ? (
        <ErrorState error={user.error} onRetry={() => void user.refetch()} />
      ) : !u ? (
        <div className="flex flex-col gap-3 py-4">
          <Skeleton variant="rect" height={64} />
          <Skeleton variant="rect" height={160} />
        </div>
      ) : (
        <div className="flex flex-col gap-5" data-testid="user-drawer">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar src={u.avatarUrl} name={u.name} size="lg" trustLevel={u.trustLevel} />
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
              <TrustBadge level={u.trustLevel} size="card" showLabel />
              <Badge size="sm">{t(`admin.role.${u.role}`)}</Badge>
              {u.isPro && <Badge variant="pro" size="sm" />}
              {u.banned ? <Badge size="sm" variant="danger" icon={<Ban size={12} />}>{t('admin.users.banned')}</Badge> : <Badge size="sm" variant="success">{t('admin.users.active')}</Badge>}
            </div>
            <Link to={`/u/${u.id}`} className="inline-flex items-center gap-1 text-small text-accent-text hover:underline">
              {t('admin.users.publicProfile')}
              <ExternalLink size={14} aria-hidden />
            </Link>
          </div>
          {u.banned && u.bannedReason && (
            <p className="rounded-ctl bg-danger-soft px-3 py-2 text-small text-danger">
              {t('admin.users.bannedBecause', { reason: u.bannedReason })}
              {u.bannedAt && ` · ${formatRelative(u.bannedAt)}`}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <Fact label={t('admin.col.campus')}>{u.campus ? `${u.campus.shortName} · ${u.campus.state}` : t('admin.common.none')}</Fact>
            <Fact label={t('admin.users.memberSince')}>{formatDate(u.createdAt, 'long')}</Fact>
            <Fact label={t('admin.users.lastActive')}>{u.lastActiveAt ? formatRelative(u.lastActiveAt) : '—'}</Fact>
            <Fact label={t('admin.users.phone')}>{u.phone ?? '—'}</Fact>
            <Fact label={t('admin.users.eduEmail')}>{u.eduEmail ?? '—'}</Fact>
            <Fact label={t('admin.users.idVerified')}>{u.idVerifiedAt ? formatDate(u.idVerifiedAt) : '—'}</Fact>
            <Fact label={t('admin.users.wallet')}>{formatMoney(u.walletBalanceCents)}</Fact>
            <Fact label={t('admin.users.counts')}>{t('admin.users.countsValue', { l: u.counts.listings, i: u.counts.items, b: u.counts.buddy })}</Fact>
          </dl>

          <section aria-label={t('admin.users.actions')} className="grid grid-cols-1 gap-3 rounded-card border border-line p-3 sm:grid-cols-2">
            <div className="flex items-end gap-2">
              <Select size="sm" label={t('admin.col.role')} value={role} onChange={setRole} disabled={isSelf} options={ROLES.map((r) => ({ value: r, label: t(`admin.role.${r}`) }))} />
              <Button size="sm" variant="secondary" disabled={isSelf || role === u.role} onClick={() => setDialog({ kind: 'role' })} iconLeft={<UserCog />}>
                {t('admin.common.apply')}
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <Select size="sm" label={t('admin.users.trustOverride')} value={trust} onChange={setTrust} options={[0, 1, 2, 3].map((l) => ({ value: String(l), label: `L${l}` }))} />
              <Button size="sm" variant="secondary" disabled={Number(trust) === u.trustLevel} onClick={() => setDialog({ kind: 'trust' })} iconLeft={<ShieldCheck />}>
                {t('admin.common.apply')}
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <Input size="sm" type="number" min={0} max={100} inputMode="numeric" label={t('admin.users.quota')} value={quota} onChange={(e) => setQuota(e.target.value)} />
              <Button size="sm" variant="secondary" disabled={Number(quota) === u.listingQuota || quota === ''} onClick={() => setDialog({ kind: 'quota' })}>
                {t('admin.common.apply')}
              </Button>
            </div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-small font-medium text-ink">{t('admin.col.campus')}</p>
                <CampusFilter value={campus} onChange={setCampus} />
              </div>
              <Button size="sm" variant="secondary" disabled={campus === u.campusId} onClick={() => setDialog({ kind: 'campus' })}>
                {t('admin.common.apply')}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              {u.banned ? (
                <Button size="sm" variant="secondary" iconLeft={<Undo2 />} onClick={() => setDialog({ kind: 'unban' })}>
                  {t('admin.users.unban')}
                </Button>
              ) : (
                <Button size="sm" variant="danger" iconLeft={<Ban />} disabled={isSelf || u.role === 'admin'} onClick={() => setDialog({ kind: 'ban' })} data-testid="user-ban">
                  {t('admin.users.ban')}
                </Button>
              )}
              <Link to={`/admin/audit?entityId=${u.id}`} className="inline-flex h-8 items-center px-2 text-small text-accent-text hover:underline">
                {t('admin.users.viewAudit')}
              </Link>
            </div>
          </section>

          <div>
            <Tabs<'activity' | 'reports' | 'audit' | 'orders'>
              value={tab}
              onChange={setTab}
              label={t('admin.users.detail')}
              items={[
                { key: 'activity', label: t('admin.users.tab.activity'), count: u.recentEvents.length },
                { key: 'reports', label: t('admin.users.tab.reports'), count: u.reportsAgainst.length },
                { key: 'audit', label: t('admin.users.tab.audit'), count: u.audit.length },
                { key: 'orders', label: t('admin.users.tab.orders'), count: u.orders.length + u.verifications.length },
              ]}
            />
            <div className="pt-3">
              {tab === 'activity' && (
                <ul className="flex flex-col divide-y divide-line">
                  {u.recentEvents.length === 0 && <li className="py-4 text-small text-ink-3">{t('admin.common.noData')}</li>}
                  {u.recentEvents.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                      <code className="font-mono text-caption text-ink">{e.type}</code>
                      <span className="truncate text-caption text-ink-3">{e.path ?? e.entityType ?? ''}</span>
                      <span className="shrink-0 text-caption text-ink-2">{formatRelative(e.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'reports' && (
                <ul className="flex flex-col divide-y divide-line">
                  {u.reportsAgainst.length === 0 && <li className="py-4 text-small text-ink-3">{t('admin.users.noReports')}</li>}
                  {u.reportsAgainst.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                      <ReportStatusBadge status={r.status} />
                      <span className="text-small text-ink">{t(`admin.reason.${r.reason}`)}</span>
                      <span className="truncate text-caption text-ink-3">{r.entity?.title}</span>
                      <Link to={`/admin/reports?r=${r.id}&status=all`} className="ml-auto text-caption text-accent-text hover:underline">
                        {t('admin.common.open')}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'audit' && (
                <ul className="flex flex-col divide-y divide-line">
                  {u.audit.length === 0 && <li className="py-4 text-small text-ink-3">{t('admin.common.noData')}</li>}
                  {u.audit.map((a) => (
                    <li key={a.id} className="flex flex-col gap-0.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <code className="font-mono text-caption text-ink">{a.action}</code>
                        <span className="text-caption text-ink-2">{formatRelative(a.createdAt)}</span>
                      </div>
                      {a.reason && <p className="text-caption text-ink-2">{a.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'orders' && (
                <ul className="flex flex-col divide-y divide-line">
                  {u.orders.length + u.verifications.length === 0 && <li className="py-4 text-small text-ink-3">{t('admin.common.noData')}</li>}
                  {u.verifications.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-small text-ink">{t('admin.users.verification', { type: v.type })}</span>
                      <ModerationBadgeLike status={v.status} />
                      <span className="text-caption text-ink-2">{formatDate(v.createdAt)}</span>
                    </li>
                  ))}
                  {u.orders.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-small text-ink">{t('admin.users.order', { kind: o.kind })}</span>
                      <span className="text-caption text-ink-2">{o.status}</span>
                      <span className="text-small tabular-nums text-ink">{formatMoney(o.totalCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
      <ReasonDialog
        open={!!dialog}
        danger={dialog?.kind === 'ban'}
        title={dialog ? t(`admin.users.confirm.${dialog.kind}`, { name: u?.name ?? '' }) : ''}
        description={dialog?.kind === 'ban' ? t('admin.users.banEffects') : dialog?.kind === 'unban' ? t('admin.users.unbanEffects') : undefined}
        confirmLabel={dialog?.kind === 'ban' ? t('admin.users.ban') : dialog?.kind === 'unban' ? t('admin.users.unban') : t('admin.common.confirm')}
        presets={dialog?.kind === 'ban' ? [t('admin.reason.preset.scam'), t('admin.reason.preset.spam'), t('admin.reason.preset.harassment')] : undefined}
        onClose={() => setDialog(null)}
        onConfirm={confirm}
      />
    </Modal>
  );
}

function ModerationBadgeLike({ status }: { status: string }) {
  const t = useT();
  const map: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = { approved: 'success', pending: 'warning', in_review: 'info', rejected: 'danger', cancelled: 'neutral' };
  return (
    <Badge size="sm" variant={map[status] ?? 'neutral'}>
      {t(`admin.verifyStatus.${status}`)}
    </Badge>
  );
}

