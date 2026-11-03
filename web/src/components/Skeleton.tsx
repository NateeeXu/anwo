import { forwardRef, type CSSProperties, type HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type SkeletonVariant = 'text' | 'rect' | 'circle' | 'listing-card' | 'item-card' | 'buddy-card' | 'row'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant
  /** For `text`: number of lines (last one is shorter). */
  lines?: number
  width?: number | string
  height?: number | string
}

const Block = ({ className, style }: { className?: string; style?: CSSProperties }) => <div className={cn('skeleton', className)} style={style} aria-hidden />

/** DESIGN.md §5 Skeleton: shimmer blocks; card presets mirror the real card anatomy incl. the price stub. */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { variant = 'text', lines = 1, width, height, className, style, ...rest },
  ref,
) {
  const base = { ref, 'aria-hidden': true as const, ...rest }
  const sz: CSSProperties = { width, height, ...style }
  switch (variant) {
    case 'circle':
      return <div {...base} className={cn('skeleton rounded-pill', className)} style={{ width: width ?? 40, height: height ?? width ?? 40, ...style }} />
    case 'rect':
      return <div {...base} className={cn('skeleton', className)} style={{ width: width ?? '100%', height: height ?? 80, ...style }} />
    case 'row':
      return (
        <div {...base} className={cn('flex items-center gap-3 py-3', className)} style={sz}>
          <Block className="size-10 rounded-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Block className="h-3.5 w-1/2" />
            <Block className="h-3 w-3/4" />
          </div>
        </div>
      )
    case 'listing-card':
      return (
        <div {...base} className={cn('overflow-hidden rounded-card border border-line bg-surface', className)} style={sz}>
          <Block className="aspect-[4/3] w-full rounded-none" />
          <div className="-mt-3.5 ml-3 inline-block">
            <Block className="h-8 w-24 rounded-sm" />
          </div>
          <div className="flex flex-col gap-2 p-3 pt-2">
            <Block className="h-3 w-2/3" />
            <Block className="h-4 w-5/6" />
            <Block className="h-3 w-1/2" />
            <div className="mt-1 flex items-center gap-2">
              <Block className="size-6 rounded-pill" />
              <Block className="h-3 w-20" />
            </div>
          </div>
        </div>
      )
    case 'item-card':
      return (
        <div {...base} className={cn('overflow-hidden rounded-card border border-line bg-surface', className)} style={sz}>
          <Block className="aspect-square w-full rounded-none" />
          <div className="-mt-3.5 ml-3 inline-block">
            <Block className="h-8 w-16 rounded-sm" />
          </div>
          <div className="flex flex-col gap-2 p-3 pt-2">
            <Block className="h-4 w-4/5" />
            <Block className="h-3 w-1/2" />
          </div>
        </div>
      )
    case 'buddy-card':
      return (
        <div {...base} className={cn('flex gap-4 rounded-card border border-line bg-surface p-4', className)} style={sz}>
          <div className="flex w-14 shrink-0 flex-col items-center gap-2">
            <Block className="h-3 w-8" />
            <Block className="h-6 w-8" />
            <Block className="size-5 rounded-pill" />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Block className="h-4 w-3/4" />
            <Block className="h-3 w-1/2" />
            <div className="mt-auto flex items-center gap-2">
              <Block className="size-6 rounded-pill" />
              <Block className="size-6 rounded-pill" />
              <Block className="h-3 w-12" />
            </div>
          </div>
          <Block className="h-8 w-16 self-center rounded-ctl" />
        </div>
      )
    case 'text':
    default:
      return (
        <div {...base} className={cn('flex flex-col gap-2', className)} style={{ width, ...style }}>
          {Array.from({ length: Math.max(1, lines) }).map((_, i) => (
            <Block key={i} className="h-3.5 rounded-xs" style={{ width: lines > 1 && i === lines - 1 ? '60%' : '100%', height }} />
          ))}
        </div>
      )
  }
})

/** Wrap a loading list: sets `aria-busy` and renders `count` skeletons of `variant`. */
export function SkeletonList({ count = 4, variant = 'listing-card', className }: { count?: number; variant?: SkeletonVariant; className?: string }) {
  return (
    <div aria-busy="true" className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant={variant} />
      ))}
    </div>
  )
}
