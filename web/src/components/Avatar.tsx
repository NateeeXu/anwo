import { forwardRef, useState, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  src?: string | null
  /** Used for alt text and initials fallback (2 chars; CJK uses the last character). */
  name?: string | null
  size?: AvatarSize
  /** Trust ring per DESIGN.md §4.5 (box-shadow, no layout change). */
  trustLevel?: 0 | 1 | 2 | 3 | number | null
  status?: 'online' | null
}

const PX: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 88 }
const TEXT: Record<AvatarSize, string> = { xs: 'text-[10px]', sm: 'text-caption', md: 'text-small', lg: 'text-body', xl: 'text-h2' }

export function initialsOf(name?: string | null): string {
  const n = (name ?? '').trim()
  if (!n) return '?'
  // Chinese names: last character of the first CJK run (「林小安 Journey」→「安」, not the trailing Latin letter)
  const cjk = n.match(/[㐀-鿿]+/)
  if (cjk) return cjk[0][cjk[0].length - 1]
  const parts = n.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return n.slice(0, 2).toUpperCase()
}

const RING: Record<number, string> = {
  0: 'none',
  1: '0 0 0 2px var(--line-strong)',
  2: '0 0 0 2px var(--accent-vivid)',
  3: '0 0 0 2px var(--accent-vivid), 0 0 0 4px var(--surface), 0 0 0 5px var(--accent-vivid)',
}

/** DESIGN.md §5 Avatar. */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { src, name, size = 'md', trustLevel, status, className, style, ...rest },
  ref,
) {
  const t = useT()
  const [broken, setBroken] = useState(false)
  const px = PX[size]
  const level = Math.max(0, Math.min(3, Number(trustLevel ?? 0)))
  const showImg = !!src && !broken
  return (
    <span
      ref={ref}
      data-size={size}
      data-trust={level}
      className={cn('relative inline-flex shrink-0 rounded-pill', className)}
      style={{ width: px, height: px, ...style }}
      {...rest}
    >
      <span
        className={cn('inline-flex size-full items-center justify-center overflow-hidden rounded-pill bg-sunken font-semibold text-ink-2 select-none', TEXT[size])}
        style={{ boxShadow: RING[level] }}
        role={showImg ? undefined : 'img'}
        aria-label={showImg ? undefined : (name ?? undefined)}
      >
        {showImg ? (
          <img src={src!} alt={name ?? ''} width={px} height={px} className="size-full object-cover dark:brightness-[.92]" onError={() => setBroken(true)} />
        ) : (
          <span aria-hidden>{initialsOf(name)}</span>
        )}
      </span>
      {status === 'online' && (
        <span
          className="absolute bottom-0 right-0 rounded-pill border-2 border-surface bg-success"
          style={{ width: Math.max(8, px / 4), height: Math.max(8, px / 4) }}
          role="img"
          aria-label={t('ui.online')}
        />
      )}
    </span>
  )
})

/** Stacked avatars (buddy cards): overlap −8 px, max `max`, then `+N`. */
export function AvatarStack({
  users,
  max = 3,
  size = 'xs',
  className,
}: {
  users: { id: string; name?: string | null; avatarUrl?: string | null; trustLevel?: number | null }[]
  max?: number
  size?: AvatarSize
  className?: string
}) {
  const shown = users.slice(0, max)
  const rest = users.length - shown.length
  return (
    <span className={cn('inline-flex items-center', className)}>
      {shown.map((u, i) => (
        <Avatar key={u.id} name={u.name} src={u.avatarUrl} trustLevel={u.trustLevel} size={size} className={cn(i > 0 && '-ml-2', 'ring-2 ring-surface rounded-pill')} />
      ))}
      {rest > 0 && <span className="-ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-pill bg-sunken px-1 text-caption text-ink-2 ring-2 ring-surface">+{rest}</span>}
    </span>
  )
}
