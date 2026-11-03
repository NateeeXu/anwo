// Global search input (⌘K): suggestions from GET /api/search/suggest, Enter → /search?q=.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { useCampus } from '../../lib/campus';
import { useT } from '../../lib/i18n';
import { track } from '../../lib/track';
import { cn } from '../../lib/cn';

type Suggestion = { type: string; id: string; label: string; sublabel?: string; link: string };

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function GlobalSearch({ className, autoFocus, size = 'md' }: { className?: string; autoFocus?: boolean; size?: 'md' | 'lg' }) {
  const t = useT();
  const navigate = useNavigate();
  const { campusId, scope } = useCampus();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const dq = useDebounced(q.trim(), 200);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  const { data } = useQuery({
    queryKey: ['search', 'suggest', dq, scope === 'nationwide' ? null : campusId],
    queryFn: () => api<{ suggestions: Suggestion[] }>('/api/search/suggest', { query: { q: dq, campusId: scope === 'nationwide' ? undefined : campusId ?? undefined } }),
    enabled: dq.length >= 1 && open,
    staleTime: 30_000,
    retry: false,
  });
  const suggestions = data?.suggestions ?? [];

  // ⌘K / Ctrl+K focuses the search box.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const submit = (value: string) => {
    const term = value.trim();
    if (!term) return;
    setOpen(false);
    track('search.submit', { q: term });
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % suggestions.length);
      setOpen(true);
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = active >= 0 ? suggestions[active] : undefined;
      if (s) {
        setOpen(false);
        navigate(s.link);
      } else submit(q);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)} role="search">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        role="combobox"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className={cn(
          'w-full rounded-ctl border border-line-strong bg-surface pl-9 pr-14 text-[16px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none md:text-body',
          size === 'lg' ? 'h-12' : 'h-10',
        )}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-xs border border-line bg-sunken px-1.5 font-mono text-caption text-ink-3 md:block" aria-hidden>
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
      {open && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-layer-dropdown rounded-card border border-line bg-surface p-1 shadow-md animate-fade-in">
          {suggestions.map((s, i) => (
            <li
              key={`${s.type}-${s.id}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                navigate(s.link);
              }}
              className={cn('flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2', i === active && 'bg-sunken')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body text-ink">{s.label}</span>
                {s.sublabel && <span className="block truncate text-small text-ink-3">{s.sublabel}</span>}
              </span>
              <span className="text-caption text-ink-3">{t(`search.type.${s.type}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default GlobalSearch;
