// Buddy module — shared bits: type icons, time helpers bound to the campus timezone, status chips, safety card.
import { useMemo, type ComponentType } from 'react';
import { BookOpen, Calendar, Car, Dumbbell, Map as MapIcon, Plane, ShieldCheck, ShoppingCart, Sparkles, Users, Utensils } from 'lucide-react';
import { Link } from 'react-router';
import type { BuddyType } from '@shared/enums';
import type { BuddyCard as BuddyCardDto } from '@shared/types';
import { Badge, Card } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { useCampus, getCampusById } from '@/lib/campus';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string; 'aria-hidden'?: boolean }>;

export const TYPE_ICONS: Record<BuddyType, IconComponent> = {
  airport_pickup: Plane, carpool: Car, roommate: Users, study: BookOpen, gym: Dumbbell, dining: Utensils, travel: MapIcon, costco_run: ShoppingCart, event: Calendar, other: Sparkles,
};

export function BuddyTypeIcon({ type, size = 16, className }: { type: BuddyType | string; size?: number; className?: string }) {
  const Icon = TYPE_ICONS[type as BuddyType] ?? Sparkles;
  return <Icon size={size} strokeWidth={1.75} className={className} aria-hidden />;
}

/** Browse tab groups (DESIGN §7.12): 全部 · 接机/拼车 · 室友 · 学习 · 健身 · 吃饭 · 旅行 · Costco · 活动 */
export const TYPE_TABS: { key: string; types: BuddyType[]; labelKey: string }[] = [
  { key: 'all', types: [], labelKey: 'buddy.tab.all' },
  { key: 'ride', types: ['airport_pickup', 'carpool'], labelKey: 'buddy.tab.ride' },
  { key: 'roommate', types: ['roommate'], labelKey: 'buddy.tab.roommate' },
  { key: 'study', types: ['study'], labelKey: 'buddy.tab.study' },
  { key: 'gym', types: ['gym'], labelKey: 'buddy.tab.gym' },
  { key: 'dining', types: ['dining'], labelKey: 'buddy.tab.dining' },
  { key: 'travel', types: ['travel'], labelKey: 'buddy.tab.travel' },
  { key: 'costco', types: ['costco_run'], labelKey: 'buddy.tab.costco' },
  { key: 'event', types: ['event', 'other'], labelKey: 'buddy.tab.event' },
];

export const LANGUAGES = ['zh', 'en', 'ko', 'ja', 'es', 'other'] as const;
export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;

// ---------------------------------------------------------------- time helpers (campus timezone)
export type DateParts = { ymd: string; month: string; day: string; weekday: string; time: string; isToday: boolean; isTomorrow: boolean; isPast: boolean };

/** `YYYY-MM-DD` of an instant in a timezone. */
export function ymdInZone(iso: string | Date, timeZone: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Date/time formatter bound to the current campus timezone (DESIGN §8: campus tz for listings/events). */
export function useBuddyTime(campusId?: string | null) {
  const { campus } = useCampus();
  const { locale, formatDate } = useLocale();
  const t = useT();
  const tz = (campusId ? getCampusById(campusId)?.timezone : null) ?? campus?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return useMemo(() => {
    const todayYmd = ymdInZone(new Date(), tz);
    const tomorrowYmd = shiftYmd(todayYmd, 1);
    const loc = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
    const parts = (iso: string): DateParts => {
      const d = new Date(iso);
      const ymd = ymdInZone(d, tz);
      const month = new Intl.DateTimeFormat(loc, { month: locale === 'zh-CN' ? 'numeric' : 'short', timeZone: tz }).format(d);
      const day = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: tz }).format(d);
      const weekday = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: tz }).format(d);
      const time = formatDate(d, 'time', { timeZone: tz });
      return { ymd, month: locale === 'zh-CN' ? `${month}月`.replace('月月', '月') : month, day, weekday, time, isToday: ymd === todayYmd, isTomorrow: ymd === tomorrowYmd, isPast: d.getTime() < Date.now() };
    };
    const dayLabel = (iso: string, opts: { withWeekday?: boolean } = {}) => {
      const p = parts(iso);
      if (p.isToday) return t('buddy.card.today');
      if (p.isTomorrow) return t('buddy.card.tomorrow');
      return opts.withWeekday ? `${formatDate(new Date(iso), 'short', { timeZone: tz })} ${p.weekday}` : formatDate(new Date(iso), 'short', { timeZone: tz });
    };
    const range = (startsAt: string, endsAt: string | null, isAllDay: boolean) => {
      const p = parts(startsAt);
      if (isAllDay) return `${dayLabel(startsAt, { withWeekday: true })} · ${t('buddy.card.allDay')}`;
      let s = `${dayLabel(startsAt, { withWeekday: true })} ${p.time}`;
      if (endsAt) {
        const e = parts(endsAt);
        s += e.ymd === p.ymd ? `–${e.time}` : ` – ${dayLabel(endsAt)} ${e.time}`;
      }
      return s;
    };
    const tzShort = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date()).find((x) => x.type === 'timeZoneName')?.value ?? tz;
    const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { tz, tzShort, tzDiffers: deviceTz !== tz, todayYmd, parts, dayLabel, range };
  }, [tz, locale, formatDate, t]);
}

export function useBuddyTypeLabel() {
  const t = useT();
  return (type: string) => t(`buddy.type.${type}`);
}

// ---------------------------------------------------------------- status
export function StatusBadge({ status, className }: { status: BuddyCardDto['status']; className?: string }) {
  const t = useT();
  if (status === 'open') return null;
  const variant = status === 'full' ? 'neutral' : status === 'cancelled' || status === 'removed' ? 'danger' : 'neutral';
  return (
    <Badge variant={variant} size="sm" className={className}>
      {t(`buddy.detail.status.${status}`)}
    </Badge>
  );
}

// ---------------------------------------------------------------- safety rules (DESIGN §7.12: sunken card, 4 bullets, always visible)
export function SafetyCard({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT();
  return (
    <Card variant="sunken" padding={compact ? 'sm' : 'md'} className={cn('flex flex-col gap-2', className)} as="aside" aria-labelledby="buddy-safety-title">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} strokeWidth={1.75} className="text-accent-text" aria-hidden />
        <h2 id="buddy-safety-title" className="text-body font-semibold text-ink">
          {t('buddy.safety.title')}
        </h2>
      </div>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-small text-ink-2">
        {[1, 2, 3, 4].map((n) => (
          <li key={n}>{t(`buddy.safety.rule${n}`)}</li>
        ))}
      </ol>
      <Link to="/safety" className="self-start rounded-sm text-small text-ink-2 underline-offset-2 hover:text-ink hover:underline">
        {t('buddy.safety.more')} →
      </Link>
    </Card>
  );
}

/** Google Calendar "add event" link for one occurrence (no API key needed). */
export function googleCalendarUrl(p: { title: string; startsAt: string; endsAt: string | null; location?: string | null; details?: string; url: string }): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const end = p.endsAt ?? new Date(new Date(p.startsAt).getTime() + 2 * 3_600_000).toISOString();
  const q = new URLSearchParams({ action: 'TEMPLATE', text: p.title, dates: `${fmt(p.startsAt)}/${fmt(end)}`, details: `${p.details ?? ''}\n${p.url}`.trim(), location: p.location ?? '' });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}
