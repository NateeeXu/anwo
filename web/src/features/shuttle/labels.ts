// shuttle — small pure helpers shared by the pages and components.
import type { ServiceDay } from '@shared/enums';
import type { Locale, TFunction } from '@/lib/i18n';

export const SERVICE_DAYS: ServiceDay[] = ['weekday', 'saturday', 'sunday', 'holiday'];
const DOW_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function serviceDayLabel(t: TFunction, d: ServiceDay | string): string {
  return t(`shuttle.day.${d}`);
}

/** 'mon,tue,…' → 「周一至周五」 / "Mon–Fri", 「每天」 / "Daily", etc. */
export function serviceDaysLabel(t: TFunction, days: string[]): string {
  const set = new Set(days);
  const week = DOW_KEYS.filter((d) => set.has(d));
  const holiday = set.has('holiday');
  if (week.length === 7) return holiday ? t('shuttle.days.dailyHoliday') : t('shuttle.days.daily');
  if (week.length === 5 && !set.has('sat') && !set.has('sun')) return t('shuttle.days.weekdays');
  if (week.length === 2 && set.has('sat') && set.has('sun')) return t('shuttle.days.weekends');
  if (week.length === 0) return holiday ? t('shuttle.day.holiday') : t('shuttle.days.none');
  // contiguous span?
  const idx = week.map((d) => DOW_KEYS.indexOf(d));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1]! + 1);
  const names = week.map((d) => t(`shuttle.dow.${d}`));
  if (contiguous && week.length > 2) return `${names[0]}–${names[names.length - 1]}`;
  return names.join(t('shuttle.days.sep'));
}

/** Service summary line: 「每 20 分钟 · 07:00–23:00」 / "Every 20 min · 7:00 AM–11:00 PM". */
export function serviceSummary(t: TFunction, r: { headwayMin: number | null; firstDeparture: string | null; lastDeparture: string | null }, locale: Locale): string {
  const parts: string[] = [];
  if (r.headwayMin) parts.push(t('shuttle.everyMin', { n: r.headwayMin }));
  if (r.firstDeparture && r.lastDeparture) parts.push(`${clock(r.firstDeparture, locale)}–${clock(r.lastDeparture, locale)}`);
  return parts.join(' · ');
}

/** 'HH:MM' (hours may exceed 24) → '14:02' (zh) / '2:02 PM' (en). */
export function clock(hhmm: string, locale: Locale): string {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  const hour = h % 24;
  if (locale === 'zh-CN') return `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Seed descriptions carry both languages in one string ("English. 中文。"); show the half that matches the UI language. */
export function splitBilingual(text: string | null | undefined, locale: Locale): string {
  if (!text) return '';
  const m = /[㐀-鿿＀-￯　-〿]/.exec(text);
  if (!m || m.index === 0) return text;
  const en = text.slice(0, m.index).trim();
  const zh = text.slice(m.index).trim();
  if (!en || !zh) return text;
  return locale === 'zh-CN' ? zh : en;
}

export function stopName(s: { name: string; nameZh?: string | null }, locale: Locale): string {
  return locale === 'zh-CN' && s.nameZh ? s.nameZh : s.name;
}

export function alertTitle(a: { title: string; titleZh: string | null }, locale: Locale): string {
  return locale === 'zh-CN' && a.titleZh ? a.titleZh : a.title;
}
export function alertBody(a: { body: string | null; bodyZh: string | null }, locale: Locale): string | null {
  return locale === 'zh-CN' ? a.bodyZh || a.body : a.body || a.bodyZh;
}

/** 'YYYY-MM-DD' campus-local date → service day (holidays resolved on the server; here only for the tab default). */
export function nextDateFor(serviceDay: ServiceDay, fromYmd: string): string {
  const d = new Date(`${fromYmd}T12:00:00Z`);
  for (let i = 0; i < 8; i++) {
    const dow = d.getUTCDay();
    const matches = serviceDay === 'saturday' ? dow === 6 : serviceDay === 'sunday' ? dow === 0 : serviceDay === 'weekday' ? dow >= 1 && dow <= 5 : false;
    if (matches) return d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return fromYmd;
}
