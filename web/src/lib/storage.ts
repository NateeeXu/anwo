/** Safe cookie / localStorage helpers. Every call is wrapped so private mode, SSR or blocked storage never throws. */

export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  try {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'))
    return m ? decodeURIComponent(m[1]) : null
  } catch {
    return null
  }
}

export interface CookieOptions {
  /** Lifetime in days. Default 365. */
  days?: number
  path?: string
  sameSite?: 'Lax' | 'Strict' | 'None'
}

export function setCookie(name: string, value: string, opts: CookieOptions = {}): void {
  if (typeof document === 'undefined') return
  const { days = 365, path = '/', sameSite = 'Lax' } = opts
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString()
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=${path}; SameSite=${sameSite}${secure}`
  } catch {
    /* ignore */
  }
}

export function deleteCookie(name: string, path = '/'): void {
  if (typeof document === 'undefined') return
  try {
    document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=${path}; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

function getStore(kind: 'local' | 'session'): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    const probe = '__anwo_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

function make(kind: 'local' | 'session') {
  return {
    get<T>(key: string, fallback: T): T {
      const s = getStore(kind)
      if (!s) return fallback
      try {
        const raw = s.getItem(key)
        return raw == null ? fallback : (JSON.parse(raw) as T)
      } catch {
        return fallback
      }
    },
    getString(key: string): string | null {
      const s = getStore(kind)
      try {
        return s ? s.getItem(key) : null
      } catch {
        return null
      }
    },
    set(key: string, value: unknown): void {
      const s = getStore(kind)
      if (!s) return
      try {
        s.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
      } catch {
        /* quota / blocked */
      }
    },
    remove(key: string): void {
      const s = getStore(kind)
      try {
        s?.removeItem(key)
      } catch {
        /* ignore */
      }
    },
  }
}

/** JSON-safe localStorage wrapper. `storage.get('key', fallback)` / `storage.set('key', value)`. */
export const storage = make('local')
/** JSON-safe sessionStorage wrapper. */
export const session = make('session')
