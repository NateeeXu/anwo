// Map search box: local matches first (campuses, POIs and pins already loaded), then a geocoded address on Enter.
// Combobox pattern: ↑↓ move, Enter picks (or geocodes the text), Esc closes. Address search needs a session
// (API.md §7 `GET /api/map/geocode` is `user`); anonymous visitors still get campus / place matches.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Building2, CornerDownLeft, Loader2, MapPin, Search, X } from 'lucide-react';
import type { Campus, Poi } from '@shared/types';
import type { GeocodeHit } from '@shared/schemas/map';
import { useGeocode } from '@/components/map';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/cn';
import { useOnClickOutside } from '@/lib/hooks';
import { useLocale, useT } from '@/lib/i18n';
import { POI_ICONS, poiCategoryKey } from '../labels';

export type SearchPick =
  | { kind: 'campus'; campus: Campus }
  | { kind: 'poi'; poi: Poi }
  | { kind: 'address'; hit: GeocodeHit; query: string };

type Option = { key: string; group: 'campuses' | 'pois' | 'addresses'; label: string; sub: string; icon: typeof MapPin; pick: SearchPick };

export type MapSearchBoxProps = {
  campuses: Campus[];
  pois: Poi[];
  campusId?: string | null;
  near?: { lat: number; lng: number } | null;
  onPick: (pick: SearchPick) => void;
  onClear?: () => void;
  className?: string;
  autoFocus?: boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function MapSearchBox({ campuses, pois, campusId, near, onPick, onClear, className, autoFocus }: MapSearchBoxProps) {
  const t = useT();
  const { isZh } = useLocale();
  const { status: authStatus } = useAuth();
  const geo = useGeocode();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigated = useRef(false);
  useOnClickOutside(rootRef, () => setOpen(false), open);

  const q = norm(text);
  const options = useMemo<Option[]>(() => {
    if (q.length < 1) return [];
    const out: Option[] = [];
    for (const c of campuses) {
      const hay = norm(`${c.name} ${c.nameZh ?? ''} ${c.shortName} ${c.city} ${c.state}`);
      if (hay.includes(q)) out.push({ key: `campus:${c.id}`, group: 'campuses', label: isZh ? c.nameZh ?? c.name : c.name, sub: `${c.city}, ${c.state}`, icon: Building2, pick: { kind: 'campus', campus: c } });
      if (out.length >= 4) break;
    }
    let n = 0;
    for (const p of pois) {
      const hay = norm(`${p.name} ${p.nameZh ?? ''} ${p.address ?? ''} ${p.tags.join(' ')}`);
      if (!hay.includes(q)) continue;
      out.push({ key: `poi:${p.id}`, group: 'pois', label: isZh ? p.nameZh ?? p.name : p.name, sub: `${t(poiCategoryKey(p.category))}${p.address ? ` · ${p.address}` : ''}`, icon: POI_ICONS[p.category] ?? MapPin, pick: { kind: 'poi', poi: p } });
      if (++n >= 6) break;
    }
    if (geo.status === 'done' && geo.results.length) {
      for (const hit of geo.results) {
        out.push({ key: `addr:${hit.lat},${hit.lng}`, group: 'addresses', label: hit.addressLine1 ?? hit.displayName, sub: hit.approx ? t('map.search.approx') : [hit.city, hit.state].filter(Boolean).join(', '), icon: MapPin, pick: { kind: 'address', hit, query: text.trim() } });
      }
    }
    return out;
  }, [q, campuses, pois, geo.status, geo.results, isZh, t, text]);

  useEffect(() => { setActive(0); navigated.current = false; }, [q]);
  useEffect(() => { if (geo.status !== 'idle') geo.reset(); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (o: Option) => {
    onPick(o.pick);
    setText(o.label);
    setOpen(false);
    inputRef.current?.blur();
  };

  const runGeocode = async () => {
    if (text.trim().length < 3 || authStatus !== 'authed') return;
    const results = await geo.search(text, { campusId, near });
    if (results.length === 1) {
      const hit = results[0]!;
      onPick({ kind: 'address', hit, query: text.trim() });
      setOpen(false);
    } else setOpen(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); navigated.current = true; setOpen(true); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); navigated.current = true; setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const o = options[active];
      if (open && navigated.current && o) choose(o);
      else if (authStatus === 'authed' && text.trim().length >= 3 && !options.some((x) => x.group !== 'addresses')) void runGeocode();
      else if (o) choose(o);
      else void runGeocode();
    }
  };

  const groups: Option['group'][] = ['campuses', 'pois', 'addresses'];
  const showPanel = open && q.length > 0;
  const canGeocode = authStatus === 'authed' && text.trim().length >= 3;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(e) => { e.preventDefault(); void runGeocode(); }}
        className="flex h-10 items-center gap-2 rounded-ctl border border-line-strong bg-surface px-3 focus-within:border-accent"
      >
        <Search className="size-4 shrink-0 text-ink-3" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('map.search.placeholder')}
          aria-label={t('map.search.placeholder')}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && options[active] ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3 md:text-body [&::-webkit-search-cancel-button]:hidden"
        />
        {geo.status === 'loading' && <Loader2 className="size-4 shrink-0 animate-spin text-ink-3" aria-label={t('map.search.loading')} />}
        {text && (
          <button
            type="button"
            className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-pill text-ink-3 hover:bg-sunken hover:text-ink"
            aria-label={t('map.search.clear')}
            onClick={() => { setText(''); geo.reset(); setOpen(false); onClear?.(); inputRef.current?.focus(); }}
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </form>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-layer-dropdown mt-1 overflow-hidden rounded-card border border-line bg-surface shadow-md animate-fade-in">
          <ul id={listId} role="listbox" aria-label={t('map.search.placeholder')} className="max-h-80 overflow-y-auto py-1">
            {groups.map((g) => {
              const rows = options.map((o, i) => ({ o, i })).filter((x) => x.o.group === g);
              if (!rows.length) return null;
              return (
                <li key={g} role="presentation">
                  <p className="px-3 pb-1 pt-2 text-caption text-ink-3">{t(`map.search.${g}`)}</p>
                  <ul role="presentation">
                    {rows.map(({ o, i }) => (
                      <li
                        key={o.key}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(o)}
                        className={cn('flex cursor-pointer items-center gap-2.5 px-3 py-2', i === active ? 'bg-sunken' : '')}
                      >
                        <o.icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-small text-ink">{o.label}</span>
                          <span className="truncate text-caption text-ink-2">{o.sub}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line px-3 py-2 text-caption text-ink-2">
            {authStatus !== 'authed' ? (
              <span>{t('map.search.loginHint')}</span>
            ) : geo.status === 'done' && !geo.results.length ? (
              <span>{t('map.search.noResults')}</span>
            ) : geo.status === 'error' ? (
              <span className="text-danger">{t('map.search.error')}</span>
            ) : canGeocode && geo.status !== 'done' ? (
              <button type="button" className="inline-flex items-center gap-1.5 text-accent-text hover:underline" onMouseDown={(e) => e.preventDefault()} onClick={() => void runGeocode()}>
                <CornerDownLeft className="size-3.5" aria-hidden />
                {t('map.search.findAddress', { q: text.trim() })}
              </button>
            ) : (
              <span>{t('map.search.typeMore')}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MapSearchBox;
