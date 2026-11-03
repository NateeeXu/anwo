// Stop detail body: routes at the stop, next departures (refetched every 30 s), alerts, address.
// Rendered inside a Sheet on mobile and inline in the sidebar on desktop (ShuttlePage decides).
import { ExternalLink, MapPin, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import { Button, EmptyState, Spinner } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import { CircleAlert } from 'lucide-react';
import { useNextDepartures, type StopItem } from '../api';
import { stopName } from '../labels';
import { AlertsBanner } from './AlertsBanner';
import { DeparturesList, useSecondsSince } from './Departures';
import { FavoriteButton } from './FavoriteButton';
import { RouteSwatch } from './RouteSwatch';

export function StopDetail({ stop, favorited, onSelectRoute, showHeader = true, showAlerts = true }: { stop: StopItem; favorited?: boolean; onSelectRoute?: (routeId: string) => void; showHeader?: boolean; /** false when the page already renders the campus alerts banner */ showAlerts?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const next = useNextDepartures(stop.id);
  const since = useSecondsSince(next.dataUpdatedAt || undefined);
  const data = next.data;
  const isFav = favorited ?? data?.stop.favorited ?? stop.favorited ?? false;
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${stop.lat}&mlon=${stop.lng}#map=17/${stop.lat}/${stop.lng}`;
  return (
    <div className="flex flex-col gap-4">
      {showHeader ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-h3 text-ink">{stopName(stop, locale)}</h2>
            {locale === 'zh-CN' && stop.nameZh ? <p className="text-small text-ink-3" lang="en">{stop.name}</p> : null}
          </div>
          <FavoriteButton entityType="stop" id={stop.id} favorited={isFav} size="md" />
        </div>
      ) : null}

      {showAlerts && data?.alerts?.length ? <AlertsBanner alerts={data.alerts} routes={data.stop.routes} /> : null}

      <section aria-labelledby={`next-${stop.id}`}>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 id={`next-${stop.id}`} className="text-caption uppercase tracking-wide text-ink-3">{t('shuttle.nextDepartures')}</h3>
          <span className="flex items-center gap-1 text-caption text-ink-3" aria-live="off">
            {next.isFetching ? <Spinner size={12} label={t('common.loading')} /> : <RefreshCw className="size-3" aria-hidden="true" />}
            {since < 5 ? t('shuttle.updatedJustNow') : t('shuttle.updatedAgo', { n: since })}
          </span>
        </div>
        {next.isError ? (
          <EmptyState size="sm" icon={CircleAlert} title={t('shuttle.error')} action={{ label: t('common.retry'), onClick: () => void next.refetch(), variant: 'secondary' }} />
        ) : (
          <DeparturesList departures={data?.departures} loading={next.isLoading} secondsSince={since} />
        )}
        <p className="mt-1 text-caption text-ink-3">{t('shuttle.refreshedEvery')}</p>
      </section>

      <section>
        <h3 className="mb-1 text-caption uppercase tracking-wide text-ink-3">{t('shuttle.routesServing')}</h3>
        <ul className="flex flex-col divide-y divide-line">
          {(data?.stop.routes ?? stop.routes ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <RouteSwatch color={r.color} shortName={r.shortName} />
              <span className="min-w-0 flex-1 truncate text-body text-ink">{r.name}</span>
              {onSelectRoute ? (
                <Button variant="ghost" size="sm" onClick={() => onSelectRoute(r.id)}>{t('shuttle.selectRoute')}</Button>
              ) : null}
              <Button asChild variant="ghost" size="sm"><Link to={`/shuttle/${r.id}`}>{t('shuttle.viewRoute')}</Link></Button>
            </li>
          ))}
        </ul>
      </section>

      {stop.address || stop.code ? (
        <section className="rounded-card bg-sunken px-4 py-3 text-small text-ink-2">
          {stop.address ? (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden="true" />
              <span>{stop.address}</span>
            </p>
          ) : null}
          {stop.code ? <p className="mt-1 text-caption text-ink-3">{t('shuttle.stopCode')} · <span className="font-mono">{stop.code}</span></p> : null}
          <a href={mapsUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-small text-accent-text-strong underline-offset-2 hover:underline">
            {t('shuttle.openInMaps')} <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </section>
      ) : null}
    </div>
  );
}
