// Service alerts banner (DESIGN §7.10): one row per alert, severity-tinted, dismissible per alert id for the session.
import { useState } from 'react';
import { AlertTriangle, Info, OctagonAlert, X } from 'lucide-react';
import { Link } from 'react-router';
import type { ShuttleAlert } from '@shared/types';
import { Button } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { session } from '@/lib/storage';
import { alertBody, alertTitle } from '../labels';
import type { RouteSummary } from '../api';

const KEY = 'anwo.shuttle.dismissedAlerts';

function readDismissed(): string[] {
  return session.get<string[]>(KEY, []);
}

const TONE = {
  info: { wrap: 'bg-info-soft text-info', Icon: Info },
  warning: { wrap: 'bg-warning-soft text-warning', Icon: AlertTriangle },
  critical: { wrap: 'bg-danger-soft text-danger', Icon: OctagonAlert },
} as const;

export function AlertsBanner({ alerts, routes, className, linkRoutes = true }: { alerts: ShuttleAlert[]; routes?: Pick<RouteSummary, 'id' | 'name' | 'color'>[]; className?: string; linkRoutes?: boolean }) {
  const t = useT();
  const { locale, formatDate } = useLocale();
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [expanded, setExpanded] = useState<string[]>([]);
  const visible = alerts.filter((a) => !dismissed.includes(a.id));
  if (!visible.length) return null;
  const routeOf = (id: string | null) => (id ? routes?.find((r) => r.id === id) : undefined);
  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    session.set(KEY, next);
  };
  return (
    <div className={cn('flex flex-col gap-2', className)} role="region" aria-label={t('shuttle.alerts')}>
      {visible.map((a) => {
        const tone = TONE[a.severity] ?? TONE.info;
        const route = routeOf(a.routeId);
        const body = alertBody(a, locale);
        return (
          <div key={a.id} className={cn('flex items-start gap-3 rounded-card px-4 py-3', tone.wrap)} role={a.severity === 'critical' ? 'alert' : 'status'}>
            <tone.Icon className="mt-0.5 size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-caption uppercase tracking-wide opacity-80">
                <span>{t(`shuttle.alert.${a.severity}`)}</span>
                <span aria-hidden="true">·</span>
                {route ? (
                  linkRoutes ? (
                    <Link to={`/shuttle/${route.id}`} className="underline-offset-2 hover:underline">{route.name}</Link>
                  ) : (
                    <span>{route.name}</span>
                  )
                ) : (
                  <span>{t('shuttle.alert.allRoutes')}</span>
                )}
                {a.endsAt ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{t('shuttle.alert.until', { date: formatDate(a.endsAt, 'monthDay') })}</span>
                  </>
                ) : null}
              </div>
              <p className="text-body font-medium text-current max-sm:text-small">{alertTitle(a, locale)}</p>
              {body ? (
                <>
                  {/* small screens: the body stays behind a toggle so two alerts do not fill the first screen */}
                  <p className={cn('mt-0.5 text-small opacity-90', !expanded.includes(a.id) && 'max-sm:hidden')}>{body}</p>
                  <button type="button" onClick={() => setExpanded((x) => (x.includes(a.id) ? x.filter((i) => i !== a.id) : [...x, a.id]))} aria-expanded={expanded.includes(a.id)}
                    className="mt-0.5 text-small font-medium underline underline-offset-2 sm:hidden">
                    {expanded.includes(a.id) ? t('shuttle.alert.less') : t('shuttle.alert.more')}
                  </button>
                </>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" iconOnly aria-label={t('shuttle.alert.dismiss')} onClick={() => dismiss(a.id)} className="-mr-2 -mt-1 text-current hover:bg-transparent">
              <X />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
