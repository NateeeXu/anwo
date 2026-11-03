import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { create } from 'zustand'
import { api } from '../api'
import { useAuthStore } from '../auth'
import { getCookie, setCookie } from '../storage'
import * as fmt from './format'
import type { Locale } from './format'

export type { Locale } from './format'
export * from './format'

export type Dict = Record<string, string>
type Module = { default?: { zh?: Record<string, unknown>; en?: Record<string, unknown> } }

function flatten(obj: Record<string, unknown> | undefined, prefix = '', out: Dict = {}): Dict {
  if (!obj) return out
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v as Record<string, unknown>, key, out)
    else if (v != null) out[key] = String(v)
  }
  return out
}

const modules = import.meta.glob<Module>('../../i18n/*.ts', { eager: true })
const DICT: Record<Locale, Dict> = { 'zh-CN': {}, en: {} }
for (const m of Object.values(modules)) {
  Object.assign(DICT['zh-CN'], flatten(m.default?.zh))
  Object.assign(DICT.en, flatten(m.default?.en))
}

/** Register extra strings at runtime (tests, dev tools). */
export function addDictionary(d: { zh?: Record<string, unknown>; en?: Record<string, unknown> }): void {
  Object.assign(DICT['zh-CN'], flatten(d.zh))
  Object.assign(DICT.en, flatten(d.en))
}

export const LOCALES: Locale[] = ['zh-CN', 'en']

export function normalizeLocale(v: unknown): Locale | null {
  if (v === 'zh-CN' || v === 'en') return v
  if (typeof v === 'string') {
    if (v.toLowerCase().startsWith('zh')) return 'zh-CN'
    if (v.toLowerCase().startsWith('en')) return 'en'
  }
  return null
}

function initialLocale(): Locale {
  return normalizeLocale(getCookie('lang')) ?? 'zh-CN'
}

function applyLang(locale: Locale) {
  if (typeof document !== 'undefined') document.documentElement.setAttribute('lang', locale)
}

interface LocaleState {
  locale: Locale
  setLocale: (l: Locale, opts?: { persistProfile?: boolean }) => void
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: initialLocale(),
  setLocale: (locale, opts = {}) => {
    if (get().locale === locale) return
    setCookie('lang', locale)
    applyLang(locale)
    set({ locale })
    const auth = useAuthStore.getState()
    if (opts.persistProfile !== false && auth.status === 'authed' && auth.user?.locale !== locale) {
      api('/api/users/me', { method: 'PATCH', body: { locale } })
        .then((u) => auth.setUser(u as typeof auth.user))
        .catch(() => {})
    }
  },
}))
applyLang(useLocaleStore.getState().locale)

// A logged-in profile locale wins over the default when the device had no cookie.
useAuthStore.subscribe((s, prev) => {
  if (s.user && s.user !== prev.user && !getCookie('lang')) {
    const l = normalizeLocale(s.user.locale)
    if (l) useLocaleStore.getState().setLocale(l, { persistProfile: false })
  }
})

const missing = new Set<string>()

/** Interpolate `{name}` placeholders. */
export function interpolate(template: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] == null ? '' : String(vars[k])))
}

export type TFunction = (key: string, vars?: Record<string, string | number | null | undefined>) => string

export function translate(locale: Locale, key: string, vars?: Record<string, string | number | null | undefined>): string {
  const s = DICT[locale][key] ?? DICT[locale === 'en' ? 'zh-CN' : 'en'][key]
  if (s === undefined) {
    if (import.meta.env.DEV && !missing.has(`${locale}:${key}`)) {
      missing.add(`${locale}:${key}`)
      console.warn(`[i18n] missing key "${key}" (${locale})`)
    }
    return key
  }
  return interpolate(s, vars)
}

/** Non-hook translation using the current locale (toasts from stores, ws handlers). */
export function t(key: string, vars?: Record<string, string | number | null | undefined>): string {
  return translate(useLocaleStore.getState().locale, key, vars)
}

const I18nContext = createContext<Locale>('zh-CN')

/** Wrap the app once. Keeps `<html lang>` in sync and provides the locale to `useT()`. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocaleStore((s) => s.locale)
  useEffect(() => applyLang(locale), [locale])
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>
}

/** `const t = useT(); t('ui.close'); t('toast.campusSwitched', { campus: 'UIUC' })` */
export function useT(): TFunction {
  const ctx = useContext(I18nContext)
  const locale = useLocaleStore((s) => s.locale) ?? ctx
  return useMemo<TFunction>(() => (key, vars) => translate(locale, key, vars), [locale])
}

export interface UseLocale {
  locale: Locale
  setLocale: (l: Locale) => void
  /** BCP-47 tag for `Intl` (`zh-CN` → `zh-CN`, `en` → `en-US`). */
  intl: string
  isZh: boolean
  formatMoney: (cents: number, opts?: Omit<fmt.MoneyOptions, 'locale'>) => string
  formatMoneyRange: typeof fmt.formatMoneyRange
  formatPrice: (p: { priceCents: number; isFree?: boolean; obo?: boolean }) => string
  formatDate: (iso: string | number | Date, style?: fmt.DateStyle, opts?: Omit<fmt.DateOptions, 'locale'>) => string
  formatDateRange: (start: string | Date | null | undefined, end: string | Date | null | undefined, opts?: Omit<fmt.DateOptions, 'locale'> & { months?: boolean }) => string
  formatRelative: (iso: string | number | Date, opts?: Omit<fmt.DateOptions, 'locale'>) => string
  formatDistance: (meters: number) => string
  formatMinutes: (min: number, mode?: 'walk' | 'bike' | 'shuttle' | 'drive' | '') => string
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string
  formatPercent: (fraction: number, digits?: number) => string
  formatRooms: (bedrooms: number, bathrooms: number) => string
  formatArea: (sqft: number) => string
}

/** `const { locale, setLocale, formatMoney, formatDate } = useLocale()` — locale-bound formatters. */
export function useLocale(): UseLocale {
  const locale = useLocaleStore((s) => s.locale)
  const setLocale = useLocaleStore((s) => s.setLocale)
  return useMemo<UseLocale>(
    () => ({
      locale,
      setLocale: (l) => setLocale(l),
      intl: locale === 'zh-CN' ? 'zh-CN' : 'en-US',
      isZh: locale === 'zh-CN',
      formatMoney: (cents, opts) => fmt.formatMoney(cents, { ...opts, locale }),
      formatMoneyRange: fmt.formatMoneyRange,
      formatPrice: (p) => fmt.formatPrice(p, locale),
      formatDate: (iso, style, opts) => fmt.formatDate(iso, style, { ...opts, locale }),
      formatDateRange: (s, e, opts) => fmt.formatDateRange(s, e, { ...opts, locale }),
      formatRelative: (iso, opts) => fmt.formatRelative(iso, { ...opts, locale }),
      formatDistance: (m) => fmt.formatDistance(m, locale),
      formatMinutes: (m, mode) => fmt.formatMinutes(m, mode, locale),
      formatNumber: (n, opts) => fmt.formatNumber(n, locale, opts),
      formatPercent: (f, d) => fmt.formatPercent(f, locale, d),
      formatRooms: (b, ba) => fmt.formatRooms(b, ba, locale),
      formatArea: (s) => fmt.formatArea(s, locale),
    }),
    [locale, setLocale],
  )
}

/** Pick a bilingual field pair from a DTO: `pickLang(locale, row.title, row.titleZh)`. */
export function pickLang(locale: Locale, en: string | null | undefined, zh: string | null | undefined): string {
  return (locale === 'zh-CN' ? zh || en : en || zh) ?? ''
}
