// /listings/:id — DESIGN.md §7.3. Gallery hero, trust strip, facts, calendar, amenities, commute card with StaticMapPreview,
// sticky price rail (联系房东 / 收藏 / 分享 / 举报), owner panel for the host, similar listings, bundle link.
import {
  Accessibility, ArrowUpDown, Bath, Bike, BookOpen, Bus, Car, CigaretteOff, Cigarette, CircleAlert, CookingPot, DollarSign, Dumbbell, Flag, Flame, Footprints,
  Home, LampDesk, Lock, Microwave, Package, PackageOpen, PawPrint, PlugZap, Ruler, Share2, Shirt, ShieldCheck, ShoppingCart, Snowflake, Sofa, Sun, Tv, Users, Utensils,
  WashingMachine, Waves, Wifi, type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AMENITY_ICONS, type Amenity } from '@shared/enums';
import { Badge, Button, Card, Chip, EmptyState, PhotoGallery, Price, Skeleton } from '@/components';
import { StaticMapPreview } from '@/components/map';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getCampusById } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { track } from '@/lib/track';
import { cn } from '@/lib/cn';
import { Head } from '@/app/Head';
import { useShellOptions } from '@/app/shell/shellStore';
import { keys, listingsApi } from '../api';
import { ListingCard, roomsLabel } from '../components/ListingCard';
import { SaveButton } from '../components/SaveButton';
import { TrustStrip } from '../components/TrustStrip';
import { AvailabilityCalendar } from '../components/AvailabilityCalendar';
import { ContactModal, ReportModal, ShareModal } from '../components/DetailModals';
import { OwnerPanel } from '../components/OwnerPanel';
import { StatsModal } from '../components/OwnerDialogs';
import { StatusBadge } from '../components/StatusBadge';
import { markVisited } from './Browse';
import { SecurePaymentCta } from '@/features/billing/components/EscrowCta';
import { NearestStopChip } from '@/features/shuttle/components/NearestStopChip';

const ICONS: Record<string, LucideIcon> = {
  wifi: Wifi, 'washing-machine': WashingMachine, snowflake: Snowflake, flame: Flame, utensils: Utensils, dumbbell: Dumbbell, 'arrow-up-down': ArrowUpDown,
  'shield-check': ShieldCheck, sun: Sun, 'lamp-desk': LampDesk, bike: Bike, package: Package, waves: Waves, 'book-open': BookOpen, bath: Bath, 'cooking-pot': CookingPot,
  microwave: Microwave, tv: Tv, shirt: Shirt, lock: Lock, accessibility: Accessibility, 'shopping-cart': ShoppingCart, 'plug-zap': PlugZap,
};

