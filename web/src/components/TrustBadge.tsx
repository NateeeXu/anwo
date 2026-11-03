import { forwardRef, type HTMLAttributes } from 'react'
import { CircleCheck } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'
import { Tooltip } from './Tooltip'

export type TrustLevel = 0 | 1 | 2 | 3

export interface TrustBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  level: TrustLevel | number
  /** inline 14 px (no label) · card 16 px + label · profile 20 px + label */
  size?: 'inline' | 'card' | 'profile'
  /** Force label on/off (default: inline → off, others → on) */
  showLabel?: boolean
  /** Disable the explanatory tooltip */
  noTooltip?: boolean
}

const PX = { inline: 14, card: 16, profile: 20 }

/** Shield filled with a white check (L2). */
function ShieldCheckFilled({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3Z" fill="currentColor" />
      <path d="m8.7 12.2 2.2 2.2 4.4-4.6" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
/** Shield filled with a 4-point star (L3). */
function ShieldStarFilled({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2.5 4 5.5v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10v-6l-8-3Z" fill="currentColor" />
      <path d="M12 7.2c.5 2.6 1.6 3.7 4.2 4.2-2.6.5-3.7 1.6-4.2 4.2-.5-2.6-1.6-3.7-4.2-4.2 2.6-.5 3.7-1.6 4.2-4.2Z" fill="var(--on-accent)" />
    </svg>
  )
}
function DashedCircle({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" strokeDasharray="3.5 3" strokeLinecap="round" />
    </svg>
  )
}

/** DESIGN.md §4.5 trust-level badge. Never purchasable; L0 renders only at profile size. */
export const TrustBadge = forwardRef<HTMLSpanElement, TrustBadgeProps>(function TrustBadge(
  { level, size = 'inline', showLabel, noTooltip, className, ...rest },
  ref,
) {
  const t = useT()
  const lv = Math.max(0, Math.min(3, Math.round(Number(level) || 0))) as TrustLevel
  const label = t(`ui.trust.l${lv}`)
  const desc = t(`ui.trust.l${lv}.desc`)
  const px = PX[size]
  const withLabel = showLabel ?? size !== 'inline'
  if (lv === 0 && size !== 'profile' && !showLabel) return null

  const color = lv === 0 ? 'text-ink-4' : lv === 1 ? 'text-ink-2' : 'text-accent'
  const labelColor = lv === 0 ? 'text-ink-3' : lv === 1 ? 'text-ink-2' : 'text-accent-text'
  const icon =
    lv === 0 ? <DashedCircle size={px} /> : lv === 1 ? <CircleCheck size={px} strokeWidth={1.75} aria-hidden /> : lv === 2 ? <ShieldCheckFilled size={px} /> : <ShieldStarFilled size={px} />

  const node = (
    <span
      ref={ref}
      data-level={lv}
      role="img"
      aria-label={`${label}${withLabel ? '' : ` — ${desc}`}`}
      title={noTooltip ? `${label} · ${desc}` : undefined}
      tabIndex={noTooltip ? undefined : 0}
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-xs align-middle', color, className)}
      {...rest}
    >
      {icon}
      {withLabel && <span className={cn(size === 'profile' ? 'text-small font-medium' : 'text-caption', labelColor)}>{label}</span>}
    </span>
  )
  if (noTooltip) return node
  return <Tooltip content={`${label} · ${desc}`}>{node}</Tooltip>
})
