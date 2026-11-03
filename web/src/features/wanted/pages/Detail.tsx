// /wanted/:id — DESIGN §7.5 detail: facts grid, areas map, description, requester trust strip, right rail
// (host: 我有房源，推荐给 TA · requester: 为你速配 panel + digest switch).
import {
  CalendarDays, Car, CircleAlert, Dog, Flag, Home, MessageCircle, Pause, Pencil, Play, RefreshCw, Share2, Sofa, Sparkles, Users, Wallet, CheckCircle2, Eye, Globe,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Avatar, Badge, Button, Card, Chip, EmptyState, Price, Skeleton, Switch, TrustBadge } from '@/components';
import { MapView, type MapCircle, type MapMarker } from '@/components/map';
import { api, isApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getCampusById } from '@/lib/campus';
import { campusCenter } from '@/lib/geo';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { PageSkeleton } from '@/app/PageSkeleton';
import { fetchMatches, recomputeMatches, transitionWanted, useInvalidateWanted, useWanted, wantedKeys } from '../api';
import { bedroomsLabel, groupLabel } from '../lib';
import { AreaChips } from '../components/WantedCard';
import { MatchRow } from '../components/MatchRow';
import { OfferModal } from '../components/OfferModal';
import { ReportModal } from '../components/ReportModal';

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-sunken text-ink-2 [&>svg]:size-4" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <dt className="text-caption text-ink-3">{label}</dt>
        <dd className="text-body text-ink">{children}</dd>
      </div>
    </div>
  );
}

