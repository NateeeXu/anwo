import { useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'
import { useToastStore, type ToastItem } from '@/lib/toast'
import { Portal } from './Portal'

const ICON = { info: Info, success: CircleCheck, error: CircleAlert }

function ToastView({ item }: { item: ToastItem }) {
  const t = useT()
  const dismiss = useToastStore((s) => s.dismiss)
  const [paused, setPaused] = useState(false)
  const remaining = useRef(item.duration)
  const started = useRef(Date.now())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (item.duration <= 0) return
    if (paused) {
      if (timer.current) clearTimeout(timer.current)
      remaining.current -= Date.now() - started.current
      return
    }
    started.current = Date.now()
    timer.current = setTimeout(() => dismiss(item.id), Math.max(0, remaining.current))
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [paused, item.id, item.duration, dismiss])

  const Icon = ICON[item.variant]
  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      aria-live={item.variant === 'error' ? 'assertive' : 'polite'}
      data-variant={item.variant}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="on-inverse pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-card bg-inverse p-3.5 pr-2.5 text-ink-inverse shadow-lg animate-rise-in"
    >
      <Icon
        size={18}
        strokeWidth={1.75}
        aria-hidden
        className={cn('mt-0.5 shrink-0', item.variant === 'success' && 'text-success', item.variant === 'error' && 'text-danger', item.variant === 'info' && 'text-info')}
      />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="text-body font-medium">{item.title}</p>
        {item.description && <p className="mt-0.5 text-small opacity-80">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick()
              dismiss(item.id)
            }}
            className="mt-2 inline-flex h-7 items-center rounded-ctl bg-ink-inverse/10 px-2.5 text-small font-semibold hover:bg-ink-inverse/20"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label={t('ui.dismiss')}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-pill opacity-70 hover:bg-ink-inverse/10 hover:opacity-100"
      >
        <X size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  )
}

/** Mount once in the app root. Bottom-center on mobile, bottom-right on desktop; max 3; pauses on hover. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  if (toasts.length === 0) return null
  return (
    <Portal>
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--shell-tabbar-h)+env(safe-area-inset-bottom,0px)+12px)] z-layer-toast flex flex-col items-center gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:items-end">
        {toasts.map((item) => (
          <ToastView key={item.id} item={item} />
        ))}
      </div>
    </Portal>
  )
}

/** Alias so `import { Toast } from '@/components'` works for inline previews. */
export { ToastView as Toast }
