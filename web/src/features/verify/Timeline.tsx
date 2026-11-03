// Status history for the verification center — audit entries about me + my verify.* events.
import { useState } from 'react';
import { CircleCheck, CircleX, CreditCard, FileClock, History, Mail, Phone, ShieldAlert, Upload, UserCog } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '@/components';
import { useLocale, useT } from '@/lib/i18n';
import type { TimelineEntry } from './api';
import { useTimeline } from './api';
import { typeLabel } from './labels';

function iconFor(action: string) {
  if (action.endsWith('approve')) return { Icon: CircleCheck, tone: 'text-success bg-success-soft' };
  if (action.endsWith('reject')) return { Icon: CircleX, tone: 'text-danger bg-danger-soft' };
  if (action.includes('edu')) return { Icon: Mail, tone: 'text-ink-2 bg-sunken' };
  if (action.includes('phone')) return { Icon: Phone, tone: 'text-ink-2 bg-sunken' };
  if (action.includes('payment')) return { Icon: CreditCard, tone: 'text-ink-2 bg-sunken' };
  if (action.includes('override')) return { Icon: UserCog, tone: 'text-accent bg-accent-soft' };
  if (action.endsWith('claim')) return { Icon: FileClock, tone: 'text-info bg-info-soft' };
  if (action.endsWith('cancel')) return { Icon: ShieldAlert, tone: 'text-ink-3 bg-sunken' };
  return { Icon: Upload, tone: 'text-ink-2 bg-sunken' };
}

export function TimelineList({ items }: { items: TimelineEntry[] }) {
  const t = useT();
  const { formatRelative, formatDate } = useLocale();
  return (
    <ol className="flex flex-col">
      {items.map((e, i) => {
        const { Icon, tone } = iconFor(e.action);
        const type = typeLabel(t, (e.data.type as string | undefined) ?? null);
        const key = `verify.timeline.${e.action}`;
        let text = t(key, { type, to: String(e.data.to ?? e.data.trustLevel ?? '') });
        if (text === key) text = e.action;
        const who = e.source === 'audit' ? (e.actorRole === 'admin' ? t('verify.timeline.by.admin') : t('verify.timeline.by.system')) : t('verify.timeline.by.you');
        return (
          <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-line" aria-hidden />}
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-pill ${tone}`} aria-hidden><Icon size={15} strokeWidth={1.75} /></span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-small text-ink">{text}</p>
              {e.reason && <p className="mt-0.5 text-small text-ink-2">{t('verify.timeline.reason', { reason: e.reason })}</p>}
              <p className="mt-0.5 text-caption text-ink-3" title={formatDate(e.createdAt, 'datetime')}>{who} · {formatRelative(e.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline() {
  const t = useT();
  const q = useTimeline();
  const [limit, setLimit] = useState(6);
  if (q.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="row" />)}
      </div>
    );
  }
  const items = q.data?.items ?? [];
  if (!items.length) return <EmptyState size="sm" icon={History} title={t('verify.timeline.empty')} description={t('verify.timeline.emptyHint')} />;
  return (
    <div className="flex flex-col gap-3">
      <TimelineList items={items.slice(0, limit)} />
      {items.length > limit && <div><Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + 10)}>{t('verify.timeline.more')}</Button></div>}
    </div>
  );
}
