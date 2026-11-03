/** Intl-based formatting per DESIGN.md §8. Pure functions; pass the locale explicitly or use the bound versions from `useT()`/`useLocale()`. */

export type Locale = 'zh-CN' | 'en'

const INTL: Record<Locale, string> = { 'zh-CN': 'zh-CN', en: 'en-US' }

/** Insert a space between Chinese characters and Latin letters / digits (「步行 8 分钟」). */
export function spaceCjk(s: string): string {
  return s
    .replace(/([一-鿿㐀-䶿])([A-Za-z0-9$%])/g, '$1 $2')
    .replace(/([A-Za-z0-9%])([一-鿿㐀-䶿])/g, '$1 $2')
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `$1,250` — whole dollars; cents only when non-zero. */
export function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return sign + (abs % 100 === 0 ? usd0.format(abs / 100) : usd2.format(abs / 100))
}

export interface MoneyOptions {
  /** Append the monthly suffix: zh `$1,250 / 月`, en `$1,250/mo`. */
  perMonth?: boolean
  /** Card-stub style: `$1,250/mo` in both languages. */
  compact?: boolean
  locale?: Locale
}

export function formatMoney(cents: number, opts: MoneyOptions = {}): string {
  const base = formatUsd(cents)
  if (!opts.perMonth) return base
  if (opts.compact || opts.locale === 'en' || !opts.locale) return `${base}/mo`
  return `${base} / 月`
}

/** `$900–1,200` (en dash, no spaces; the second number drops the `$`). */
export function formatMoneyRange(minCents: number, maxCents: number): string {
  return `${formatUsd(minCents)}–${formatUsd(maxCents).replace(/^\$/, '')}`
}

/** One-time price: `$40` · `免费`/`Free` · `$40 可议价`/`$40 OBO`. */
export function formatPrice(p: { priceCents: number; isFree?: boolean; obo?: boolean }, locale: Locale = 'en'): string {
  if (p.isFree || p.priceCents === 0) return locale === 'zh-CN' ? '免费' : 'Free'
  const base = formatUsd(p.priceCents)
  if (p.obo) return locale === 'zh-CN' ? `${base} 可议价` : `${base} OBO`
  return base
}

export function formatNumber(n: number, locale: Locale = 'en', opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL[locale], opts).format(n)
}

export function formatPercent(fraction: number, locale: Locale = 'en', digits = 0): string {
  return new Intl.NumberFormat(INTL[locale], { style: 'percent', maximumFractionDigits: digits }).format(fraction)
}

export type DateStyle = 'short' | 'long' | 'monthDay' | 'time' | 'datetime' | 'weekday' | 'month'

function toDate(iso: string | number | Date): Date {
  if (iso instanceof Date) return iso
  if (typeof iso === 'number') return new Date(iso)
  // Date-only strings are interpreted as local dates (not UTC midnight).
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date(iso)
}

function zhSpaces(s: string): string {
  // Intl gives 6月15日 / 2026年6月15日 → 6 月 15 日 / 2026 年 6 月 15 日
  return s.replace(/(\d)([年月日])/g, '$1 $2').replace(/([年月日])(\d)/g, '$1 $2').trim()
}

export interface DateOptions {
  locale?: Locale
  timeZone?: string
  /** Force/hide the year (default: shown for `long`, shown for `short` only when not the current year). */
  year?: boolean
}

/**
 * zh: `6 月 15 日` · `2026 年 6 月 15 日` · `14:02`; en: `Jun 15` · `Jun 15, 2026` · `2:02 PM`.
 * `short` shows the year only when it differs from the current year.
 */
export function formatDate(iso: string | number | Date, style: DateStyle = 'short', opts: DateOptions = {}): string {
  const { locale = 'en', timeZone } = opts
  const d = toDate(iso)
  if (Number.isNaN(d.getTime())) return ''
  const loc = INTL[locale]
  const tz = timeZone ? { timeZone } : {}
  const sameYear = d.getFullYear() === new Date().getFullYear()
  const withYear = opts.year ?? (style === 'long' || !sameYear)
  let out: string
  switch (style) {
    case 'time':
      out = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit', hour12: locale === 'en', ...tz }).format(d)
      break
    case 'datetime':
      out =
        formatDate(d, 'short', opts) +
        ' ' +
        new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit', hour12: locale === 'en', ...tz }).format(d)
      break
    case 'weekday':
      out = new Intl.DateTimeFormat(loc, { weekday: 'short', ...tz }).format(d)
      break
    case 'month':
      out = new Intl.DateTimeFormat(loc, { month: locale === 'en' ? 'short' : 'long', ...(withYear ? { year: 'numeric' } : {}), ...tz }).format(d)
      break
    case 'monthDay':
      out = new Intl.DateTimeFormat(loc, { month: locale === 'en' ? 'short' : 'long', day: 'numeric', ...tz }).format(d)
      break
    case 'long':
    case 'short':
    default:
      out = new Intl.DateTimeFormat(loc, {
        month: locale === 'en' ? 'short' : 'long',
        day: 'numeric',
        ...(withYear ? { year: 'numeric' } : {}),
        ...tz,
      }).format(d)
  }
  return locale === 'zh-CN' ? zhSpaces(out) : out
}