function tzLabel(timeZone: string, locale: string): string {
  try {
    const part = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      <h2 className="text-h3 text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function Detail() {
  const { id = '' } = useParams();
  const [sp] = useSearchParams();
  const t = useT();
  const { formatMoney, formatDate, formatDateRange, formatDistance, formatRooms, formatArea, formatRelative, formatNumber, intl } = useLocale();
  const { user } = useAuth();
  useShellOptions({ back: true });
  const q = useQuery({ queryKey: keys.detail(id), queryFn: () => listingsApi.detail(id, sp.get('boost')), enabled: !!id, retry: false });
  const l = q.data;
  const isOwner = !!l && !!user && (user.id === l.owner.id || user.role === 'admin');
  const similar = useQuery({ queryKey: keys.similar(id), queryFn: () => listingsApi.similar(id, 3), enabled: !!l && !isOwner });
  const [share, setShare] = useState(false);
  const [report, setReport] = useState(false);
  const [contact, setContact] = useState(false);
  const [stats, setStats] = useState(false);

  useEffect(() => {
    if (l) {
      markVisited(l.id);
      track('listing.view', { entityType: 'listing', entityId: l.id, campusId: l.campusId, src: sp.get('src') ?? undefined });
    }
  }, [l?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) {
    return (
      <div className="mx-auto w-full max-w-detail px-4 lg:px-8" aria-busy="true">
        <Skeleton variant="rect" height={360} className="mt-2 rounded-lg" />
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-3"><Skeleton variant="text" width={360} height={28} /><Skeleton variant="text" lines={4} /></div>
          <Skeleton variant="rect" height={240} />
        </div>
      </div>
    );
  }
  if (q.isError || !l) {
    const notFound = q.error instanceof ApiError && q.error.code === 'NOT_FOUND';
    return (
      <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
        <Head title={t('listings.detail.notFound')} />
        <EmptyState
          icon={notFound ? Home : CircleAlert}
          title={notFound ? t('listings.detail.notFound') : t('error.generic')}
          description={notFound ? t('listings.detail.notFoundHint') : undefined}
          action={notFound ? { label: t('listings.detail.backToBrowse'), to: '/listings' } : { label: t('common.retry'), onClick: () => void q.refetch() }}
        />
      </div>
    );
  }

  const campus = getCampusById(l.campusId);
  const inactive = l.status !== 'active';
  const photos = l.photos.length ? l.photos : l.coverUrl ? [{ id: 'cover', uploadId: '', url: l.coverUrl, sortOrder: 0, caption: null }] : [];
  const subtitle = [
    `${l.city}, ${l.state}`,
    l.commute?.walkMin != null && l.commute.walkMin <= 60 ? t('listings.card.walk', { n: l.commute.walkMin }) : l.distanceToCampusM != null ? t('listings.detail.distanceToCampus', { d: formatDistance(l.distanceToCampusM) }) : null,
    l.commute?.shuttleMin != null ? t('listings.card.shuttle', { n: l.commute.shuttleMin }) : null,
  ].filter(Boolean).join(' · ');
  const chips: { key: string; label: string; icon: LucideIcon }[] = [];
  if (l.furnished !== 'none') chips.push({ key: 'furn', label: t(`listings.furnished.${l.furnished}`), icon: Sofa });
  if (l.utilitiesIncluded) chips.push({ key: 'util', label: t('listings.detail.priceRail.utilitiesIncluded'), icon: PlugZap });
  if (l.petsAllowed) chips.push({ key: 'pets', label: t('listings.detail.pets'), icon: PawPrint });
  if (l.parking !== 'none') chips.push({ key: 'park', label: t(`listings.detail.parking.${l.parking}`), icon: Car });
  if (l.genderPref !== 'any') chips.push({ key: 'gender', label: t(`listings.detail.gender.${l.genderPref}`), icon: Users });
  chips.push({ key: 'type', label: t(`listings.type.${l.listingType}`), icon: Home });

  const facts: { label: string; value: string; icon: LucideIcon }[] = [
    { label: t('listings.wizard.propertyType'), value: `${t(`listings.prop.${l.propertyType}`)} · ${roomsLabel(l, t, formatRooms)}`, icon: Home },
    ...(l.sqft ? [{ label: t('listings.wizard.sqft'), value: formatArea(l.sqft), icon: Ruler }] : []),
    { label: t('listings.wizard.leaseType'), value: t(`listings.lease.${l.leaseType}`), icon: BookOpen },
    { label: t('listings.wizard.minTerm'), value: t('listings.filter.months', { n: l.minTermMonths }), icon: ArrowUpDown },
    { label: t('listings.wizard.deposit'), value: l.depositCents ? formatMoney(l.depositCents) : t('listings.detail.priceRail.noDeposit'), icon: DollarSign },
    { label: t('listings.wizard.utilities'), value: l.utilitiesIncluded ? t('listings.detail.priceRail.utilitiesIncluded') : l.utilitiesEstCents ? t('listings.detail.priceRail.utilitiesEst', { amount: formatMoney(l.utilitiesEstCents) }) : (l.utilitiesNote ?? '—'), icon: PlugZap },
  ];

  const contactCta = isOwner ? null : !user ? (
    <Button asChild size="lg" fullWidth><Link to={`/login?next=${encodeURIComponent(`/listings/${l.id}`)}`}>{t('common.messageHost')}</Link></Button>
  ) : (
    <Button size="lg" fullWidth onClick={() => setContact(true)} disabled={inactive}>{t('common.messageHost')}</Button>
  );

  return (
    <div className="mx-auto w-full max-w-detail px-4 pb-24 lg:px-8 lg:pb-0">
      <Head title={l.title} description={subtitle} />
      <div className="flex flex-wrap items-center justify-between gap-2 py-3">
        <nav aria-label="breadcrumb" className="flex min-w-0 items-center gap-1.5 text-small text-ink-3">
          <Link to="/listings" className="hover:text-ink">{t('listings.detail.breadcrumb')}</Link>
          <span aria-hidden>›</span>
          <Link to={`/listings?campus=${l.campusId}`} className="hover:text-ink">{l.campus?.shortName ?? campus?.shortName}</Link>
          <span aria-hidden>›</span>
          <span className="truncate text-ink-2">{l.neighborhood ?? l.city}</span>
        </nav>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" iconLeft={<Share2 className="size-4" />} onClick={() => setShare(true)}>{t('common.share')}</Button>
          {!isOwner && <SaveButton id={l.id} saved={l.saved} variant="rail" />}
          {!isOwner && <Button variant="ghost" size="sm" iconLeft={<Flag className="size-4" />} onClick={() => setReport(true)}>{t('common.report')}</Button>}
        </div>
      </div>

      {(isOwner || l.sponsored) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {isOwner && <StatusBadge status={l.status} size="md" />}
          {l.moderationStatus === 'hidden' && <p className="text-small text-danger">{t('listings.detail.hiddenNote')}</p>}
          {l.moderationStatus === 'flagged' && <p className="text-small text-warning">{t('listings.detail.flaggedNote')}</p>}
        </div>
      )}

      {photos.length > 0 ? (
        <PhotoGallery photos={photos.map((p, i) => ({ id: p.id, src: p.url, alt: t('listings.detail.photoAlt', { title: l.title, index: i + 1 }) }))} layout="hero" aspect="4/3" className={cn(inactive && 'opacity-80 grayscale')} />
      ) : (
        <div className="flex aspect-[2/1] items-center justify-center rounded-lg bg-sunken text-ink-4"><Home className="size-12" strokeWidth={1.25} aria-hidden /></div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <h1 className="text-h1-sm text-ink md:text-h1">{l.title}</h1>
        <p className="text-small text-ink-2">{subtitle}</p>
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => <Chip key={c.key} icon={<c.icon className="size-3.5" aria-hidden />}>{c.label}</Chip>)}
          {l.isVerifiedListing && <Chip variant="accent" icon={<ShieldCheck className="size-3.5" aria-hidden />}>{t('listings.card.verifiedListing')}</Chip>}
          {l.sponsored && <Badge variant="boosted" />}
        </div>
      </div>

      <TrustStrip user={l.owner} onReport={isOwner ? undefined : () => setReport(true)} className="mt-4" />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section title={t('listings.detail.facts')}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="flex items-start gap-2">
                  <f.icon className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0"><dt className="text-caption text-ink-3">{f.label}</dt><dd className="text-body text-ink">{f.value}</dd></div>
                </div>
              ))}
            </dl>
          </Section>

          {l.description && (
            <Section title={t('listings.detail.description')}>
              <p className="whitespace-pre-line text-body-lg text-ink">{l.description}</p>
            </Section>
          )}

          <Section title={t('listings.detail.availability')}>
            <AvailabilityCalendar from={l.availableFrom} to={l.availableTo} ranges={l.availability} />
            {campus && <p className="text-caption text-ink-3">{tzLabel(campus.timezone, intl)}</p>}
          </Section>

          {l.amenities.length > 0 && (
            <Section title={t('listings.detail.amenities')}>
              <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {l.amenities.map((a) => {
                  const Icon = ICONS[AMENITY_ICONS[a as Amenity] ?? ''] ?? Sun;
                  return <li key={a} className="flex items-center gap-2 text-body text-ink"><Icon className="size-4 text-ink-2" strokeWidth={1.75} aria-hidden />{t(`listings.amenity.${a}`)}</li>;
                })}
              </ul>
            </Section>
          )}

          <Section title={t('listings.detail.location')}>
            <Card padding="none" className="overflow-hidden">
              <StaticMapPreview lat={l.lat} lng={l.lng} label={formatMoney(l.priceCents)} height={280} campus={campus ? { lat: campus.lat, lng: campus.lng, shortName: campus.shortName } : null} aria-label={t('listings.detail.location')} />
              <div className="flex flex-col gap-3 p-4">
                <p className="text-body text-ink">{l.addressDisplay}</p>
                <p className="text-small text-ink-3">{l.hideExactAddress && !l.addressLine1 ? t('listings.detail.locationApprox') : l.addressLine1 && isOwner ? t('listings.detail.locationExact') : null}</p>
                <div className="grid grid-cols-3 gap-2 rounded-card bg-sunken p-3 text-center" aria-label={t('listings.detail.commute')}>
                  {([['walk', Footprints, l.commute?.walkMin], ['bike', Bike, l.commute?.bikeMin], ['shuttle', Bus, l.commute?.shuttleMin]] as const).map(([k, Icon, v]) => (
                    <div key={k} className="flex flex-col items-center gap-0.5">
                      <Icon className="size-4 text-ink-3" aria-hidden />
                      <span className="text-caption text-ink-3">{t(`listings.detail.commute${k[0]!.toUpperCase()}${k.slice(1)}`)}</span>
                      <span className="text-body font-semibold tabular-nums text-ink">{v != null ? t('listings.detail.commuteMin', { n: v }) : '—'}</span>
                    </div>
                  ))}
                </div>
                <p className="text-small text-ink-2">
                  {l.distanceToCampusM != null && t('listings.detail.distanceToCampus', { d: formatDistance(l.distanceToCampusM) })}
                  {l.commute?.nearestStop ? ` · ${t('listings.detail.nearestStop', { name: l.commute.nearestStop.name, d: formatDistance(l.commute.nearestStop.distanceM) })}` : l.commute && l.commute.shuttleMin == null ? ` · ${t('listings.detail.commuteNone')}` : ''}
                </p>
                {l.commute?.nearestStop && <NearestStopChip campusId={l.campusId} stop={l.commute.nearestStop} distanceM={l.commute.nearestStop.distanceM} radiusM={3000} size="md" className="self-start" />}
                <Button asChild variant="ghost" size="sm" className="self-start"><Link to={`/map?focus=listing:${l.id}&lat=${l.lat}&lng=${l.lng}`}>{t('listings.detail.openMap')}</Link></Button>
              </div>
            </Card>
          </Section>

          <Section title={t('listings.detail.roommates')}>
            <ul className="flex flex-wrap gap-2">
              <Chip icon={<Users className="size-3.5" aria-hidden />}>{l.roommatesCount ? t('listings.detail.roommatesCount', { n: l.roommatesCount }) : t('listings.detail.roommatesNone')}</Chip>
              <Chip>{t(`listings.detail.gender.${l.genderPref}`)}</Chip>
              <Chip icon={<PawPrint className="size-3.5" aria-hidden />}>{l.petsAllowed ? t('listings.detail.pets') : t('listings.detail.noPets')}</Chip>
              <Chip icon={l.smokingAllowed ? <Cigarette className="size-3.5" aria-hidden /> : <CigaretteOff className="size-3.5" aria-hidden />}>{l.smokingAllowed ? t('listings.detail.smoking') : t('listings.detail.noSmoking')}</Chip>
              <Chip icon={<Car className="size-3.5" aria-hidden />}>{t(`listings.detail.parking.${l.parking}`)}</Chip>
            </ul>
          </Section>

          {l.bundle && (
            <Section title={t('listings.detail.bundle')}>
              <Card variant="sunken" padding="md" className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><PackageOpen className="size-6 text-ink-2" aria-hidden /><div><p className="text-body font-semibold text-ink">{l.bundle.title}</p><p className="text-small text-ink-2">{t('listings.detail.bundleHint', { n: l.bundle.itemCount })}</p></div></div>
                <Button asChild variant="secondary" size="sm"><Link to={`/market/bundles/${l.bundle.id}`}>{t('listings.detail.bundleLink')}</Link></Button>
              </Card>
            </Section>
          )}

          {!isOwner && similar.data && similar.data.length > 0 && (
            <Section title={t('listings.detail.similar')}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{similar.data.map((s) => <ListingCard key={s.id} listing={s} />)}</div>
            </Section>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 flex flex-col gap-4">
            {isOwner ? (
              <OwnerPanel listing={l} onStats={() => setStats(true)} />
            ) : (
              <Card padding="lg" className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-2">
                    <Price cents={l.priceCents} perMonth size="lg" />
                    {inactive && <StatusBadge status={l.status} />}
                  </div>
                  <p className="text-small text-ink-3">{l.depositCents ? t('listings.detail.priceRail.deposit', { amount: formatMoney(l.depositCents) }) : t('listings.detail.priceRail.noDeposit')}{l.utilitiesIncluded ? ` · ${t('listings.detail.priceRail.utilitiesIncluded')}` : ''}</p>
                  <p className="text-small text-ink-2">{formatDateRange(l.availableFrom, l.availableTo, { months: true })}{l.flexibleDates ? ` · ${t('listings.detail.priceRail.flexible')}` : ''} · {t('listings.detail.priceRail.minTerm', { n: l.minTermMonths })}</p>
                </div>
                {contactCta}
                {/* billing's 安心付 entry: eligibility-aware (state rollout, payee verification, existing payment) */}
                <SecurePaymentCta listingId={l.id} />
                <hr className="border-line" />
                <p className="text-small text-ink-3">{t('listings.detail.priceRail.stats', { views: formatNumber(l.viewCount), saves: formatNumber(l.saveCount), ago: l.publishedAt ? formatRelative(l.publishedAt) : '—' })}</p>
              </Card>
            )}
          </div>
        </aside>
      </div>

      {/* mobile owner panel + sticky bottom bar */}
      {isOwner && <div className="mt-8 lg:hidden"><OwnerPanel listing={l} onStats={() => setStats(true)} /></div>}
      {!isOwner && (
        <div className="fixed inset-x-0 bottom-14 z-layer-nav flex items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 pb-safe lg:hidden">
          <div className="flex min-w-0 flex-col"><Price cents={l.priceCents} perMonth size="md" /><span className="truncate text-caption text-ink-3">{formatDate(l.availableFrom, 'monthDay')}{l.availableTo ? ` – ${formatDate(l.availableTo, 'monthDay')}` : ''}</span></div>
          <div className="ml-auto w-44">{contactCta}</div>
        </div>
      )}

      <ShareModal listing={l} open={share} onClose={() => setShare(false)} />
      <ReportModal listingId={l.id} open={report} onClose={() => setReport(false)} />
      <ContactModal listing={l} open={contact} onClose={() => setContact(false)} />
      <StatsModal listing={l} open={stats} onClose={() => setStats(false)} />
    </div>
  );
}
