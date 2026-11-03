import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type'> {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: ReactNode
  description?: ReactNode
  size?: 'sm' | 'md'
  /** Put the label before the switch (default) or after. */
  labelPosition?: 'start' | 'end'
}

/** DESIGN.md §5 Switch: track 36×20 line-strong → accent, 16 px thumb. */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onChange, label, description, size = 'md', labelPosition = 'start', className, disabled, id: idProp, ...rest },
  ref,
) {
  const autoId = useId()
  const id = idProp ?? autoId
  const labelId = `${id}-label`
  const track = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9'
  const thumb = size === 'sm' ? 'size-3' : 'size-4'
  const shift = size === 'sm' ? 'translate-x-3' : 'translate-x-4'
  const control = (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={label ? labelId : undefined}
      disabled={disabled}
      data-state={checked ? 'checked' : 'unchecked'}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-pill p-0.5 transition-colors duration-token-base ease-out',
        checked ? 'bg-accent' : 'bg-line-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        track,
        !label && className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn('block rounded-pill bg-white shadow-sm transition-transform duration-token-base ease-out', thumb, checked ? shift : 'translate-x-0')}
      />
    </button>
  )
  if (!label) return control
  return (
    <div className={cn('flex min-h-11 items-center justify-between gap-4', labelPosition === 'end' && 'flex-row-reverse justify-end', disabled && 'opacity-50', className)}>
      <label id={labelId} htmlFor={id} className="flex min-w-0 cursor-pointer flex-col">
        <span className="text-body text-ink">{label}</span>
        {description && <span className="text-small text-ink-3">{description}</span>}
      </label>
      {control}
    </div>
  )
})
