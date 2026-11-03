// Campus switcher (DESIGN.md §4.10): header pill + searchable list grouped by state, Nationwide row,
// recent campuses, keyboard navigation. Desktop = popover, mobile = Sheet. CampusList is reused by /welcome.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe, MapPin, Search } from 'lucide-react';
import { useLocation } from 'react-router';
import type { Campus } from '@shared/types';
import { Sheet } from '../../components';
import { useCampus } from '../../lib/campus';
import { useLocale, useT } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { track } from '../../lib/track';
import { cn } from '../../lib/cn';

/** Routes where the Nationwide scope makes sense (sublets, wanted, global search). */
export const NATIONWIDE_ROUTES = ['/listings', '/wanted', '/search'];
export function nationwideAllowed(pathname: string) {
  return NATIONWIDE_ROUTES.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'));
}

// Recent campuses are kept by the campus store (useCampus().recent); setCampus() pushes them.
const NO_RECENT: string[] = [];

export function matchCampus(c: Campus, q: string) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  return [c.name, c.nameZh, c.shortName, c.city, c.state, c.slug, `${c.city}, ${c.state}`].some((v) => v?.toLowerCase().includes(s));
}

type Row =
  | { kind: 'nationwide' }
  | { kind: 'header'; label: string }
  | { kind: 'campus'; campus: Campus; recent?: boolean };

export type CampusListProps = {
  campuses: Campus[];
  query: string;
  selectedId?: string | null;
  nationwideSelected?: boolean;
  allowNationwide?: boolean; // show the row at all
  nationwideDisabled?: boolean; // show but disabled with "campus only" hint
  onSelect: (campus: Campus | null) => void; // null = nationwide
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  listId: string;
  className?: string;
  suggestedIds?: string[];
  recentIds?: string[];
};

/** Builds the flat row list (used for keyboard navigation) from campuses + query. */
export function useCampusRows(campuses: Campus[], query: string, allowNationwide: boolean, recentLabel: string, recentIds: string[], suggestedIds?: string[], suggestedLabel?: string) {
  return useMemo<Row[]>(() => {
    const rows: Row[] = [];
    const q = query.trim();
    if (allowNationwide && (!q || /全美|nation|usa|us|全国/i.test(q))) rows.push({ kind: 'nationwide' });
    const filtered = campuses.filter((c) => matchCampus(c, q));
    if (!q) {
      const ids = suggestedIds?.length ? suggestedIds : recentIds;
      const list = ids.map((id) => campuses.find((c) => c.id === id)).filter((c): c is Campus => !!c);
      if (list.length) {
        rows.push({ kind: 'header', label: suggestedIds?.length ? (suggestedLabel ?? recentLabel) : recentLabel });
        list.forEach((campus) => rows.push({ kind: 'campus', campus, recent: true }));
      }
    }
    const byState = new Map<string, Campus[]>();
    for (const c of [...filtered].sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name))) {
      byState.set(c.state, [...(byState.get(c.state) ?? []), c]);
    }
    for (const [state, list] of byState) {
      rows.push({ kind: 'header', label: state });
      list.forEach((campus) => rows.push({ kind: 'campus', campus }));
    }
    return rows;
  }, [campuses, query, allowNationwide, recentLabel, recentIds, suggestedIds, suggestedLabel]);
}

