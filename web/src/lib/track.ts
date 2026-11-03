import { getCookie } from './storage'

export interface TrackEvent {
  type: string
  entityType?: string
  entityId?: string
  props?: Record<string, unknown>
  path?: string
  ts?: string
}

const FLUSH_MS = 5000
const MAX_BATCH = 20
let queue: TrackEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let bound = false

function endpoint() {
  const campusId = getCookie('campus')
  return '/api/events' + (campusId ? `?campusId=${encodeURIComponent(campusId)}` : '')
}

function bind() {
  if (bound || typeof window === 'undefined') return
  bound = true
  window.addEventListener('pagehide', () => flush(true))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true)
  })
}

/** Send queued events. `beacon` uses `navigator.sendBeacon` (page unload). */
export function flush(beacon = false): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (queue.length === 0) return
  const events = queue.splice(0, MAX_BATCH)
  const payload = JSON.stringify({ events })
  const url = endpoint()
  try {
    if (beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))
    } else {
      void fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        body: payload,
      }).catch(() => {})
    }
  } catch {
    /* analytics must never throw */
  }
  if (queue.length) schedule()
}

function schedule() {
  if (timer) return
  timer = setTimeout(() => flush(false), FLUSH_MS)
}

/**
 * Record an analytics event (`pageview`, `listing.view`, `affiliate.click`, ...).
 * `props.entityType` / `props.entityId` are lifted to the top level. Batched; flushed every 5 s,
 * at 20 events, and on page hide via sendBeacon. Never throws.
 */
export function track(type: string, props: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return
  bind()
  const { entityType, entityId, ...rest } = props
  queue.push({
    type,
    entityType: typeof entityType === 'string' ? entityType : undefined,
    entityId: typeof entityId === 'string' ? entityId : undefined,
    props: Object.keys(rest).length ? rest : undefined,
    path: location.pathname + location.search,
    ts: new Date().toISOString(),
  })
  if (queue.length >= MAX_BATCH) flush(false)
  else schedule()
}

/** Convenience: `trackPageview()` on route change. */
export function trackPageview(extra?: Record<string, unknown>) {
  track('pageview', { title: typeof document !== 'undefined' ? document.title : undefined, ...extra })
}
