// /dev/mailbox: codes captured by the dev mail/SMS transport (API.md §2.9). Non-production only.
import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '../components';
import { NoMessages } from '../components/illustrations';
import { api } from '../lib/api';
import { useLocale, useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { Head } from '../app/Head';
import { QueryState } from './home/Section';

type Mail = { id: string; to: string; subject?: string; body: string; code: string | null; purpose: string; consumedAt: string | null; createdAt: string };
type Mailbox = { emails: Mail[]; sms: Mail[] };

export default function DevMailbox() {
  const t = useT();
  const { formatRelative } = useLocale();
  const qc = useQueryClient();
  const box = useQuery({ queryKey: ['dev', 'mailbox'], queryFn: () => api<Mailbox>('/api/dev/mailbox', { query: { limit: 100 } }), refetchInterval: 5000 });
  const clear = useMutation({
    mutationFn: () => api('/api/dev/mailbox', { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dev', 'mailbox'] });
      toast.success(t('devMailbox.cleared'));
    },
  });
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('devMailbox.copied', { code }));
    } catch {
      toast.error(t('error.generic'));
    }
  };
  const rows = box.data ? [...box.data.emails.map((m) => ({ ...m, channel: 'email' })), ...box.data.sms.map((m) => ({ ...m, channel: 'sms' }))].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];

  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('devMailbox.title')} />
      <PageHeader
        title={t('devMailbox.title')}
        subtitle={t('devMailbox.subtitle')}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" iconLeft={<RefreshCw />} onClick={() => box.refetch()}>{t('common.refresh')}</Button>
            <Button variant="secondary" size="sm" iconLeft={<Trash2 />} loading={clear.isPending} onClick={() => clear.mutate()}>{t('devMailbox.clear')}</Button>
          </div>
        }
      />
      <QueryState query={box} skeleton={<Skeleton variant="rect" height={240} />} isEmpty={() => rows.length === 0} empty={<EmptyState icon={<NoMessages />} title={t('devMailbox.empty')} description={t('devMailbox.emptyHint')} />}>
        {() => (
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full text-small">
              <thead className="bg-sunken text-caption text-ink-2">
                <tr>
                  <th className="h-10 px-3 text-left font-medium">{t('devMailbox.col.time')}</th>
                  <th className="h-10 px-3 text-left font-medium">{t('devMailbox.col.channel')}</th>
                  <th className="h-10 px-3 text-left font-medium">{t('devMailbox.col.to')}</th>
                  <th className="h-10 px-3 text-left font-medium">{t('devMailbox.col.purpose')}</th>
                  <th className="h-10 px-3 text-left font-medium">{t('devMailbox.col.code')}</th>
                  <th className="h-10 px-3 text-left font-medium">{t('devMailbox.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-line hover:bg-sunken/60">
                    <td className="px-3 py-2 text-ink-2">{formatRelative(m.createdAt)}</td>
                    <td className="px-3 py-2"><Badge variant="neutral" size="sm">{m.channel}</Badge></td>
                    <td className="px-3 py-2 font-mono text-ink">{m.to}</td>
                    <td className="px-3 py-2 text-ink-2">{m.purpose}</td>
                    <td className="px-3 py-2">
                      {m.code ? (
                        <button type="button" onClick={() => copy(m.code!)} className="flex items-center gap-1.5 rounded-sm font-mono text-body text-ink hover:underline" aria-label={t('devMailbox.copy', { code: m.code })}>
                          {m.code}
                          <Copy className="size-3.5 text-ink-3" aria-hidden />
                        </button>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{m.consumedAt ? <Badge variant="neutral" size="sm">{t('devMailbox.consumed')}</Badge> : <Badge variant="success" size="sm">{t('devMailbox.fresh')}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </QueryState>
    </div>
  );
}
