// Campus onboarding (DESIGN.md §7.16): geolocation suggest, searchable list by state, nationwide option.
import { useEffect, useId, useMemo, useState } from 'react';
import { Globe, LocateFixed, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router';
import type { Campus } from '@shared/types';
import { campusForEmail } from '@shared/campuses';
import { NAME_DISPLAY } from '@shared/brand';
import { Button } from '../components';
import { Mark } from '../components/brand';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCampus } from '../lib/campus';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { track } from '../lib/track';
import { Head } from '../app/Head';
import { LangToggle } from '../app/shell/LangToggle';
import { CampusList, useCampusListNav, useCampusRows } from '../app/shell/CampusSwitcher';
import { cn } from '../lib/cn';

type Suggest = { suggested: Campus | null; nearest: (Campus & { distanceM: number })[] };

export default function Welcome() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const { user } = useAuth();
  const { campuses, campusId, setCampus, setScope, recent } = useCampus();
  const [query, setQuery] = useState('');
  const [choice, setChoice] = useState<string | 'nationwide' | null>(user?.campusId ?? campusId ?? null);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<'idle' | 'asking' | 'denied'>('idle');
  const listId = useId();

  const eduCampus = useMemo(() => (user?.email ? campusForEmail(user.email) : user?.eduEmail ? campusForEmail(user.eduEmail) : undefined), [user]);
  useEffect(() => {
    if (!choice && eduCampus) setChoice(eduCampus.id);
  }, [eduCampus, choice]);

  const suggest = useQuery({
    queryKey: ['campuses', 'suggest', geo],
    queryFn: () => api<Suggest>('/api/campuses/suggest', { query: { lat: geo!.lat, lng: geo!.lng } }),
    enabled: !!geo,
  });

  const locate = () => {
    if (!('geolocation' in navigator)) return setGeoState('denied');
    setGeoState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState('idle');
      },
      () => setGeoState('denied'),
      { timeout: 8000, maximumAge: 600_000 },
    );
  };

  const suggestedIds = useMemo(() => {
    const ids: string[] = [];
    if (eduCampus) ids.push(eduCampus.id);
    if (suggest.data?.suggested) ids.push(suggest.data.suggested.id);
    suggest.data?.nearest.slice(0, 3).forEach((c) => ids.push(c.id));
    return Array.from(new Set(ids)).slice(0, 3);
  }, [eduCampus, suggest.data]);

  const rows = useCampusRows(campuses, query, false, t('campus.recent'), recent, suggestedIds, t('campus.suggested'));
  const nav = useCampusListNav(
    () => rows.length,
    (i) => rows[i]?.kind !== 'header',
    (i) => {
      const r = rows[i];
      if (r?.kind === 'campus') setChoice(r.campus.id);
      else if (r?.kind === 'nationwide') setChoice('nationwide');
    },
  );

  const finish = () => {
    if (!choice) return;
    if (choice === 'nationwide') {
      setScope('nationwide');
      track('campus.scope', { scope: 'nationwide', source: 'welcome' });
      navigate('/listings', { replace: true });
      return;
    }
    const c = campuses.find((x) => x.id === choice);
    setCampus(choice);
    setScope('campus');
    track('campus.switch', { campusId: choice, source: 'welcome' });
    if (c) toast.success(t('toast.campusSwitched', { campus: c.shortName }));
    navigate(next.startsWith('/') ? next : '/', { replace: true });
  };

  const chosen = choice && choice !== 'nationwide' ? campuses.find((c) => c.id === choice) : undefined;
  const primaryLabel = chosen && eduCampus?.id === chosen.id ? t('welcome.thatsMe') : t('common.continue');

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-0 py-0 md:px-4 md:py-10">
      <Head title={t('welcome.title')} />
      <div className="flex min-h-dvh w-full max-w-form flex-col bg-surface p-5 md:min-h-0 md:rounded-lg md:border md:border-line md:p-8">
        <div className="flex items-center gap-2 text-small text-ink-2">
          <Mark size={28} />
          <span>{NAME_DISPLAY}</span>
        </div>
        <h1 className="mt-5 text-display-sm md:text-display text-ink">{t('welcome.title')}</h1>
        <p className="mt-2 text-small text-ink-2">{t('welcome.subtitle')}</p>

        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              nav.setActiveIndex(-1);
            }}
            onKeyDown={nav.onKeyDown}
            placeholder={t('campus.searchPlaceholder')}
            aria-label={t('campus.searchPlaceholder')}
            className="h-11 w-full rounded-ctl border border-line-strong bg-surface pl-9 pr-3 text-[16px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-3">{t('welcome.suggested')}</span>
          {suggestedIds.length === 0 && geoState !== 'denied' && (
            <Button variant="ghost" size="sm" iconLeft={<LocateFixed />} loading={geoState === 'asking' || suggest.isFetching} onClick={locate}>
              {t('welcome.useLocation')}
            </Button>
          )}
          {geoState === 'denied' && suggestedIds.length === 0 && <span className="text-caption text-ink-3">{t('welcome.locationDenied')}</span>}
          {suggestedIds.map((id) => {
            const c = campuses.find((x) => x.id === id);
            if (!c) return null;
            const sel = choice === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={sel}
                onClick={() => setChoice(id)}
                className={cn('h-8 rounded-pill border px-3 text-small transition-colors duration-token-fast', sel ? 'border-inverse bg-inverse text-ink-inverse' : 'border-line-strong bg-surface text-ink hover:bg-sunken')}
              >
                {c.shortName}
              </button>
            );
          })}
        </div>

        <div className="mt-3 min-h-0 flex-1 rounded-card border border-line">
          <CampusList
            campuses={campuses}
            query={query}
            selectedId={choice === 'nationwide' ? null : choice}
            nationwideSelected={choice === 'nationwide'}
            allowNationwide={false}
            onSelect={(c) => setChoice(c ? c.id : 'nationwide')}
            activeIndex={nav.activeIndex}
            setActiveIndex={nav.setActiveIndex}
            listId={listId}
            suggestedIds={suggestedIds}
            recentIds={recent}
            className="max-h-[40vh] p-1 md:max-h-[320px]"
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            aria-pressed={choice === 'nationwide'}
            onClick={() => setChoice('nationwide')}
            className={cn('flex items-center gap-2 rounded-sm text-small hover:underline', choice === 'nationwide' ? 'text-ink' : 'text-accent-text')}
          >
            <Globe className="size-4" aria-hidden />
            {t('welcome.nationwide')}
          </button>
          <Button variant="primary" size="lg" disabled={!choice} onClick={finish}>
            {choice === 'nationwide' ? t('welcome.searchNationwide') : primaryLabel}
          </Button>
        </div>
        <div className="mt-6 flex justify-center">
          <LangToggle />
        </div>
      </div>
    </div>
  );
}