export function CampusList(props: CampusListProps) {
  const { campuses, query, selectedId, nationwideSelected, allowNationwide = true, nationwideDisabled, onSelect, activeIndex, setActiveIndex, listId, className, suggestedIds, recentIds = NO_RECENT } = props;
  const t = useT();
  const { locale } = useLocale();
  const rows = useCampusRows(campuses, query, allowNationwide, t('campus.recent'), recentIds, suggestedIds, t('campus.suggested'));
  const listRef = useRef<HTMLDivElement>(null);
  const selectable = rows.map((r, i) => (r.kind !== 'header' ? i : -1)).filter((i) => i >= 0);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!rows.length || selectable.length === 0) {
    return (
      <div className={cn('px-3 py-8 text-center text-small text-ink-3', className)}>
        {t('campus.noResults')}
        <div className="mt-1 text-caption">{t('campus.noResultsHint')}</div>
      </div>
    );
  }

  return (
    <div ref={listRef} id={listId} role="listbox" aria-label={t('campus.listLabel')} className={cn('overflow-y-auto overscroll-contain', className)}>
      {rows.map((row, i) => {
        if (row.kind === 'header') {
          return (
            <div key={`h-${row.label}-${i}`} role="presentation" className="sticky top-0 bg-surface px-3 pb-1 pt-3 text-caption text-ink-3">
              {row.label}
            </div>
          );
        }
        const active = i === activeIndex;
        if (row.kind === 'nationwide') {
          const disabled = !!nationwideDisabled;
          return (
            <button
              key="nationwide"
              type="button"
              role="option"
              aria-selected={!!nationwideSelected}
              aria-disabled={disabled}
              data-index={i}
              disabled={disabled}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => !disabled && onSelect(null)}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left',
                active && !disabled && 'bg-sunken',
                disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <Globe className="size-5 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-ink">{t('campus.nationwide')}</span>
                <span className="block text-small text-ink-3">{disabled ? t('campus.campusOnly') : t('campus.nationwideHint')}</span>
              </span>
              {nationwideSelected && <Check className="size-4 text-accent-text" aria-hidden />}
            </button>
          );
        }
        const c = row.campus;
        const selected = c.id === selectedId && !nationwideSelected;
        const twoLines = locale.startsWith('zh') && c.nameZh && c.nameZh !== c.name;
        return (
          <button
            key={`${row.recent ? 'r-' : ''}${c.id}`}
            type="button"
            role="option"
            aria-selected={selected}
            data-index={i}
            onMouseEnter={() => setActiveIndex(i)}
            onClick={() => onSelect(c)}
            className={cn('flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left', active && 'bg-sunken')}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body text-ink">
                {twoLines ? c.nameZh : c.name}
                {!twoLines && c.nameZh && c.nameZh !== c.name && locale.startsWith('zh') ? '' : ''}
              </span>
              {twoLines && (
                <span className="block truncate text-small text-ink-2" lang="en">
                  {c.name}
                </span>
              )}
              <span className="block text-small text-ink-3">
                {c.city}, {c.state}
              </span>
            </span>
            {selected && <Check className="size-4 shrink-0 text-accent-text" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** Hook that owns the search query + active index + keyboard handling for a CampusList. */
export function useCampusListNav(rowCount: () => number, isSelectable: (i: number) => boolean, onEnter: (i: number) => void, onEscape?: () => void) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const move = (dir: 1 | -1) => {
    const n = rowCount();
    let i = activeIndex;
    for (let step = 0; step < n; step++) {
      i = (i + dir + n) % n;
      if (isSelectable(i)) {
        setActiveIndex(i);
        return;
      }
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        onEnter(activeIndex);
      }
    } else if (e.key === 'Escape') {
      onEscape?.();
    }
  };
  return { activeIndex, setActiveIndex, onKeyDown };
}

/** The pill + popover/sheet used in the shell. `compact` = icon + short name only (mobile top bar). */
export function CampusSwitcher({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT();
  const { campus, campusId, scope, setCampus, setScope, campuses, recent } = useCampus();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const allowNationwide = true;
  const nationwideDisabled = !nationwideAllowed(pathname);
  const rows = useCampusRows(campuses, query, allowNationwide, t('campus.recent'), recent);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(max-width: 767px)');
    const h = () => setIsMobile(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  const select = (c: Campus | null) => {
    setOpen(false);
    setQuery('');
    if (c === null) {
      if (nationwideDisabled) return;
      setScope('nationwide');
      track('campus.scope', { scope: 'nationwide' });
      toast.success(t('toast.campusSwitched', { campus: t('campus.nationwide') }));
      return;
    }
    setCampus(c.id);
    if (scope === 'nationwide') setScope('campus');
    track('campus.switch', { campusId: c.id });
    toast.success(t('toast.campusSwitched', { campus: c.shortName }));
  };

  const nav = useCampusListNav(
    () => rows.length,
    (i) => rows[i]?.kind !== 'header' && !(rows[i]?.kind === 'nationwide' && nationwideDisabled),
    (i) => {
      const r = rows[i];
      if (r?.kind === 'campus') select(r.campus);
      else if (r?.kind === 'nationwide') select(null);
    },
    () => setOpen(false),
  );

  // Close on outside click / Esc (desktop popover).
  useEffect(() => {
    if (!open || isMobile) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (open) {
      nav.setActiveIndex(-1);
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const isNationwide = scope === 'nationwide';
  const label = isNationwide ? t('campus.nationwide') : campus?.shortName ?? t('campus.choose');

  const panel = (
    <div className="flex max-h-[70vh] flex-col md:max-h-[480px]">
      <div className="relative shrink-0 px-2 pt-2">
        <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            nav.setActiveIndex(-1);
          }}
          onKeyDown={nav.onKeyDown}
          placeholder={t('campus.searchPlaceholder')}
          aria-label={t('campus.searchPlaceholder')}
          aria-controls={listId}
          aria-expanded="true"
          role="combobox"
          aria-autocomplete="list"
          className="h-10 w-full rounded-ctl border border-line-strong bg-surface pl-9 pr-3 text-[16px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none md:text-body"
        />
      </div>
      <CampusList
        campuses={campuses}
        query={query}
        selectedId={campusId}
        nationwideSelected={isNationwide}
        allowNationwide={allowNationwide}
        nationwideDisabled={nationwideDisabled}
        onSelect={select}
        activeIndex={nav.activeIndex}
        setActiveIndex={nav.setActiveIndex}
        listId={listId}
        recentIds={recent}
        className="mt-1 flex-1 px-2 pb-2"
      />
    </div>
  );

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('campus.switcherLabel', { campus: label })}
        className={cn(
          'flex h-9 max-w-[200px] items-center gap-1.5 rounded-pill border border-line bg-sunken px-3 text-small font-medium text-ink transition-colors duration-token-fast hover:border-line-strong',
          compact && 'max-w-[128px] px-2.5',
        )}
      >
        {isNationwide ? <Globe className="size-4 shrink-0" strokeWidth={1.75} aria-hidden /> : <MapPin className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />}
        <span key={label} className="truncate animate-fade-in">{label}</span>
        <ChevronDown className="size-4 shrink-0 text-ink-3" aria-hidden />
      </button>

      {isMobile ? (
        <Sheet open={open} onClose={() => setOpen(false)} title={t('campus.title')} snap="full">
          {panel}
        </Sheet>
      ) : (
        open && (
          <div className="absolute left-0 top-[calc(100%+8px)] z-layer-dropdown w-[360px] rounded-card border border-line bg-surface shadow-md animate-fade-in">
            {panel}
          </div>
        )
      )}
    </div>
  );
}

export default CampusSwitcher;
