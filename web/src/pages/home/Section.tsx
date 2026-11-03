// Section chrome + query-state helper shared by Home / Search / Profile.
import type { ReactNode } from 'react';
import { ArrowRight, Hammer, RefreshCw } from 'lucide-react';
import { Link } from 'react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button, EmptyState } from '../../components';
import { ApiError } from '../../lib/api';
import { useT } from '../../lib/i18n';
import { cn } from '../../lib/cn';

export function Section({ title, subtitle, linkTo, linkLabel, children, className, id }: { title: string; subtitle?: string; linkTo?: string; linkLabel?: string; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('mt-8 md:mt-12', className)} aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="mb-3 flex items-end justify-between gap-4 md:mb-4">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-h2 text-ink">
            {title}
          </h2>
          {subtitle && <p className="text-small text-ink-2">{subtitle}</p>}
        </div>
        {linkTo && (
          <Link to={linkTo} className="flex shrink-0 items-center gap-1 rounded-sm text-small text-ink-2 hover:text-ink">
            {linkLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function isNotImplemented(error: unknown) {
  return error instanceof ApiError && (error.status === 501 || error.code === 'NOT_IMPLEMENTED' || (error.status === 404 && error.code === 'NOT_FOUND'));
}

/** Server module stubs answer `{ module, status: 'stub' }` until the module agent ships the real router. */
export function isStub(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { status?: unknown }).status === 'stub';
}

/** Renders skeleton → error (501 = "under construction") → empty → data. */
export function QueryState<T>({ query, skeleton, empty, isEmpty, children }: { query: UseQueryResult<T>; skeleton: ReactNode; empty: ReactNode; isEmpty?: (data: T) => boolean; children: (data: T) => ReactNode }) {
  const t = useT();
  if (query.isPending) return <div aria-busy="true">{skeleton}</div>;
  if (query.isError) {
    if (isNotImplemented(query.error)) {
      return <EmptyState size="sm" icon={<Hammer />} title={t('section.notReady')} description={t('section.notReadyHint')} />;
    }
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-4 py-8 text-center">
        <p className="text-body text-ink-2">{t('error.generic')}</p>
        <Button variant="secondary" size="sm" iconLeft={<RefreshCw />} onClick={() => query.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }
  const data = query.data as T;
  if (isStub(data)) return <EmptyState size="sm" icon={<Hammer />} title={t('section.notReady')} description={t('section.notReadyHint')} />;
  const emptyNow = isEmpty ? isEmpty(data) : Array.isArray(data) ? data.length === 0 : !data;
  if (emptyNow) return <>{empty}</>;
  return <>{children(data)}</>;
}

export function CardGrid({ children, cols = 4, className }: { children: ReactNode; cols?: 2 | 3 | 4 | 6; className?: string }) {
  const grid = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6',
  }[cols];
  return <div className={cn('grid gap-3 lg:gap-5', grid, className)}>{children}</div>;
}
