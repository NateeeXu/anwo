// /buddy/:id — detail: date block + h1, when/where facts, description, schedule, members, safety card, organizer trust strip,
// join flow (open → joined / pending → 进入群聊), host management (requests, edit, close/reopen/complete/cancel/delete), share, calendar.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  CalendarPlus, Check, CircleAlert, Clock, DollarSign, Eye, Flag, Globe, Lock, MapPin, MessageCircle, MoreHorizontal, Navigation, Pencil, Rocket, Share2, ShieldAlert, Users, X,
} from 'lucide-react';
import { ReportReason } from '@shared/enums';
import { Avatar, Badge, Button, Card, Checkbox, Chip, DropdownMenu, EmptyState, Modal, Select, Skeleton, Tabs, Textarea, TrustBadge } from '@/components';
import { StaticMapPreview } from '@/components/map';
import { BoostSheet } from '@/features/billing/components/BoostSheet';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { ApiError, isApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCampus, getCampusById } from '@/lib/campus';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useBuddyDetail, useBuddyMutations, type BuddyDetail as BuddyDetailDto, type BuddyMember } from '../api';
import { BuddyTypeIcon, SafetyCard, StatusBadge, googleCalendarUrl, useBuddyTime } from '../shared';

function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-sunken text-ink-2" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <dt className="text-caption text-ink-3">{label}</dt>
        <dd className="text-body text-ink">{children}</dd>
      </div>
    </div>
  );
}

