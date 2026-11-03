// Month strip showing the rental term with booked / blocked exceptions (DESIGN §7.3 「可租时间 calendar strip」).
import { useMemo } from 'react';
import type { Availability } from '@shared/types';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';

type Day = { ymd: string; inMonth: boolean; state: 'outside' | 'available' | 'booked' | 'blocked' };

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function AvailabilityCalendar({ from, to, ranges, months = 3, className }: { from: string; to: string | null; ranges: Availability[]; months?: number; className?: string }) {
  const t = useT();
  const { formatDate, formatDateRange, locale } = useLocale();
  const weekStart = locale === 'zh-CN' ? 1 : 0;
  const grid = useMemo(() => {
    const start = new Date(from + 'T00:00:00Z');
    const out: { label: string; days: Day[] }[] = [];
    for (let m = 0; m < months; m++) {
      const first = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
      const label = formatDate(first, 'month');
      const days: Day[] = [];
      const lead = (first.getUTCDay() - weekStart + 7) % 7;
      for (let i = 0; i < lead; i++) days.push({ ymd: '', inMonth: false, state: 'outside' });
      const dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      for (let d = 1; d <= dim; d++) {
        const key = ymd(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), d)));
        let state: Day['state'] = key >= from && (!to || key <= to) ? 'available' : 'outside';
        if (state === 'available') {
          const hit = ranges.find((r) => key >= r.startDate && key <= r.endDate);
          if (hit) state = hit.status === 'available' ? 'available' : hit.status;
        }
        days.push({ ymd: key, inMonth: true, state });
      }
      out.push({ label, days });
    }
    return out;
  }, [from, to, ranges, months, weekStart, formatDate]);
  const weekdays = useMemo(() => {
    const base = new Date(Date.UTC(2024, 0, 7 + weekStart)); // a Sunday/Monday
    return Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-US', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(base.getTime() + i * 86_400_000)));
  }, [locale, weekStart]);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <p className="text-body text-ink">{formatDateRange(from, to, { months: true })}{!to && ` · ${t('listings.card.openEnded')}`}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {grid.map((m) => (
          <div key={m.label} className="flex flex-col gap-1">
            <p className="text-small font-medium text-ink">{m.label}</p>
            <div className="grid grid-cols-7 gap-px text-caption text-ink-3">{weekdays.map((w, i) => <span key={i} className="text-center">{w}</span>)}</div>
            <div className="grid grid-cols-7 gap-px" role="img" aria-label={m.label}>
              {m.days.map((d, i) => (
                <span
                  key={i}
                  title={d.ymd ? `${formatDate(d.ymd, 'short')} · ${t(`listings.detail.calendar.${d.state}`)}` : undefined}
                  className={cn(
                    'flex h-6 items-center justify-center rounded-xs text-caption tabular-nums',
                    !d.inMonth && 'invisible',
                    d.state === 'outside' && 'text-ink-4',
                    d.state === 'available' && 'bg-accent-soft text-accent-text-strong',
                    d.state === 'booked' && 'bg-sunken text-ink-3 line-through',
                    d.state === 'blocked' && 'bg-line text-ink-3',
                  )}
                >
                  {d.ymd ? Number(d.ymd.slice(8)) : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <ul className="flex flex-wrap gap-4 text-caption text-ink-2" aria-label={t('listings.detail.calendar.legend')}>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-xs bg-accent-soft" />{t('listings.detail.calendar.available')}</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-xs bg-sunken" />{t('listings.detail.calendar.booked')}</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-xs bg-line" />{t('listings.detail.calendar.blocked')}</li>
      </ul>
    </div>
  );
}
