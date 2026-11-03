import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAnchorPosition, useEscape, useIsMobile, useOnClickOutside, mergeRefs } from '@/lib/hooks'
import { useT } from '@/lib/i18n'
import { Field } from './Field'
import { inputBoxClasses, type InputSize } from './Input'
import { Portal } from './Portal'
import { Sheet } from './Sheet'

export interface SelectOption<V extends string = string> {
  value: V
  label: ReactNode
  description?: ReactNode
  icon?: ReactNode
  disabled?: boolean
  /** Plain-text label for native select, type-ahead and search (required when `label` is not a string) */
  text?: string
}

export interface SelectProps<V extends string = string> {
  options: SelectOption<V>[]
  value: V | null | undefined
  onChange?: (value: V) => void
  placeholder?: ReactNode
  /** Adds a search input to the listbox (always custom, even on mobile) */
  searchable?: boolean
  size?: InputSize
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  disabled?: boolean
  required?: boolean
  name?: string
  id?: string
  className?: string
  /** Width of the trigger (default full) */
  triggerClassName?: string
  'aria-label'?: string
}

function textOf(o: SelectOption): string {
  return o.text ?? (typeof o.label === 'string' ? o.label : String(o.value))
}

function SelectInner<V extends string>(
  { options, value, onChange, placeholder, searchable, size = 'md', label, hint, error, disabled, required, name, id: idProp, className, triggerClassName, ...rest }: SelectProps<V>,
  ref: React.ForwardedRef<HTMLButtonElement>,
) {
  const t = useT()
  const autoId = useId()
  const id = idProp ?? autoId
  const descId = `${id}-desc`
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const typeahead = useRef({ buffer: '', at: 0 })
  const useNative = isMobile && !searchable
  const useSheet = isMobile && searchable
  const pos = useAnchorPosition(triggerRef, listRef, open && !isMobile, { side: 'bottom', align: 'start', gap: 4 })

  const selected = options.find((o) => o.value === value) ?? null
  const filtered = useMemo(() => {
    if (!query) return options
    const q = query.toLowerCase()
    return options.filter((o) => textOf(o).toLowerCase().includes(q) || (typeof o.description === 'string' && o.description.toLowerCase().includes(q)))
  }, [options, query])

  useOnClickOutside([triggerRef, listRef], () => setOpen(false), open && !isMobile)
  useEscape(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, open && !isMobile)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const idx = filtered.findIndex((o) => o.value === value)
    setActive(idx >= 0 ? idx : filtered.findIndex((o) => !o.disabled))
    const raf = requestAnimationFrame(() => (searchable ? searchRef.current?.focus() : listRef.current?.focus()))
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const choose = (o: SelectOption<V>) => {
    if (o.disabled) return
    onChange?.(o.value)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const moveActive = (dir: 1 | -1) => {
    if (!filtered.length) return
    let i = active
    for (let n = 0; n < filtered.length; n++) {
      i = (i + dir + filtered.length) % filtered.length
      if (!filtered[i].disabled) break
    }
    setActive(i)
  }

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(filtered.findIndex((o) => !o.disabled))
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(filtered.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const o = filtered[active]
      if (o) choose(o)
    } else if (e.key === 'Tab') {
      setOpen(false)
    } else if (!searchable && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const now = Date.now()
      const ta = typeahead.current
      ta.buffer = now - ta.at < 600 ? ta.buffer + e.key.toLowerCase() : e.key.toLowerCase()
      ta.at = now
      const i = filtered.findIndex((o) => !o.disabled && textOf(o).toLowerCase().startsWith(ta.buffer))
      if (i >= 0) setActive(i)
    }
  }

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      setOpen(true)
    } else if (!open && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      // quick type-ahead on a closed select (native-like)
      const i = options.findIndex((o) => !o.disabled && textOf(o).toLowerCase().startsWith(e.key.toLowerCase()))
      if (i >= 0) onChange?.(options[i].value)
    }
  }

  if (useNative) {
    return (
      <Field label={label} hint={hint} error={error} htmlFor={id} descriptionId={descId} required={required} className={className}>
        <div className={inputBoxClasses({ error: !!error, size, disabled, className: cn('relative pr-9', triggerClassName) })}>
          <select
            id={id}
            name={name}
            disabled={disabled}
            required={required}
            value={value ?? ''}
            onChange={(e) => onChange?.(e.target.value as V)}
            aria-invalid={error ? true : undefined}
            aria-describedby={hint || error ? descId : undefined}
            aria-label={rest['aria-label']}
            className="min-w-0 flex-1 appearance-none bg-transparent outline-none"
          >
            {placeholder != null && (
              <option value="" disabled={required}>
                {typeof placeholder === 'string' ? placeholder : t('ui.select')}
              </option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {textOf(o)}
              </option>
            ))}
          </select>
          <ChevronDown size={16} strokeWidth={1.75} className="pointer-events-none absolute right-3 text-ink-3" aria-hidden />
        </div>
      </Field>
    )
  }

  const listbox = (mobile: boolean) => (
    <div
      ref={mobile ? undefined : listRef}
      id={`${id}-list`}
      role="listbox"
      aria-labelledby={`${id}-label`}
      aria-activedescendant={active >= 0 && filtered[active] ? `${id}-opt-${filtered[active].value}` : undefined}
      tabIndex={-1}
      onKeyDown={onListKey}
      style={mobile ? undefined : { position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: triggerRef.current?.offsetWidth, maxHeight: Math.min(320, pos?.maxHeight ?? 320) }}
      className={cn(
        'flex flex-col outline-none',
        !mobile && 'z-layer-dropdown min-w-[200px] overflow-hidden rounded-card border border-line bg-surface shadow-md animate-fade-in',
      )}
    >
      {searchable && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <Search size={16} strokeWidth={1.75} className="text-ink-3" aria-hidden />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onListKey}
            placeholder={t('ui.searchPlaceholder')}
            aria-label={t('ui.search')}
            className="h-8 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-ink-3"
          />
        </div>
      )}
      <div className={cn('flex-1 overflow-y-auto p-1', mobile && 'max-h-[60dvh]')}>
        {filtered.length === 0 && <p className="px-3 py-6 text-center text-small text-ink-3">{t('ui.noResults')}</p>}
        {filtered.map((o, i) => {
          const isSel = o.value === value
          return (
            <div
              key={o.value}
              id={`${id}-opt-${o.value}`}
              role="option"
              aria-selected={isSel}
              aria-disabled={o.disabled || undefined}
              data-index={i}
              data-active={!mobile && i === active ? '' : undefined}
              onMouseEnter={() => !mobile && setActive(i)}
              onClick={() => choose(o)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 text-body text-ink',
                mobile ? 'min-h-12 py-2' : 'min-h-9 py-1.5',
                'data-[active]:bg-sunken hover:bg-sunken aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
              )}
            >
              {o.icon && (
                <span className="inline-flex shrink-0 text-ink-2 [&>svg]:size-4" aria-hidden>
                  {o.icon}
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{o.label}</span>
                {o.description && <span className="truncate text-small text-ink-3">{o.description}</span>}
              </span>
              {isSel && <Check size={16} strokeWidth={2} className="shrink-0 text-accent-text" aria-hidden />}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} descriptionId={descId} required={required} className={className}>
      <button
        ref={mergeRefs(ref, triggerRef)}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? descId : undefined}
        aria-label={rest['aria-label']}
        disabled={disabled}
        data-state={open ? 'open' : 'closed'}
        onClick={() => setOpen(!open)}
        onKeyDown={onTriggerKey}
        className={inputBoxClasses({ error: !!error, size, disabled, className: cn('cursor-pointer text-left focus-visible:outline-none', triggerClassName) })}
      >
        {selected?.icon && (
          <span className="inline-flex shrink-0 text-ink-2 [&>svg]:size-4" aria-hidden>
            {selected.icon}
          </span>
        )}
        <span id={`${id}-label`} className={cn('min-w-0 flex-1 truncate', !selected && 'text-ink-3')}>
          {selected ? selected.label : (placeholder ?? t('ui.select'))}
        </span>
        <ChevronDown size={16} strokeWidth={1.75} className={cn('shrink-0 text-ink-3 transition-transform duration-token-base', open && 'rotate-180')} aria-hidden />
        {name && <input type="hidden" name={name} value={value ?? ''} />}
      </button>
      {open && useSheet && (
        <Sheet open onClose={() => setOpen(false)} title={label ?? placeholder} snap="full" bodyClassName="px-2 pb-2">
          {listbox(true)}
        </Sheet>
      )}
      {open && !isMobile && <Portal>{listbox(false)}</Portal>}
    </Field>
  )
}

/** DESIGN.md §5 Select: native `<select>` on mobile (unless searchable), custom listbox with type-ahead on desktop. */
export const Select = forwardRef(SelectInner) as <V extends string = string>(props: SelectProps<V> & { ref?: React.ForwardedRef<HTMLButtonElement> }) => ReactNode
