import { forwardRef, useId, type HTMLAttributes, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n'
import { Checkbox } from './Checkbox'
import { Skeleton } from './Skeleton'

export interface Column<Row> {
  key: string
  header: ReactNode
  width?: number | string
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  render?: (row: Row, index: number) => ReactNode
  /** Hide this column in the mobile stacked card */
  hideOnMobile?: boolean
}

export interface TableProps<Row> extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: keyof Row | ((row: Row) => string)
  selectable?: boolean
  selected?: Set<string> | string[]
  onSelectChange?: (keys: string[]) => void
  sort?: { key: string; dir: 'asc' | 'desc' } | null
  onSort?: (key: string, dir: 'asc' | 'desc') => void
  loading?: boolean
  /** Rendered when `rows` is empty and not loading (EmptyState) */
  empty?: ReactNode
  stickyHeader?: boolean
  rowActions?: (row: Row) => ReactNode
  onRowClick?: (row: Row) => void
  /** Skeleton rows while loading (default 5) */
  skeletonRows?: number
  caption?: string
}

function TableInner<Row>(
  { columns, rows, rowKey, selectable, selected, onSelectChange, sort, onSort, loading, empty, stickyHeader, rowActions, onRowClick, skeletonRows = 5, caption, className, ...rest }: TableProps<Row>,
  ref: React.ForwardedRef<HTMLDivElement>,
) {
  const t = useT()
  const id = useId()
  const keyOf = (r: Row) => (typeof rowKey === 'function' ? rowKey(r) : String(r[rowKey]))
  const sel = new Set(selected instanceof Set ? selected : (selected ?? []))
  const allKeys = rows.map(keyOf)
  const allSelected = allKeys.length > 0 && allKeys.every((k) => sel.has(k))
  const someSelected = allKeys.some((k) => sel.has(k))
  const toggleAll = () => onSelectChange?.(allSelected ? [] : allKeys)
  const toggle = (k: string) => {
    const next = new Set(sel)
    if (next.has(k)) next.delete(k)
    else next.add(k)
    onSelectChange?.(Array.from(next))
  }
  const cycle = (c: Column<Row>) => {
    if (!c.sortable || !onSort) return
    const dir = sort?.key === c.key && sort.dir === 'asc' ? 'desc' : 'asc'
    onSort(c.key, dir)
  }
  const cell = (r: Row, c: Column<Row>, i: number) => (c.render ? c.render(r, i) : String((r as Record<string, unknown>)[c.key] ?? ''))
  const alignCls = (a?: Column<Row>['align']) => (a === 'right' ? 'text-right tabular-nums' : a === 'center' ? 'text-center' : 'text-left')

  return (
    <div ref={ref} className={cn('w-full', className)} aria-busy={loading || undefined} {...rest}>
      {/* desktop table */}
      <div className={cn('hidden overflow-x-auto rounded-card border border-line bg-surface md:block', stickyHeader && 'max-h-[70dvh] overflow-y-auto')}>
        <table className="w-full border-collapse text-body">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className={cn('bg-sunken', stickyHeader && 'sticky top-0 z-[1]')}>
            <tr className="h-10">
              {selectable && (
                <th scope="col" className="w-10 px-3">
                  <Checkbox aria-label={t('ui.selectAll')} checked={allSelected} indeterminate={!allSelected && someSelected} onChange={toggleAll} className="min-h-0 py-0" />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} scope="col" style={{ width: c.width }} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={cn('px-3 text-caption font-medium text-ink-2', alignCls(c.align))}>
                  {c.sortable ? (
                    <button type="button" onClick={() => cycle(c)} className="inline-flex items-center gap-1 rounded-xs hover:text-ink">
                      {c.header}
                      {sort?.key === c.key ? sort.dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden /> : <ArrowUpDown size={12} className="text-ink-4" aria-hidden />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
              {rowActions && (
                <th scope="col" className="w-12 px-3">
                  <span className="sr-only">{t('ui.actions')}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <tr key={`s${i}`} className="h-13 border-t border-line">
                    {selectable && <td className="px-3" />}
                    {columns.map((c) => (
                      <td key={c.key} className="px-3">
                        <Skeleton variant="text" />
                      </td>
                    ))}
                    {rowActions && <td />}
                  </tr>
                ))
              : rows.map((r, i) => {
                  const k = keyOf(r)
                  return (
                    <tr
                      key={k}
                      onClick={onRowClick ? () => onRowClick(r) : undefined}
                      data-state={sel.has(k) ? 'selected' : undefined}
                      className={cn('h-13 border-t border-line transition-colors duration-token-fast hover:bg-sunken/60', onRowClick && 'cursor-pointer', sel.has(k) && 'bg-accent-soft/40')}
                    >
                      {selectable && (
                        <td className="px-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox aria-label={t('ui.selectRow')} checked={sel.has(k)} onChange={() => toggle(k)} className="min-h-0 py-0" />
                        </td>
                      )}
                      {columns.map((c) => (
                        <td key={c.key} className={cn('px-3 py-2 text-ink', alignCls(c.align))}>
                          {cell(r, c, i)}
                        </td>
                      ))}
                      {rowActions && (
                        <td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {rowActions(r)}
                        </td>
                      )}
                    </tr>
                  )
                })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <div className="border-t border-line">{empty ?? <p className="px-3 py-10 text-center text-small text-ink-3">{t('ui.noData')}</p>}</div>}
      </div>
      {/* mobile stacked cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {loading
          ? Array.from({ length: Math.min(3, skeletonRows) }).map((_, i) => <Skeleton key={i} variant="row" className="rounded-card border border-line bg-surface px-4" />)
          : rows.map((r, i) => {
              const k = keyOf(r)
              return (
                <div
                  key={k}
                  id={`${id}-${k}`}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  data-state={sel.has(k) ? 'selected' : undefined}
                  className={cn('rounded-card border border-line bg-surface p-4', sel.has(k) && 'border-accent', onRowClick && 'cursor-pointer')}
                >
                  {(selectable || rowActions) && (
                    <div className="mb-2 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                      {selectable ? <Checkbox aria-label={t('ui.selectRow')} checked={sel.has(k)} onChange={() => toggle(k)} className="min-h-0 py-0" /> : <span />}
                      {rowActions?.(r)}
                    </div>
                  )}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                    {columns
                      .filter((c) => !c.hideOnMobile)
                      .map((c) => (
                        <div key={c.key} className="contents">
                          <dt className="text-caption text-ink-3">{c.header}</dt>
                          <dd className={cn('min-w-0 text-small text-ink', c.align === 'right' && 'tabular-nums')}>{cell(r, c, i)}</dd>
                        </div>
                      ))}
                  </dl>
                </div>
              )
            })}
        {!loading && rows.length === 0 && (empty ?? <p className="py-10 text-center text-small text-ink-3">{t('ui.noData')}</p>)}
      </div>
    </div>
  )
}

/** DESIGN.md §5 Table (admin): sunken caption header, 52 px hairline rows, numeric right-aligned; stacked cards below `md`. */
export const Table = forwardRef(TableInner) as <Row>(props: TableProps<Row> & { ref?: React.ForwardedRef<HTMLDivElement> }) => ReactNode
