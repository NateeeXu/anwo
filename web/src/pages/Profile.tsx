// Public trust profile /u/:id (DESIGN.md §7.8).
import { useState } from 'react';
import { Flag, MessageCircle, Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import type { BuddyCard, ItemCard, ListingCard, Paginated, UserProfile } from '@shared/types';
import { ReportReason } from '@shared/enums';
import { Avatar, Badge, Button, Card, EmptyState, Modal, Select, Skeleton, Tabs, Textarea, TrustBadge } from '../components';
import { NoBuddy, NoItems, NoListings } from '../components/illustrations';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useLocale, useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { errorMessage } from '../app/errors';
import { Head } from '../app/Head';
import { loginPath } from '../app/guards';
import { CardGrid, QueryState } from './home/Section';
import { ListingCard as ListingCardView } from '../features/listings/components/ListingCard';
import { ItemCard as ItemCardView } from '../features/market/components/ItemCard';
import { BuddyCard as BuddyCardView } from '../features/buddy/BuddyCard';
import { TrustProfileCard } from '../features/verify/TrustProfileCard';
import { openChatWith } from '../features/chat/api';
import NotFound from './NotFound';

function ReportModal({ userId, open, onClose }: { userId: string; open: boolean; onClose: () => void }) {
  const t = useT();
  const [reason, setReason] = useState<string>('scam');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api(`/api/users/${userId}/report`, { method: 'POST', body: { reason, details: details.trim() || undefined } });
      toast.success(t('report.sent'), t('report.sentHint'));
      onClose();
    } catch (err) {
      toast.error(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('report.title')}
      description={t('report.description')}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={busy} onClick={submit}>{t('common.submit')}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Select label={t('report.reason')} value={reason} onChange={(v: string) => setReason(v)} options={ReportReason.map((r) => ({ value: r, label: t(`report.reason.${r}`) }))} />
        <Textarea label={t('report.details')} rows={3} maxLength={1000} showCount value={details} onChange={(e) => setDetails(e.target.value)} />
      </div>
    </Modal>
  );
}

