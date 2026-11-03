import { forwardRef, isValidElement, type ComponentType, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button, type ButtonVariant } from './Button'

/** Either a ready element (`<Button>`) or a shorthand `{ label, onClick }`. */
export type EmptyStateAction = ReactNode | { label: ReactNode; onClick?: () => void; to?: string; variant?: ButtonVariant }

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** A lucide icon component or an element (illustration components from components/illustrations/*). */
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> | ReactNode
  title: ReactNode
  description?: ReactNode
  action?: EmptyStateAction
  secondaryAction?: EmptyStateAction
  size?: 'sm' | 'md'
}

function renderAction(a: EmptyStateAction, fallback: ButtonVariant) {
  if (!a || isValidElement(a) || typeof a !== 'object' || !('label' in a)) return a as ReactNode
  return (
    <Button variant={a.variant ?? fallback} onClick={a.onClick}>
      {a.label}
    </Button>
  )
}

/** DESIGN.md §4.7: typographic empty state — sunken circle + ink-4 icon, h3, one sentence, one button. */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, secondaryAction, size = 'md', className, ...rest },
  ref,
) {
  let iconNode: ReactNode = null
  if (icon) {
    if (isValidElement(icon)) iconNode = icon
    else if (typeof icon === 'function' || (typeof icon === 'object' && icon && '$$typeof' in (icon as object))) {
      const Icon = icon as ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
      iconNode = <Icon size={size === 'sm' ? 28 : 40} strokeWidth={1.5} />
    }
  }
  return (
    <div
      ref={ref}
      className={cn('mx-auto flex w-full max-w-[360px] flex-col items-center text-center', size === 'sm' ? 'gap-3 py-8' : 'gap-4 py-12', className)}
      {...rest}
    >
      {iconNode && (
        <div className={cn('flex items-center justify-center rounded-pill bg-sunken text-ink-4', size === 'sm' ? 'size-14' : 'size-[72px]')} aria-hidden>
          {iconNode}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <h3 className={size === 'sm' ? 'text-body font-semibold text-ink' : 'text-h3 text-ink'}>{title}</h3>
        {description && <p className="text-body text-ink-2">{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {renderAction(action, 'primary')}
          {renderAction(secondaryAction, 'secondary')}
        </div>
      )}
    </div>
  )
})