function MemberRow({ m, isHostView, onAction, busy }: { m: BuddyMember; isHostView: boolean; onAction?: (action: 'approve' | 'decline' | 'remove') => void; busy?: boolean }) {
  const t = useT();
  return (
    <li className="flex items-center gap-3 py-2">
      <Link to={`/u/${m.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-sm">
        <Avatar src={m.avatarUrl} name={m.name} size="sm" trustLevel={m.trustLevel} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-small font-semibold text-ink">
            <span className="truncate">{m.name}</span>
            <TrustBadge level={m.trustLevel} size="inline" />
            {m.role === 'host' && (
              <Badge variant="neutral" size="sm">
                {t('buddy.card.host')}
              </Badge>
            )}
          </span>
          {m.note && isHostView && <span className="line-clamp-2 text-caption text-ink-2">「{m.note}」</span>}
          {!m.note && m.program && <span className="block truncate text-caption text-ink-3">{m.program}</span>}
        </span>
      </Link>
      {onAction && m.status === 'pending' && (
        <span className="flex shrink-0 gap-1">
          <Button size="sm" variant="primary" iconLeft={<Check />} loading={busy} onClick={() => onAction('approve')}>
            {t('buddy.detail.approve')}
          </Button>
          <Button size="sm" variant="ghost" iconOnly aria-label={t('buddy.detail.decline')} disabled={busy} onClick={() => onAction('decline')}>
            <X />
          </Button>
        </span>
      )}
      {onAction && m.status === 'joined' && m.role !== 'host' && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction('remove')}>
          {t('buddy.detail.remove')}
        </Button>
      )}
    </li>
  );
}

export default function BuddyDetail() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const navigate = useNavigate();
  const { user, status: authStatus } = useAuth();
  const { formatMoney, formatRelative, formatNumber } = useLocale();
  const { campus: currentCampus } = useCampus();
  const [params, setParams] = useSearchParams();
  const detail = useBuddyDetail(id, params.get('boost'));
  const m = useBuddyMutations(id);
  const post = detail.data;
  const time = useBuddyTime(post?.campusId);

  const [joinOpen, setJoinOpen] = useState(false);
  const [joinNote, setJoinNote] = useState('');
  const [agree, setAgree] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [boostOpen, setBoostOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string>('scam');
  const [reportDetails, setReportDetails] = useState('');
  const [memberTab, setMemberTab] = useState<'members' | 'requests'>(params.get('tab') === 'requests' ? 'requests' : 'members');
  const [busyUser, setBusyUser] = useState<string | null>(null);

  useEffect(() => {
    if (params.get('join') === '1' && post && authStatus === 'authed') {
      setJoinOpen(true);
      const next = new URLSearchParams(params);
      next.delete('join');
      setParams(next, { replace: true });
    }
  }, [params, post, authStatus, setParams]);

  useEffect(() => {
    if (post) track('buddy.view', { entityType: 'buddy_post', entityId: post.id, type: post.type });
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const campus = post ? getCampusById(post.campusId) : currentCampus;
  const isHost = !!post && !!user && (post.author.id === user.id || user.role === 'admin');
  const mine = post?.myMembership ?? null;
  const joined = mine?.status === 'joined' && mine.role !== 'host';
  const pending = mine?.status === 'pending';
  const required = post ? (post.verifiedOnly ? Math.max(1, post.minTrustLevel) : 1) : 1;
  const trustBlocked = !!user && user.role !== 'admin' && (user.trustLevel ?? 0) < required;
  const isFull = !!post && (post.status === 'full' || post.memberCount >= post.maxMembers);
  const isOpen = post?.status === 'open';

  const occurrences = useMemo(() => {
    if (!post) return [];
    if (post.events.length) return post.events.filter((e) => e.status !== 'cancelled').map((e) => ({ id: e.id, startsAt: e.startsAt, endsAt: e.endsAt, locationName: e.locationName, status: e.status }));
    if (post.startsAt) return [{ id: post.id, startsAt: post.startsAt, endsAt: post.endsAt, locationName: post.locationName, status: 'scheduled' as const }];
    return [];
  }, [post]);
  const nextOccurrence = occurrences.find((o) => new Date(o.endsAt ?? o.startsAt).getTime() >= Date.now()) ?? occurrences[0];

  const doJoin = async () => {
    try {
      const r = await m.join.mutateAsync(joinNote.trim() || undefined);
      setJoinOpen(false);
      setJoinNote('');
      if (r.membership.status === 'joined') {
        toast.success(t('buddy.toast.joined'), undefined, r.conversationId ? { label: t('buddy.detail.openChat'), onClick: () => navigate(`/chat/${r.conversationId}`) } : undefined);
      } else toast.success(t('buddy.toast.requested'));
    } catch (e) {
      if (isApiError(e, 'TRUST_REQUIRED')) {
        toast.error(errorMessage(t, e));
        navigate(required >= 2 ? `/verify?next=${encodeURIComponent(location.pathname)}` : `/verify-email?reason=join&next=${encodeURIComponent(location.pathname)}`);
      } else toast.error(errorMessage(t, e));
    }
  };
  const doLeave = async () => {
    try {
      await m.leave.mutateAsync();
      setLeaveOpen(false);
      toast.success(t('buddy.toast.left'));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };
  const doStatus = async (action: 'close' | 'cancel' | 'reopen' | 'complete', reason?: string) => {
    try {
      await m.status.mutateAsync({ action, reason });
      toast.success(t(`buddy.toast.${action === 'close' ? 'closed' : action === 'cancel' ? 'cancelled' : action === 'reopen' ? 'reopened' : 'completed'}`));
      setCancelOpen(false);
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };
  const doDelete = async () => {
    try {
      await m.remove.mutateAsync();
      toast.success(t('buddy.toast.deleted'));
      navigate('/buddy/mine', { replace: true });
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };
  const doMember = async (userId: string, action: 'approve' | 'decline' | 'remove') => {
    setBusyUser(userId);
    try {
      await m.memberAction.mutateAsync({ userId, action });
      toast.success(t(`buddy.toast.${action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'removed'}`));
    } catch (e) {
      toast.error(errorMessage(t, e));
    } finally {
      setBusyUser(null);
    }
  };
  const doReport = async () => {
    try {
      await m.report.mutateAsync({ reason: reportReason, details: reportDetails.trim() || undefined });
      setReportOpen(false);
      setReportDetails('');
      toast.success(t('buddy.toast.reported'));
    } catch (e) {
      toast.error(errorMessage(t, e));
    }
  };
  const share = async () => {
    const url = `${location.origin}/buddy/${id}`;
    track('buddy.share', { entityType: 'buddy_post', entityId: id });
    try {
      if (navigator.share) await navigator.share({ title: post?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t('buddy.detail.copied'));
      }
    } catch {
      /* dismissed */
    }
  };

  if (detail.isPending) {
    return (
      <div className="mx-auto w-full max-w-reading px-4 lg:px-8" aria-busy>
        <div className="flex gap-4 py-4">
          <Skeleton variant="rect" width={72} height={88} />
          <div className="flex-1">
            <Skeleton variant="text" lines={3} />
          </div>
        </div>
        <Skeleton variant="rect" height={200} className="mt-4" />
      </div>
    );
  }
  if (detail.isError || !post) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <div className="mx-auto w-full max-w-reading px-4 lg:px-8">
        <EmptyState icon={CircleAlert} title={notFound ? t('error.NOT_FOUND') : t('error.generic')} action={{ label: notFound ? t('buddy.title') : t('common.retry'), onClick: () => (notFound ? navigate('/buddy') : detail.refetch()) }} />
      </div>
    );
  }

  const parts = nextOccurrence ? time.parts(nextOccurrence.startsAt) : null;
  const whenText = nextOccurrence ? time.range(nextOccurrence.startsAt, nextOccurrence.endsAt, post.isAllDay) : t('buddy.card.noTime');
  const hostUnverified = post.author.trustLevel < 2;
  const pendingMembers = post.members.filter((x) => x.status === 'pending');
  const joinedMembers = post.members.filter((x) => x.status === 'joined');
  const visibleMembers = post.canSeeMembers ? joinedMembers : post.members;
  const calendarOcc = nextOccurrence;
  const gcal = calendarOcc ? googleCalendarUrl({ title: post.title, startsAt: calendarOcc.startsAt, endsAt: calendarOcc.endsAt, location: calendarOcc.locationName ?? post.locationName, details: post.description.slice(0, 500), url: `${location.origin}/buddy/${post.id}` }) : null;

  // ------------------------------------------------------------ CTA
  let cta: React.ReactNode;
  if (isHost) {
    cta = (
      <div className="flex flex-wrap gap-2">
        {post.conversationId && (
          <Button asChild variant="primary" iconLeft={<MessageCircle />}>
            <Link to={`/chat/${post.conversationId}`}>{t('buddy.detail.openChat')}</Link>
          </Button>
        )}
        <Button asChild variant="secondary" iconLeft={<Pencil />}>
          <Link to={`/buddy/${post.id}/edit`}>{t('buddy.detail.edit')}</Link>
        </Button>
        <DropdownMenu
          label={t('buddy.detail.manage')}
          align="end"
          trigger={
            <Button variant="secondary" iconOnly aria-label={t('buddy.detail.manage')}>
              <MoreHorizontal />
            </Button>
          }
          items={[
            ...(post.status === 'open' || post.status === 'full' ? [{ label: t('buddy.detail.close'), icon: <Lock />, onSelect: () => doStatus('close') }] : []),
            ...(post.status === 'closed' ? [{ label: t('buddy.detail.reopen'), icon: <Users />, onSelect: () => doStatus('reopen') }] : []),
            ...(post.status !== 'cancelled' && post.status !== 'removed' ? [{ label: t('buddy.detail.complete'), icon: <Check />, onSelect: () => doStatus('complete') }] : []),
            ...((post.status === 'open' || post.status === 'full') && post.author.id === user?.id && !post.sponsored ? [{ label: t('buddy.detail.boost'), icon: <Rocket />, onSelect: () => setBoostOpen(true) }] : []),
            'separator' as const,
            ...(post.status === 'open' || post.status === 'full' ? [{ label: t('buddy.detail.cancel'), icon: <X />, onSelect: () => setCancelOpen(true) }] : []),
            { label: t('buddy.detail.delete'), icon: <X />, danger: true, onSelect: () => setDeleteOpen(true) },
          ]}
        />
      </div>
    );
  } else if (joined) {
    cta = (
      <div className="flex flex-wrap gap-2">
        {post.conversationId && (
          <Button asChild variant="primary" iconLeft={<MessageCircle />}>
            <Link to={`/chat/${post.conversationId}`}>{t('buddy.detail.openChat')}</Link>
          </Button>
        )}
        <Button variant="ghost" iconLeft={<Check />} disabled>
          {t('buddy.detail.joined')}
        </Button>
        <Button variant="ghost" onClick={() => setLeaveOpen(true)}>
          {t('buddy.detail.leave')}
        </Button>
      </div>
    );
  } else if (pending) {
    cta = (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled iconLeft={<Clock />}>
          {t('buddy.detail.pending')}
        </Button>
        <Button variant="ghost" onClick={() => setLeaveOpen(true)}>
          {t('buddy.detail.leave')}
        </Button>
      </div>
    );
  } else if (authStatus !== 'authed') {
    cta = (
      <Button asChild variant="primary">
        <Link to={`/login?next=${encodeURIComponent(`/buddy/${post.id}?join=1`)}`}>{t('buddy.detail.loginToJoin')}</Link>
      </Button>
    );
  } else if (post.status === 'cancelled') {
    cta = <p className="text-small text-ink-2">{t('buddy.detail.cancelled')}</p>;
  } else if (isFull) {
    cta = (
      <div>
        <Button variant="secondary" disabled>
          {t('buddy.detail.full')}
        </Button>
        <p className="mt-1 text-caption text-ink-3">{t('buddy.detail.fullHint')}</p>
      </div>
    );
  } else if (!isOpen) {
    cta = <p className="text-small text-ink-2">{t('buddy.detail.notOpen')}</p>;
  } else if (trustBlocked) {
    cta = (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled>
          {post.requiresApproval ? t('buddy.detail.requestJoin') : t('buddy.detail.join')}
        </Button>
        <span className="text-small text-ink-2">{t('buddy.detail.verifiedOnlyBlocked', { level: required })}</span>
        <Button asChild variant="secondary" size="sm">
          <Link to={required >= 2 ? `/verify?next=${encodeURIComponent(`/buddy/${post.id}`)}` : `/verify-email?reason=join&next=${encodeURIComponent(`/buddy/${post.id}`)}`}>{t('buddy.detail.goVerify')}</Link>
        </Button>
      </div>
    );
  } else {
    cta = (
      <Button variant="primary" iconLeft={<Users />} onClick={() => setJoinOpen(true)}>
        {post.requiresApproval ? t('buddy.detail.requestJoin') : t('buddy.detail.join')}
      </Button>
    );
  }

  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={post.title} description={post.description.slice(0, 160)} />
      {post.moderationStatus === 'hidden' && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-card border border-line bg-sunken px-4 py-3 text-small text-ink-2">
          <ShieldAlert size={16} aria-hidden /> {t('buddy.detail.hiddenByAdmin')}
        </div>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ------------------------------------------------ main column */}
        <div className="min-w-0">
          <header className="flex gap-4">
            <div className={cn('flex w-[72px] shrink-0 flex-col items-center justify-center rounded-card py-3 text-center', parts?.isToday ? 'bg-accent-soft text-accent-text-strong' : 'bg-sunken text-ink')} aria-hidden>
              {parts ? (
                <>
                  <span className="text-caption font-medium leading-none">{parts.month}</span>
                  <span className="tnum text-display leading-none">{parts.day}</span>
                  <span className="mt-1 text-caption text-ink-3">{parts.weekday}</span>
                </>
              ) : (
                <BuddyTypeIcon type={post.type} size={28} className="text-ink-3" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-caption text-ink-2">
                <Chip size="sm" icon={<BuddyTypeIcon type={post.type} size={12} />}>
                  {t(`buddy.type.${post.type}`)}
                </Chip>
                <StatusBadge status={post.status} />
                {post.sponsored && <Badge variant="boosted" size="sm" />}
                {post.requiresApproval && (
                  <Badge variant="neutral" size="sm">
                    {t('buddy.card.approval')}
                  </Badge>
                )}
                {campus && <span>{campus.shortName}</span>}
              </div>
              <h1 className="text-h1 text-ink">{post.title}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-3">
                <span className="inline-flex items-center gap-1">
                  <Eye size={14} aria-hidden /> {t('buddy.detail.views', { n: formatNumber(post.viewCount) })}
                </span>
                <span>{t('buddy.detail.posted', { time: formatRelative(post.createdAt) })}</span>
              </p>
            </div>
          </header>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {cta}
            <span className="ml-auto flex items-center gap-1">
              {gcal && (
                <DropdownMenu
                  label={t('buddy.detail.addToCalendar')}
                  align="end"
                  trigger={
                    <Button variant="ghost" size="sm" iconLeft={<CalendarPlus />}>
                      {t('buddy.detail.addToCalendar')}
                    </Button>
                  }
                  items={[
                    { label: t('buddy.detail.googleCalendar'), icon: <Globe />, onSelect: () => { track('buddy.calendar_export', { entityId: post.id, target: 'google' }); window.open(gcal, '_blank', 'noopener'); } },
                    { label: t('buddy.detail.downloadIcs'), icon: <CalendarPlus />, onSelect: () => { track('buddy.calendar_export', { entityId: post.id, target: 'ics' }); window.location.assign(`/api/buddy/posts/${post.id}/calendar.ics`); } },
                  ]}
                />
              )}
              <Button variant="ghost" size="sm" iconOnly aria-label={t('buddy.detail.share')} onClick={share}>
                <Share2 />
              </Button>
              {!isHost && (
                <Button variant="ghost" size="sm" iconOnly aria-label={t('buddy.detail.report')} onClick={() => (authStatus === 'authed' ? setReportOpen(true) : navigate(`/login?next=${encodeURIComponent(`/buddy/${post.id}`)}`))}>
                  <Flag />
                </Button>
              )}
            </span>
          </div>

          {/* facts */}
          <dl className="mt-6 grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2">
            <Fact icon={<Clock size={16} aria-hidden />} label={t('buddy.detail.when')}>
              {whenText}
              {time.tzDiffers && nextOccurrence && <span className="ml-1 text-caption text-ink-3">{time.tzShort}</span>}
              {occurrences.length > 1 && <span className="block text-caption text-ink-3">{t('buddy.detail.scheduleHint', { n: occurrences.length })}</span>}
            </Fact>
            <Fact icon={<MapPin size={16} aria-hidden />} label={t('buddy.detail.where')}>
              {post.locationName ?? '—'}
            </Fact>
            {post.destinationName && (
              <Fact icon={<Navigation size={16} aria-hidden />} label={t('buddy.detail.destination')}>
                {post.destinationName}
              </Fact>
            )}
            <Fact icon={<Users size={16} aria-hidden />} label={t('buddy.detail.members')}>
              {t('buddy.detail.membersCount', { n: post.memberCount, max: post.maxMembers })}
              {post.memberCount < post.maxMembers && isOpen && <span className="ml-2 text-caption text-ink-3">{t('buddy.card.spots', { n: post.maxMembers - post.memberCount })}</span>}
            </Fact>
            <Fact icon={<Globe size={16} aria-hidden />} label={t('buddy.detail.languages')}>
              <span className="flex flex-wrap gap-1">
                {post.languages.map((l) => (
                  <Chip key={l} size="sm">
                    {t(`buddy.lang.${l}`)}
                  </Chip>
                ))}
              </span>
            </Fact>
            <Fact icon={<DollarSign size={16} aria-hidden />} label={t('buddy.detail.cost')}>
              {post.costSplitCents ? t('buddy.detail.costNote', { amount: formatMoney(post.costSplitCents) }) : t('buddy.detail.free')}
            </Fact>
            {post.verifiedOnly && (
              <div className="flex items-center gap-2 text-small text-ink-2 sm:col-span-2">
                <Lock size={14} aria-hidden /> {t('buddy.detail.verifiedOnlyHint', { level: required })}
              </div>
            )}
          </dl>

          {/* map */}
          {(post.lat != null && post.lng != null) && (
            <div className="mt-4 overflow-hidden rounded-card border border-line">
              <StaticMapPreview
                lat={post.destLat ?? post.lat}
                lng={post.destLng ?? post.lng}
                label={post.destinationName ? post.destinationName.slice(0, 18) : post.locationName?.slice(0, 18)}
                kind="buddy"
                height={200}
                campus={post.destLat != null ? { lat: post.lat, lng: post.lng, shortName: post.locationName ?? '' } : campus ? { lat: campus.lat, lng: campus.lng, shortName: campus.shortName } : null}
                aria-label={t('buddy.detail.mapAria', { title: post.title })}
              />
            </div>
          )}

          {/* description */}
          <section className="mt-8">
            <h2 className="text-h3 text-ink">{t('buddy.detail.description')}</h2>
            {post.description ? (
              <div className="mt-2 whitespace-pre-line text-body text-ink-2">{post.description}</div>
            ) : (
              <p className="mt-2 text-body text-ink-3">{t('buddy.detail.noDescription')}</p>
            )}
          </section>

          {/* schedule */}
          {occurrences.length > 1 && (
            <section className="mt-8">
              <h2 className="text-h3 text-ink">{t('buddy.detail.schedule')}</h2>
              <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-surface">
                {occurrences.map((o) => {
                  const p = time.parts(o.startsAt);
                  return (
                    <li key={o.id} className={cn('flex items-center gap-3 px-4 py-2.5 text-small', p.isPast && 'text-ink-3')}>
                      <span className="tnum min-w-[7.5rem] shrink-0 whitespace-nowrap text-ink">{time.dayLabel(o.startsAt, { withWeekday: true })}</span>
                      <span className="tnum text-ink-2">{time.range(o.startsAt, o.endsAt, post.isAllDay).replace(/^.*?(\d{1,2}:\d{2})/, '$1')}</span>
                      {o.locationName && o.locationName !== post.locationName && <span className="truncate text-ink-3">· {o.locationName}</span>}
                      {o.status === 'done' && <Badge variant="neutral" size="sm" className="ml-auto">{t('buddy.card.closed')}</Badge>}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* members */}
          <section className="mt-8">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-h3 text-ink">{t('buddy.detail.members')}</h2>
              <span className="tnum text-small text-ink-2">{t('buddy.detail.membersCount', { n: post.memberCount, max: post.maxMembers })}</span>
            </div>
            {isHost && post.requiresApproval && (
              <Tabs
                className="mt-2"
                variant="pill"
                items={[
                  { key: 'members', label: t('buddy.detail.members'), count: joinedMembers.length },
                  { key: 'requests', label: t('buddy.detail.requests'), count: pendingMembers.length },
                ]}
                value={memberTab}
                onChange={setMemberTab}
              />
            )}
            {memberTab === 'requests' && isHost ? (
              pendingMembers.length ? (
                <ul className="mt-2 divide-y divide-line">
                  {pendingMembers.map((x) => (
                    <MemberRow key={x.id} m={x} isHostView busy={busyUser === x.id} onAction={(a) => doMember(x.id, a)} />
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-small text-ink-3">{t('buddy.detail.noRequests')}</p>
              )
            ) : (
              <>
                <ul className="mt-2 divide-y divide-line">
                  {visibleMembers.map((x) => (
                    <MemberRow key={x.id} m={x} isHostView={isHost} busy={busyUser === x.id} onAction={isHost ? (a) => doMember(x.id, a) : undefined} />
                  ))}
                </ul>
                {!post.canSeeMembers && post.memberCount > visibleMembers.length && <p className="mt-2 text-caption text-ink-3">{t('buddy.detail.membersHidden')}</p>}
              </>
            )}
          </section>
        </div>

        {/* ------------------------------------------------ rail */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          {post.coverUrl && (
            <img src={post.coverUrl} alt="" className="aspect-video w-full rounded-card border border-line object-cover dark:brightness-[.92]" loading="lazy" />
          )}
          {/* organizer trust strip (DESIGN §4.6) */}
          <Card variant="sunken" padding="md" className={cn('flex flex-col gap-3', hostUnverified && 'border-b-2 border-b-warning-soft')}>
            <p className="text-caption text-ink-3">{t('buddy.detail.organizer')}</p>
            <Link to={`/u/${post.author.id}`} className="flex items-center gap-3 rounded-sm">
              <Avatar src={post.author.avatarUrl} name={post.author.name} size="md" trustLevel={post.author.trustLevel} />
              <span className="min-w-0">
                <span className="block truncate text-body font-semibold text-ink">{post.author.name}</span>
                <TrustBadge level={post.author.trustLevel} size="card" />
              </span>
            </Link>
            {post.author.program && <p className="text-small text-ink-2">{post.author.program}</p>}
            <Button asChild variant="secondary" size="sm">
              <Link to={`/u/${post.author.id}`}>{t('buddy.detail.viewProfile')}</Link>
            </Button>
            {hostUnverified && (
              <p className="flex items-start gap-1.5 text-caption text-ink-2">
                <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden /> {t('buddy.detail.unverifiedHost')}
              </p>
            )}
          </Card>
          <SafetyCard />
        </aside>
      </div>

      {/* ------------------------------------------------ dialogs */}
      <Modal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title={post.requiresApproval ? t('buddy.detail.requestJoin') : t('buddy.detail.join')}
        description={post.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setJoinOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" loading={m.join.isPending} disabled={!agree} onClick={doJoin}>
              {post.requiresApproval ? t('buddy.detail.requestJoin') : t('buddy.detail.join')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <SafetyCard compact />
          <Textarea label={t('buddy.detail.joinNote')} placeholder={t('buddy.detail.joinNotePlaceholder')} rows={2} maxLength={300} showCount value={joinNote} onChange={(e) => setJoinNote(e.target.value)} />
          <Checkbox label={t('buddy.detail.joinAgree')} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        </div>
      </Modal>

      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title={t('buddy.detail.leaveConfirm', { title: post.title })} description={t('buddy.detail.leaveConfirmHint')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setLeaveOpen(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={m.leave.isPending} onClick={doLeave}>{t('buddy.detail.leave')}</Button></>} />

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={t('buddy.detail.cancelConfirm', { title: post.title })} description={t('buddy.detail.cancelConfirmHint')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setCancelOpen(false)}>{t('common.back')}</Button><Button variant="danger" loading={m.status.isPending} onClick={() => doStatus('cancel', cancelReason.trim() || undefined)}>{t('buddy.detail.cancel')}</Button></>}>
        <Textarea label={t('buddy.detail.cancelReason')} rows={2} maxLength={300} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
      </Modal>

      {isHost && <BoostSheet open={boostOpen} onClose={() => setBoostOpen(false)} entityType="buddy_post" entityId={post.id} surface="owner_panel" />}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('buddy.detail.deleteConfirm')} description={t('buddy.detail.deleteConfirmHint')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setDeleteOpen(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={m.remove.isPending} onClick={doDelete}>{t('buddy.detail.delete')}</Button></>} />

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={t('common.report')} description={t('report.description')} size="sm"
        footer={<><Button variant="ghost" onClick={() => setReportOpen(false)}>{t('common.cancel')}</Button><Button variant="primary" loading={m.report.isPending} onClick={doReport}>{t('common.submit')}</Button></>}>
        <div className="flex flex-col gap-3">
          <Select label={t('report.reason')} value={reportReason} onChange={(v: string) => setReportReason(v)} options={ReportReason.map((r) => ({ value: r, label: t(`report.reason.${r}`) }))} />
          <Textarea label={t('report.details')} rows={3} maxLength={1000} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} />
        </div>
      </Modal>
    </div>
  );
}

export type { BuddyDetailDto };