export default function Profile() {
  const { id = '' } = useParams();
  const t = useT();
  const { formatDate, formatNumber } = useLocale();
  const { user: me, status } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('listings');
  const [report, setReport] = useState(false);
  const [opening, setOpening] = useState(false);

  const profile = useQuery({
    queryKey: ['users', 'profile', id],
    queryFn: () => api<UserProfile>(`/api/users/${id}`),
    enabled: !!id,
  });
  const listings = useQuery({
    queryKey: ['listings', 'byOwner', id],
    queryFn: () => api<Paginated<ListingCard>>('/api/listings', { query: { ownerId: id, pageSize: 12 } }),
    enabled: tab === 'listings' && !!id,
  });
  const items = useQuery({
    queryKey: ['market', 'bySeller', id],
    queryFn: () => api<Paginated<ItemCard>>('/api/market/items', { query: { sellerId: id, pageSize: 12 } }),
    enabled: tab === 'items' && !!id,
  });
  const buddy = useQuery({
    queryKey: ['buddy', 'byAuthor', id],
    queryFn: () => api<Paginated<BuddyCard>>('/api/buddy/posts', { query: { authorId: id, pageSize: 12 } }),
    enabled: tab === 'buddy' && !!id,
  });

  if (profile.isError && profile.error instanceof ApiError && profile.error.status === 404) return <NotFound />;
  if (profile.isPending || profile.isError) {
    return (
      <div className="mx-auto w-full max-w-reading px-4" aria-busy="true">
        {profile.isError ? (
          <EmptyState title={t('error.generic')} action={<Button variant="primary" onClick={() => profile.refetch()}>{t('common.retry')}</Button>} />
        ) : (
          <div className="flex items-center gap-4">
            <Skeleton variant="circle" width={88} height={88} />
            <div className="flex-1">
              <Skeleton variant="text" width={200} height={28} />
              <Skeleton variant="text" width={140} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const u = profile.data;
  const isMe = me?.id === u.id;
  const startChat = async () => {
    if (status !== 'authed') return navigate(loginPath(`/u/${u.id}`));
    setOpening(true);
    try {
      await openChatWith({ userId: u.id, source: 'profile', navigate });
    } catch (err) {
      toast.error(errorMessage(t, err));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-reading px-4">
      <Head title={u.name} />
      <header className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <Avatar src={u.avatarUrl ?? undefined} name={u.name} size="xl" trustLevel={u.trustLevel as 0 | 1 | 2 | 3} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-h1-sm md:text-h1 text-ink">
            {u.name}
            {u.isPro && <Badge variant="pro">{t('profile.pro')}</Badge>}
            {u.role === 'landlord' && !u.isPro && <Badge variant="neutral">{t('profile.landlord')}</Badge>}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <TrustBadge level={u.trustLevel as 0 | 1 | 2 | 3} accountRole={u.role} size="profile" showLabel />
          </div>
          <p className="mt-1 text-small text-ink-2">
            {u.campus?.shortName ?? t('campus.none')} · {t('profile.memberSince', { date: formatDate(u.memberSince, 'month', { year: true }) })}
            {u.program && ` · ${u.program}`}
            {u.gradYear && ` · ${u.gradYear}`}
          </p>
        </div>
        <div className="flex gap-2">
          {isMe ? (
            <Button variant="secondary" size="sm" iconLeft={<Pencil />} asChild>
              <Link to="/settings">{t('common.edit')}</Link>
            </Button>
          ) : (
            <>
              <Button variant="primary" size="sm" iconLeft={<MessageCircle />} loading={opening} onClick={startChat}>
                {t('profile.message')}
              </Button>
              <Button variant="ghost" size="sm" iconLeft={<Flag />} onClick={() => (status === 'authed' ? setReport(true) : navigate(loginPath(`/u/${u.id}`)))}>
                {t('common.report')}
              </Button>
            </>
          )}
        </div>
      </header>

      {u.bio && <p className="mt-4 text-body text-ink-2">{u.bio}</p>}
      {u.languages?.length > 0 && <p className="mt-1 text-small text-ink-3">{t('profile.languages')}: {u.languages.join(' · ')}</p>}

      {isMe && u.trustLevel < 2 && (
        <Card variant="sunken" padding="sm" className="mt-4 flex items-center justify-between gap-3 text-small text-ink-2">
          <span>{t('profile.verifyNudge')}</span>
          <Button variant="secondary" size="sm" asChild>
            <Link to={u.trustLevel < 1 ? '/verify-email' : '/verify'}>{t('guard.trust.goVerify')}</Link>
          </Button>
        </Card>
      )}


      {/* verify module's public trust profile (one implementation everywhere) */}
      <TrustProfileCard userId={u.id} compact className="mt-6" />

      <div className="mt-8">
        <Tabs
          variant="underline"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'listings', label: t('profile.tab.listings'), count: u.stats.activeListings || undefined },
            { key: 'items', label: t('profile.tab.items') },
            { key: 'buddy', label: t('profile.tab.buddy') },
          ]}
        />
        <div className="mt-4">
          {tab === 'listings' && (
            <QueryState query={listings} skeleton={<CardGrid cols={2}><Skeleton variant="listing-card" /><Skeleton variant="listing-card" /></CardGrid>} isEmpty={(d) => !d.items?.length} empty={<EmptyState size="sm" icon={<NoListings />} title={t('profile.empty.listings')} />}>
              {(d) => <CardGrid cols={2}>{d.items.map((l) => <ListingCardView key={l.id} listing={l} showCity />)}</CardGrid>}
            </QueryState>
          )}
          {tab === 'items' && (
            <QueryState query={items} skeleton={<CardGrid cols={3}><Skeleton variant="item-card" /><Skeleton variant="item-card" /><Skeleton variant="item-card" /></CardGrid>} isEmpty={(d) => !d.items?.length} empty={<EmptyState size="sm" icon={<NoItems />} title={t('profile.empty.items')} />}>
              {(d) => <CardGrid cols={3}>{d.items.map((it) => <ItemCardView key={it.id} item={it} />)}</CardGrid>}
            </QueryState>
          )}
          {tab === 'buddy' && (
            <QueryState query={buddy} skeleton={<CardGrid cols={2}><Skeleton variant="buddy-card" /><Skeleton variant="buddy-card" /></CardGrid>} isEmpty={(d) => !d.items?.length} empty={<EmptyState size="sm" icon={<NoBuddy />} title={t('profile.empty.buddy')} />}>
              {(d) => <CardGrid cols={2}>{d.items.map((p) => <BuddyCardView key={p.id} post={p} />)}</CardGrid>}
            </QueryState>
          )}
        </div>
      </div>
      <ReportModal userId={u.id} open={report} onClose={() => setReport(false)} />
    </div>
  );
}