export default function WantedDetail() {
  const { id = '' } = useParams();
  const t = useT();
  const { formatDate, formatDateRange, formatRelative, formatMoneyRange } = useLocale();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const invalidate = useInvalidateWanted();
  const query = useWanted(id);
  const [offerOpen, setOfferOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const w = query.data;
  const isOwner = !!user && !!w && user.id === w.author.id;
  const isAdmin = user?.role === 'admin';

  const matches = useQuery({
    queryKey: wantedKeys.matches(id, { top: 3 }),
    queryFn: () => fetchMatches(id, { pageSize: 3 }),
    enabled: isOwner && w?.status === 'active',
  });
  const recompute = useMutation({
    mutationFn: () => recomputeMatches(id),
    onSuccess: (r) => { toast.success(t('wanted.matchesPanel.recomputed', { n: r.count })); invalidate(id); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const transition = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'fulfilled' | 'extend') => transitionWanted(id, action),
    onSuccess: (data) => { toast.success(t(`wanted.mine.toast.${data.status}`)); invalidate(id); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });
  const digest = useMutation({
    mutationFn: (on: boolean) => api('/api/users/me', { method: 'PATCH', body: { emailDigestOptIn: on } }),
    onSuccess: (_d, on) => { void refresh(); toast.success(on ? t('wanted.digest.on') : t('wanted.digest.off')); },
    onError: (e) => toast.error(errorMessage(t, e)),
  });

  if (query.isPending) return <PageSkeleton />;
  if (query.isError || !w) {
    return (
      <div className="mx-auto w-full max-w-reading px-4 lg:px-8">
        <EmptyState
          icon={CircleAlert}
          title={isApiError(query.error, 'NOT_FOUND') ? t('wanted.detail.notFound') : t('error.generic')}
          description={isApiError(query.error, 'NOT_FOUND') ? t('wanted.detail.notFoundHint') : undefined}
          action={{ label: t('wanted.detail.backToBrowse'), onClick: () => navigate('/wanted') }}
        />
      </div>
    );
  }

  const campus = getCampusById(w.campusId);
  const circles: MapCircle[] = w.areas.filter((a) => a.kind === 'circle' && a.lat != null && a.lng != null).map((a) => ({ id: a.id, lat: a.lat!, lng: a.lng!, radiusM: a.radiusM ?? 1500, kind: 'area' as const }));
  const markers: MapMarker[] = [];
  if (campus) markers.push({ id: 'campus', kind: 'campus', lat: campus.lat, lng: campus.lng, label: campus.shortName });
  for (const a of w.areas) {
    if (a.kind === 'circle' && a.lat != null && a.lng != null) markers.push({ id: a.id, kind: 'poi', lat: a.lat, lng: a.lng, label: a.label });
    if (a.kind === 'campus' && a.campusId) { const c = getCampusById(a.campusId); if (c && c.id !== campus?.id) markers.push({ id: a.id, kind: 'campus', lat: c.lat, lng: c.lng, label: c.shortName }); }
  }
  const showMap = circles.length > 0 || markers.length > 1;

  const share = async () => {
    const url = window.location.href;
    const text = `${w.title} · ${formatMoneyRange(w.budgetMinCents, w.budgetMaxCents)}`;
    track('wanted.share', { entityType: 'wanted', entityId: w.id });
    try {
      if (navigator.share) await navigator.share({ title: w.title, text, url });
      else { await navigator.clipboard.writeText(url); toast.success(t('wanted.detail.linkCopied')); }
    } catch { /* cancelled */ }
  };

  const statusBadge = w.status !== 'active' && <Badge variant={w.status === 'fulfilled' ? 'success' : 'neutral'} icon={w.status === 'fulfilled' ? <CheckCircle2 /> : undefined}>{t(`wanted.status.${w.status}`)}</Badge>;

  const hostRail = (
    <Card padding="lg" className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Price cents={w.budgetMinCents} maxCents={w.budgetMaxCents} perMonth size="lg" />
      </div>
      <p className="text-small text-ink-2">{t('wanted.detail.railMoveIn', { from: formatDate(w.moveInFrom, 'long'), to: formatDate(w.moveInTo, 'long') })}</p>
      {w.myOffer ? (
        <>
          <Badge variant="success" icon={<CheckCircle2 />} className="w-fit">{t('wanted.offer.offered')}</Badge>
          {w.myOffer.conversationId && (
            <Button asChild variant="primary" size="lg" fullWidth iconLeft={<MessageCircle />}><Link to={`/chat/${w.myOffer.conversationId}`}>{t('wanted.match.openChat')}</Link></Button>
          )}
        </>
      ) : user ? (
        <Button variant="primary" size="lg" fullWidth iconLeft={<Home />} onClick={() => setOfferOpen(true)} disabled={w.status !== 'active'}>
          {t('wanted.offer.ctaLong')}
        </Button>
      ) : (
        <Button variant="primary" size="lg" fullWidth onClick={() => navigate(`/login?next=${encodeURIComponent(`/wanted/${w.id}`)}`)}>{t('wanted.detail.loginToOffer')}</Button>
      )}
      <p className="text-caption text-ink-3">{t('wanted.offer.railHint')}</p>
      <div className="hairline" />
      <p className="flex flex-wrap gap-x-3 text-small text-ink-3">
        <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />{t('wanted.detail.views', { n: w.viewCount })}</span>
        <span className="inline-flex items-center gap-1"><Sparkles className="size-3.5" aria-hidden />{t('wanted.matches', { n: w.matchCount })}</span>
        <span className="inline-flex items-center gap-1"><Home className="size-3.5" aria-hidden />{t('wanted.detail.offers', { n: w.offerCount })}</span>
        <span>{t('wanted.detail.posted', { when: formatRelative(w.createdAt) })}</span>
      </p>
    </Card>
  );

  const ownerRail = (
    <div className="flex flex-col gap-4">
      <Card padding="lg" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-h3 text-ink">{t('wanted.matchesPanel.title')}</h2>
          <Button variant="ghost" size="sm" iconOnly aria-label={t('wanted.matchesPanel.recompute')} loading={recompute.isPending} onClick={() => recompute.mutate()}><RefreshCw /></Button>
        </div>
        {w.status !== 'active' ? (
          <p className="text-small text-ink-2">{t('wanted.matchesPanel.inactive')}</p>
        ) : matches.isPending ? (
          <div className="flex flex-col gap-2" aria-busy><Skeleton variant="row" /><Skeleton variant="row" /></div>
        ) : matches.isError ? (
          <EmptyState size="sm" title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => matches.refetch() }} />
        ) : matches.data.items.length === 0 ? (
          <EmptyState size="sm" icon={Sparkles} title={t('wanted.matchesPanel.empty')} description={t('wanted.matchesPanel.emptyHint')} />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {matches.data.items.map((m) => <li key={m.id}><MatchRow match={m} wantedId={w.id} canAct /></li>)}
            </ul>
            <Button asChild variant="secondary" fullWidth><Link to={`/wanted/${w.id}/matches`}>{t('wanted.matchesPanel.viewAll', { n: matches.data.total })}</Link></Button>
          </>
        )}
        {matches.data?.computedAt && <p className="text-caption text-ink-3">{t('wanted.matchesPanel.computedAt', { when: formatRelative(matches.data.computedAt) })}</p>}
      </Card>
      <Card padding="md" className="flex flex-col gap-2">
        <Switch
          label={t('wanted.digest.switch')}
          description={t('wanted.digest.switchHint')}
          checked={!!user?.emailDigestOptIn}
          onChange={(on) => digest.mutate(on)}
          disabled={digest.isPending}
        />
        <Link to="/wanted/digest" className="text-small text-accent-text hover:underline">{t('wanted.digest.preview')}</Link>
      </Card>
      <Card padding="md" className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm" iconLeft={<Pencil />}><Link to={`/wanted/${w.id}/edit`}>{t('common.edit')}</Link></Button>
        {w.status === 'active' && <Button variant="ghost" size="sm" iconLeft={<Pause />} loading={transition.isPending} onClick={() => transition.mutate('pause')}>{t('wanted.mine.pause')}</Button>}
        {w.status === 'paused' && <Button variant="ghost" size="sm" iconLeft={<Play />} loading={transition.isPending} onClick={() => transition.mutate('resume')}>{t('wanted.mine.resume')}</Button>}
        {w.status === 'expired' && <Button variant="ghost" size="sm" iconLeft={<RefreshCw />} loading={transition.isPending} onClick={() => transition.mutate('extend')}>{t('wanted.mine.extend')}</Button>}
        {(w.status === 'active' || w.status === 'paused') && <Button variant="ghost" size="sm" iconLeft={<CheckCircle2 />} loading={transition.isPending} onClick={() => transition.mutate('fulfilled')}>{t('wanted.mine.fulfilled')}</Button>}
      </Card>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-detail px-4 pb-24 lg:px-8 lg:pb-8">
      <Head title={w.title} description={w.description.slice(0, 160)} />
      <nav className="flex items-center gap-1.5 py-3 text-small text-ink-3" aria-label="breadcrumb">
        <Link to="/wanted" className="hover:text-ink">{t('wanted.title')}</Link>
        <span aria-hidden>›</span>
        <span>{w.campus.shortName}</span>
        <span aria-hidden>›</span>
        <span className="truncate text-ink-2">{w.title}</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" iconLeft={<Share2 />} onClick={share}>{t('common.share')}</Button>
          {!isOwner && <Button variant="ghost" size="sm" iconLeft={<Flag />} onClick={() => (user ? setReportOpen(true) : navigate(`/login?next=${encodeURIComponent(`/wanted/${w.id}`)}`))}>{t('common.report')}</Button>}
        </span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <article className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {statusBadge}
              {w.scope === 'nationwide' && <Badge variant="info" icon={<Globe />}>{t('wanted.scope.nationwide')}</Badge>}
              {isAdmin && !isOwner && <Badge variant="warning">admin</Badge>}
            </div>
            <h1 className="text-h1 text-ink">{w.title}</h1>
            <p className="text-small text-ink-2">
              {w.campus.city}, {w.campus.state} · {w.campus.shortName} · {t('wanted.detail.posted', { when: formatRelative(w.createdAt) })}
            </p>
          </header>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Fact icon={<Wallet />} label={t('wanted.form.budget')}><Price cents={w.budgetMinCents} maxCents={w.budgetMaxCents} perMonth size="inline" /></Fact>
            <Fact icon={<CalendarDays />} label={t('wanted.form.moveIn')}>
              {formatDateRange(w.moveInFrom, w.moveInTo)}
              {w.flexibleDays > 0 && <span className="text-small text-ink-3"> · {t('wanted.detail.flexible', { n: w.flexibleDays })}</span>}
            </Fact>
            <Fact icon={<CalendarDays />} label={t('wanted.form.moveOut')}>{w.moveOutDate ? formatDate(w.moveOutDate, 'long') : t('wanted.card.openEnded')}</Fact>
            <Fact icon={<Users />} label={t('wanted.form.groupSize')}>
              {groupLabel(t, w.groupSize)} · {bedroomsLabel(t, w.bedroomsMin)}
              {w.genderPref !== 'any' && ` · ${t(`wanted.gender.${w.genderPref}`)}`}
            </Fact>
            <Fact icon={<Sofa />} label={t('wanted.form.furnished')}>{t(`wanted.furnished.${w.furnishedPref}`)}{w.propertyTypes.length > 0 && ` · ${w.propertyTypes.map((p) => t(`wanted.propertyType.${p}`)).join(' / ')}`}</Fact>
            <Fact icon={w.hasPets ? <Dog /> : <Car />} label={t('wanted.detail.extras')}>
              {[w.hasPets ? t('wanted.form.hasPets') : null, w.needsParking ? t('wanted.form.needsParking') : null].filter(Boolean).join(' · ') || t('wanted.detail.none')}
            </Fact>
          </dl>

          <section className="flex flex-col gap-2">
            <h2 className="text-h3 text-ink">{t('wanted.form.areas')}</h2>
            {w.areas.length ? <AreaChips areas={w.areas} max={5} size="md" /> : <p className="text-small text-ink-2">{w.scope === 'nationwide' ? t('wanted.scope.nationwide') : t('wanted.areas.campusDefault', { campus: w.campus.shortName })}</p>}
            {showMap && (
              <MapView center={campusCenter(campus)} zoom={13} height={240} markers={markers} circles={circles} interactive={false} fitToMarkers clusterThreshold={Infinity} className="rounded-card" aria-label={t('wanted.form.areas')} />
            )}
          </section>

          {(w.mustHaves.length > 0 || w.niceToHaves.length > 0) && (
            <section className="flex flex-col gap-3">
              {w.mustHaves.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-h3 text-ink">{t('wanted.form.mustHaves')}</h2>
                  <div className="flex flex-wrap gap-1.5">{w.mustHaves.map((k) => <Chip key={k} variant="accent">{t(`wanted.mustHave.${k}`)}</Chip>)}</div>
                </div>
              )}
              {w.niceToHaves.length > 0 && (
                <div>
                  <h2 className="mb-1.5 text-h3 text-ink">{t('wanted.form.niceToHaves')}</h2>
                  <div className="flex flex-wrap gap-1.5">{w.niceToHaves.map((k) => <Chip key={k}>{t(`wanted.mustHave.${k}`)}</Chip>)}</div>
                </div>
              )}
            </section>
          )}

          {w.description && (
            <section>
              <h2 className="mb-1.5 text-h3 text-ink">{t('wanted.detail.about')}</h2>
              <p className="whitespace-pre-line text-body-lg text-ink">{w.description}</p>
            </section>
          )}

          <section className={cn('flex flex-wrap items-center gap-3 rounded-card bg-sunken p-3 sm:p-4', w.author.trustLevel <= 1 && 'border-b-2 border-warning-soft')}>
            <Avatar src={w.author.avatarUrl} name={w.author.name} size="md" trustLevel={w.author.trustLevel} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-body font-semibold text-ink">
                <span className="truncate">{w.author.name}</span>
                <TrustBadge level={w.author.trustLevel} size="card" showLabel />
              </p>
              <p className="text-small text-ink-2">
                {[w.author.program, t('wanted.detail.memberSince', { date: formatDate(w.author.memberSince, 'long') })].filter(Boolean).join(' · ')}
              </p>
              {w.author.trustLevel <= 1 && <p className="mt-1 text-caption text-warning">{t('wanted.detail.unverifiedWarning')}</p>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button asChild variant="secondary" size="sm"><Link to={`/u/${w.author.id}`}>{t('wanted.detail.viewProfile')}</Link></Button>
            </div>
          </section>
        </article>

        <aside className="lg:sticky lg:top-20 lg:self-start">{isOwner ? ownerRail : hostRail}</aside>
      </div>

      {!isOwner && w.status === 'active' && (
        <div className="fixed inset-x-0 bottom-14 z-layer-sticky flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-2.5 pb-safe lg:hidden">
          <Price cents={w.budgetMinCents} maxCents={w.budgetMaxCents} perMonth size="md" />
          {w.myOffer?.conversationId ? (
            <Button asChild variant="primary" className="ml-auto" iconLeft={<MessageCircle />}><Link to={`/chat/${w.myOffer.conversationId}`}>{t('wanted.match.openChat')}</Link></Button>
          ) : (
            <Button variant="primary" className="ml-auto" iconLeft={<Home />} onClick={() => (user ? setOfferOpen(true) : navigate(`/login?next=${encodeURIComponent(`/wanted/${w.id}`)}`))}>{t('wanted.offer.cta')}</Button>
          )}
        </div>
      )}

      {user && !isOwner && <OfferModal open={offerOpen} onClose={() => setOfferOpen(false)} wanted={w} onOffered={() => invalidate(w.id)} />}
      {user && <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} wantedId={w.id} />}
    </div>
  );
}

