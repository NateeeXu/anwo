// Month grid with `caption` dots per day (DESIGN §7.12 calendar view); tapping a day lists its occurrences as BuddyCards.
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button, EmptyState, Skeleton, Switch } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { track } from '@/lib/track';
import { useBuddyCalendar, type BuddyOccurrence } from './api';
import { BuddyCard } from './BuddyCard';
import { shiftYmd, useBuddyTime, ymdInZone } from './shared';

export interface BuddyCalendarProps {
  campusId: string | null;
  types?: string[];
  className?: string;
}

function monthStart(ymd: string): string {
  return ymd.slice(0, 8) + '01';
}
function addMonths(ymd: string, n: number): string {
  const [y, m] = ymd.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
function daysInMonth(ymd: string): number {
  const [y, m] = ymd.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function BuddyCalendar({ campusId, types, className }: BuddyCalendarProps) {
  const t = useT();
  const { locale, isZh } = useLocale();
  const { status } = useAuth();
  const navigate = useNavigate();
  const time = useBuddyTime(campusId);
  const [month, setMonth] = useState(() => monthStart(time.todayYmd));
  const [selected, setSelected] = useState<string>(time.todayYmd);
  const [mineOnly, setMineOnly] = useState(false);

  const weekStart = isZh ? 1 : 0;
  const first = month;
  const nDays = daysInMonth(month);
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const gridFrom = shiftYmd(first, -lead);
  const cells = Math.ceil((lead + nDays) / 7) * 7;
  const gridTo = shiftYmd(gridFrom, cells - 1);

  const query = useBuddyCalendar({ campusId, from: gridFrom, to: gridTo, type: types, mine: mineOnly && status === 'authed' });
  const byDay = useMemo(() => {
    const map = new Map<string, BuddyOccurrence[]>();
    for (const ev of query.data?.events ?? []) {
      const key = ymdInZone(ev.startsAt, time.tz);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [query.data, time.tz]);

  const monthLabel = new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${month}T00:00:00Z`));
  const dayEvents = byDay.get(selected) ?? [];
  const selectedLabel = new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(`${selected}T00:00:00Z`));
  const icsHref = `/api/buddy/calendar.ics?campusId=${encodeURIComponent(campusId ?? '')}&from=${first}&to=${shiftYmd(first, nDays - 1)}${mineOnly ? '&mine=1' : ''}${types?.length ? `&type=${types.join(',')}` : ''}`;

  const weekdays = Array.from({ length: 7 }, (_, i) => (i + weekStart) % 7);

  return (
    <div className={cn('grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]', className)}>
      <section aria-label={monthLabel} className="rounded-card border border-line bg-surface p-3 md:p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" iconOnly aria-label={t('buddy.calendar.prev')} onClick={() => setMonth((m) => addMonths(m, -1))}>
              <ChevronLeft />
            </Button>
            <h2 className="min-w-[8ch] text-center text-h3 text-ink" aria-live="polite">
              {monthLabel}
            </h2>
            <Button variant="ghost" size="sm" iconOnly aria-label={t('buddy.calendar.next')} onClick={() => setMonth((m) => addMonths(m, 1))}>
              <ChevronRight />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {status === 'authed' && <Switch size="sm" label={t('buddy.calendar.mineOnly')} checked={mineOnly} onChange={setMineOnly} />}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMonth(monthStart(time.todayYmd));
                setSelected(time.todayYmd);
              }}
            >
              {t('buddy.calendar.todayBtn')}
            </Button>
          </div>
        </div>
        <div role="grid" aria-label={monthLabel} className="grid grid-cols-7 gap-1">
          {weekdays.map((wd) => (
            <div key={wd} role="columnheader" className="py-1 text-center text-caption font-medium text-ink-3">
              {t(`buddy.calendar.weekday.${wd}`)}
            </div>
          ))}
          {Array.from({ length: cells }, (_, i) => {
            const ymd = shiftYmd(gridFrom, i);
            const inMonth = ymd.slice(0, 7) === month.slice(0, 7);
            const events = byDay.get(ymd) ?? [];
            const isSelected = ymd === selected;
            const isToday = ymd === time.todayYmd;
            const typeDots = [...new Set(events.map((e) => e.post.type))].slice(0, 3);
            return (
              <button
                key={ymd}
                type="button"
                role="gridcell"
                aria-selected={isSelected}
                aria-label={`${ymd}${events.length ? ` · ${t('buddy.calendar.eventsOn', { n: events.length })}` : ''}`}
                onClick={() => setSelected(ymd)}
                className={cn(
                  'flex aspect-square flex-col items-center justify-start gap-0.5 rounded-sm pt-1.5 text-small transition-colors duration-token-fast ease-out md:aspect-auto md:h-16',
                  inMonth ? 'text-ink' : 'text-ink-4',
                  isSelected ? 'bg-inverse text-ink-inverse' : 'hover:bg-sunken',
                  isToday && !isSelected && 'font-semibold text-accent-text-strong',
                )}
              >
                <span className={cn('tnum flex size-7 items-center justify-center rounded-pill', isToday && !isSelected && 'bg-accent-soft')}>{Number(ymd.slice(8))}</span>
                <span className="flex h-2 items-center gap-0.5" aria-hidden>
                  {typeDots.map((type) => (
                    <span key={type} className={cn('size-1.5 rounded-pill', isSelected ? 'bg-ink-inverse' : 'bg-accent-vivid')} />
                  ))}
                  {events.length > 3 && <span className={cn('text-[9px] leading-none', isSelected ? 'text-ink-inverse' : 'text-ink-3')}>+</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <p className="text-caption text-ink-3">{t('buddy.calendar.exportHint')}</p>
          <Button asChild variant="secondary" size="sm" iconLeft={<Download />}>
            <a href={icsHref} download onClick={() => track('buddy.calendar_export', { campusId, month })}>
              {t('buddy.calendar.export')}
            </a>
          </Button>
        </div>
      </section>

      <section aria-live="polite" className="flex flex-col gap-3">
        <h2 className="text-h3 text-ink">{t('buddy.calendar.dayTitle', { date: selectedLabel })}</h2>
        {query.isPending ? (
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton variant="buddy-card" />
            <Skeleton variant="buddy-card" />
          </div>
        ) : dayEvents.length === 0 ? (
          <EmptyState size="sm" icon={CalendarDays} title={t('buddy.empty.day')} description={t('buddy.empty.dayHint')} action={{ label: t('buddy.browse.post'), onClick: () => navigate('/post/buddy') }} />
        ) : (
          <ul className="flex flex-col gap-3">
            {dayEvents.map((ev) => (
              <li key={ev.id}>
                <BuddyCard post={ev.post} occurrenceAt={ev.startsAt} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default BuddyCalendar;
