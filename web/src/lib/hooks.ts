import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** `useMediaQuery('(min-width: 48rem)')` — SSR-safe, updates live. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

/** True below the `md` breakpoint (768px): the mobile shell. */
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 48rem)')
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/** Returns `value` after it stops changing for `ms`. */
export function useDebounce<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Stable debounced callback. */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, ms = 300) {
  const fnRef = useRef(fn)
  fnRef.current = fn
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return useCallback(
    (...args: A) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => fnRef.current(...args), ms)
    },
    [ms],
  )
}

let lockCount = 0
let savedOverflow = ''
let savedPaddingRight = ''

/** Locks body scroll while `locked` (reference counted; compensates scrollbar width). */
export function useLockBody(locked = true): void {
  useIsoLayoutEffect(() => {
    if (!locked || typeof document === 'undefined') return
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow
      savedPaddingRight = document.body.style.paddingRight
      const sbw = window.innerWidth - document.documentElement.clientWidth
      document.body.style.overflow = 'hidden'
      if (sbw > 0) document.body.style.paddingRight = `${sbw}px`
    }
    lockCount++
    return () => {
      lockCount--
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow
        document.body.style.paddingRight = savedPaddingRight
      }
    }
  }, [locked])
}

/** Calls `handler` on pointerdown outside all `refs`. */
export function useOnClickOutside(
  refs: RefObject<HTMLElement | null> | Array<RefObject<HTMLElement | null>>,
  handler: (ev: PointerEvent) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  useEffect(() => {
    if (!enabled) return
    const list = Array.isArray(refs) ? refs : [refs]
    const onDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null
      if (!target) return
      for (const r of list) if (r.current && r.current.contains(target)) return
      handlerRef.current(ev)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [enabled, refs])
}

/** Calls `handler` on Escape (keydown, capture). */
export function useEscape(handler: (ev: KeyboardEvent) => void, enabled = true): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!enabled) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') ref.current(ev)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [enabled])
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('data-focus-guard') && el.offsetParent !== null,
  )
}

export interface FocusTrapOptions {
  /** Element (or ref) to focus on open; defaults to first focusable, then the container. */
  initialFocus?: RefObject<HTMLElement | null> | HTMLElement | null
  /** Restore focus to the previously focused element on close. Default true. */
  returnFocus?: boolean
}

/** Traps Tab focus inside `ref` while `active`; focuses `initialFocus` and restores focus on close. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, opts: FocusTrapOptions = {}): void {
  const optsRef = useRef(opts)
  optsRef.current = opts
  useEffect(() => {
    if (!active || !ref.current) return
    const root = ref.current
    const previous = document.activeElement as HTMLElement | null
    const raf = requestAnimationFrame(() => {
      const init = optsRef.current.initialFocus
      const el = init && 'current' in (init as object) ? (init as RefObject<HTMLElement | null>).current : (init as HTMLElement | null)
      const target = el ?? getFocusable(root)[0] ?? root
      target.focus({ preventScroll: true })
    })
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Tab') return
      const items = getFocusable(root)
      if (items.length === 0) {
        ev.preventDefault()
        root.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (ev.shiftKey && (activeEl === first || !root.contains(activeEl))) {
        ev.preventDefault()
        last.focus()
      } else if (!ev.shiftKey && (activeEl === last || !root.contains(activeEl))) {
        ev.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      if (optsRef.current.returnFocus !== false && previous && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [active, ref])
}

/** Controlled/uncontrolled value helper. */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [inner, setInner] = useState<T>(defaultValue)
  const isControlled = value !== undefined
  const current = isControlled ? (value as T) : inner
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const set = useCallback(
    (v: T) => {
      if (!isControlled) setInner(v)
      onChangeRef.current?.(v)
    },
    [isControlled],
  )
  return [current, set]
}

export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'center' | 'end'
export interface AnchorPosition {
  top: number
  left: number
  side: Side
  maxHeight: number
}

/**
 * Position a fixed-position floating element next to an anchor. Flips to the opposite side when it would overflow.
 * Returns null until measured.
 */
export function useAnchorPosition(
  anchorRef: RefObject<HTMLElement | null>,
  floatingRef: RefObject<HTMLElement | null>,
  open: boolean,
  opts: { side?: Side; align?: Align; gap?: number; matchWidth?: boolean } = {},
): AnchorPosition | null {
  const { side = 'bottom', align = 'start', gap = 6 } = opts
  const [pos, setPos] = useState<AnchorPosition | null>(null)
  const compute = useCallback(() => {
    const a = anchorRef.current
    const f = floatingRef.current
    if (!a || !f) return
    const r = a.getBoundingClientRect()
    const fw = f.offsetWidth
    const fh = f.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 8
    let s: Side = side
    if (s === 'bottom' && r.bottom + gap + fh > vh - pad && r.top - gap - fh > pad) s = 'top'
    else if (s === 'top' && r.top - gap - fh < pad && r.bottom + gap + fh < vh - pad) s = 'bottom'
    else if (s === 'right' && r.right + gap + fw > vw - pad && r.left - gap - fw > pad) s = 'left'
    else if (s === 'left' && r.left - gap - fw < pad && r.right + gap + fw < vw - pad) s = 'right'
    let top = 0
    let left = 0
    if (s === 'bottom' || s === 'top') {
      top = s === 'bottom' ? r.bottom + gap : r.top - gap - fh
      left = align === 'start' ? r.left : align === 'end' ? r.right - fw : r.left + r.width / 2 - fw / 2
    } else {
      left = s === 'right' ? r.right + gap : r.left - gap - fw
      top = align === 'start' ? r.top : align === 'end' ? r.bottom - fh : r.top + r.height / 2 - fh / 2
    }
    left = Math.max(pad, Math.min(left, vw - fw - pad))
    top = Math.max(pad, Math.min(top, vh - fh - pad))
    const maxHeight = s === 'top' ? r.top - gap - pad : vh - (r.bottom + gap) - pad
    setPos({ top, left, side: s, maxHeight: Math.max(120, maxHeight) })
  }, [anchorRef, floatingRef, side, align, gap])

  useIsoLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    compute()
    const onChange = () => compute()
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    return () => {
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
    }
  }, [open, compute])
  return pos
}

/** Previous render's value. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined)
  useEffect(() => {
    ref.current = value
  })
  return ref.current
}

/** Merge several refs into one callback ref. */
export function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined | null>): React.RefCallback<T> {
  return (value) => {
    for (const r of refs) {
      if (!r) continue
      if (typeof r === 'function') r(value)
      else (r as React.MutableRefObject<T | null>).current = value
    }
  }
}
