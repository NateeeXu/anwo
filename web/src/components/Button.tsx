import { Children, cloneElement, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'prefix'> {
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: ReactNode
  iconRight?: ReactNode
  /** Square icon button; requires `aria-label`. */
  iconOnly?: boolean
  /** Swaps the icon for a spinner and keeps the width. */
  loading?: boolean
  /** Render the single child element (e.g. `<Link>`) with the button styles. */
  asChild?: boolean
  fullWidth?: boolean
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active',
  secondary: 'bg-surface border border-line-strong text-ink hover:bg-sunken active:bg-sunken',
  ghost: 'bg-transparent text-ink-2 hover:bg-sunken hover:text-ink active:bg-sunken',
  danger: 'bg-danger text-on-danger hover:opacity-90 active:opacity-80',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-[15px] gap-2',
  lg: 'h-12 px-5 text-[16px] gap-2',
}
const ICON_ONLY: Record<ButtonSize, string> = { sm: 'w-8 px-0', md: 'w-10 px-0', lg: 'w-12 px-0' }

export const buttonClasses = ({
  variant = 'primary',
  size = 'md',
  iconOnly,
  fullWidth,
  className,
}: Pick<ButtonProps, 'variant' | 'size' | 'iconOnly' | 'fullWidth' | 'className'>) =>
  cn(
    'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-ctl font-semibold leading-none transition-[background-color,color,border-color,opacity,transform] duration-token-fast ease-out',
    'active:translate-y-px disabled:pointer-events-none disabled:opacity-50',
    // invisible 44px touch target for `sm` on touch devices
    size === 'sm' && "max-md:before:absolute max-md:before:-inset-y-1.5 max-md:before:inset-x-0 max-md:before:content-['']",
    VARIANT[variant],
    SIZE[size],
    iconOnly && ICON_ONLY[size],
    fullWidth && 'w-full',
    className,
  )

/** DESIGN.md §5 Button. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    iconOnly,
    loading,
    asChild,
    fullWidth,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  if (import.meta.env.DEV && iconOnly && !rest['aria-label'] && !rest['aria-labelledby']) {
    console.warn('[Button] iconOnly buttons require aria-label')
  }
  const classes = buttonClasses({ variant, size, iconOnly, fullWidth, className })
  const inner = (
    <>
      {loading ? (
        <Spinner size={16} className="shrink-0" />
      ) : (
        iconLeft && (
          <span className="inline-flex shrink-0 [&>svg]:size-4" aria-hidden>
            {iconLeft}
          </span>
        )
      )}
      {iconOnly ? (
        loading ? null : (
          <span className="inline-flex [&>svg]:size-[18px]" aria-hidden>
            {children}
          </span>
        )
      ) : (
        children
      )}
      {!iconOnly && iconRight && !loading && (
        <span className="inline-flex shrink-0 [&>svg]:size-4" aria-hidden>
          {iconRight}
        </span>
      )}
    </>
  )

  if (asChild && isValidElement(children)) {
    const child = Children.only(children) as ReactElement<Record<string, unknown>>
    return cloneElement(child, {
      ...rest,
      ref,
      className: cn(classes, child.props.className as string | undefined),
      'aria-disabled': disabled || loading || undefined,
      'data-state': loading ? 'loading' : undefined,
      children: (
        <>
          {loading ? <Spinner size={16} /> : iconLeft && <span className="inline-flex [&>svg]:size-4" aria-hidden>{iconLeft}</span>}
          {child.props.children as ReactNode}
          {iconRight && !loading && <span className="inline-flex [&>svg]:size-4" aria-hidden>{iconRight}</span>}
        </>
      ),
    })
  }

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-state={loading ? 'loading' : disabled ? 'disabled' : undefined}
      data-variant={variant}
      {...rest}
    >
      {inner}
    </button>
  )
})