/** `6 月 15 日 – 8 月 31 日（2.5 个月）` / `Jun 15 – Aug 31 (2.5 months)`; `months` adds the duration. */
export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
  opts: DateOptions & { months?: boolean } = {},
): string {
  const { locale = 'en' } = opts
  const dash = ' – '
  if (!start && !end) return ''
  const s = start ? formatDate(start, 'short', opts) : ''
  const e = end ? formatDate(end, 'short', opts) : ''
  let out = s && e ? `${s}${dash}${e}` : s ? (locale === 'zh-CN' ? `${s} 起` : `From ${s}`) : locale === 'zh-CN' ? `至 ${e}` : `Until ${e}`
  if (opts.months && start && end) {
    const m = monthsBetween(toDate(start), toDate(end))
    const n = m % 1 === 0 ? String(m) : m.toFixed(1)
    out += locale === 'zh-CN' ? `（${n} 个月）` : ` (${n} ${m === 1 ? 'month' : 'months'})`
  }
  return out
}

export function monthsBetween(a: Date, b: Date): number {
  const days = (b.getTime() - a.getTime()) / 864e5
  return Math.round((days / 30.44) * 2) / 2
}

/**
 * zh: 刚刚 · 5 分钟前 · 昨天 14:02 · 3 天前; en: just now · 5 min ago · yesterday 2:02 PM · 3 days ago.
 * Beyond 7 days falls back to a short date.
 */
export function formatRelative(iso: string | number | Date, opts: DateOptions & { now?: Date } = {}): string {
  const { locale = 'en' } = opts
  const d = toDate(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = opts.now ?? new Date()
  const diff = now.getTime() - d.getTime()
  const sec = Math.round(diff / 1000)
  const zh = locale === 'zh-CN'
  if (sec < 45) return zh ? '刚刚' : 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return zh ? `${min} 分钟前` : `${min} min ago`
  const hr = Math.round(min / 60)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (d.getTime() >= startOfToday) return zh ? `${hr} 小时前` : `${hr} ${hr === 1 ? 'hour' : 'hours'} ago`
  if (d.getTime() >= startOfToday - 864e5) {
    const t = formatDate(d, 'time', opts)
    return zh ? `昨天 ${t}` : `yesterday ${t}`
  }
  const days = Math.round((startOfToday - d.getTime()) / 864e5) + 0
  if (days <= 7) return zh ? `${days} 天前` : `${days} days ago`
  return formatDate(d, 'short', opts)
}

/** `0.6 mi`; under 0.1 mi shows feet (en) / 米 (zh). */
export function formatDistance(meters: number, locale: Locale = 'en'): string {
  if (!Number.isFinite(meters) || meters < 0) return ''
  const mi = meters / 1609.344
  if (mi < 0.1) {
    if (locale === 'zh-CN') return `${Math.round(meters / 10) * 10} 米`
    return `${Math.round((meters * 3.28084) / 10) * 10} ft`
  }
  const n = mi < 10 ? (Math.round(mi * 10) / 10).toFixed(1) : String(Math.round(mi))
  return `${n} mi`
}

/** `步行 8 分钟` / `8 min walk`; mode: walk | bike | shuttle | drive. */
export function formatMinutes(min: number, mode: 'walk' | 'bike' | 'shuttle' | 'drive' | '' = '', locale: Locale = 'en'): string {
  const m = Math.max(1, Math.round(min))
  if (locale === 'zh-CN') {
    const word = { walk: '步行', bike: '骑车', shuttle: '校车', drive: '开车', '': '' }[mode]
    return word ? `${word} ${m} 分钟` : `${m} 分钟`
  }
  const word = { walk: 'walk', bike: 'bike', shuttle: 'shuttle', drive: 'drive', '': '' }[mode]
  return word ? `${m} min ${word}` : `${m} min`
}

/** `246 条房源` is a dictionary concern; this gives the number part only, grouped. */
export function formatCount(n: number, locale: Locale = 'en'): string {
  return formatNumber(n, locale)
}

/** `850 sqft` / `850 sq ft` */
export function formatArea(sqft: number, locale: Locale = 'en'): string {
  return locale === 'zh-CN' ? `${formatNumber(sqft, locale)} sqft` : `${formatNumber(sqft, locale)} sq ft`
}

/** `2 室 1 卫` / `2 bd · 1 ba` (0 bedrooms = studio: `开间` / `Studio`). */
export function formatRooms(bedrooms: number, bathrooms: number, locale: Locale = 'en'): string {
  if (locale === 'zh-CN') return bedrooms === 0 ? `开间 · ${bathrooms} 卫` : `${bedrooms} 室 ${bathrooms} 卫`
  return bedrooms === 0 ? `Studio · ${bathrooms} ba` : `${bedrooms} bd · ${bathrooms} ba`
}

/** First-mention campus name: zh `西北大学 Northwestern` → then `Northwestern`. */
export function formatCampusName(c: { name: string; nameZh?: string | null; shortName: string }, locale: Locale, firstMention = false): string {
  if (!firstMention) return c.shortName
  if (locale === 'zh-CN') return c.nameZh && c.nameZh !== c.name ? `${c.nameZh} ${c.shortName}` : c.name
  return c.name
}

/** Format an ISO date as `YYYY-MM-DD` in local time (for date inputs). */
export function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
