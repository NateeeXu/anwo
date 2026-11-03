// Help center: FAQ (hairline accordion rows) + "request my campus" form.
import { useState, type FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button, Card, Input, Textarea } from '../components';
import { api } from '../lib/api';
import { useT } from '../lib/i18n';
import { toast } from '../lib/toast';
import { errorMessage } from '../app/errors';
import { Head } from '../app/Head';
import { Paragraphs } from './static/TextPage';
import { cn } from '../lib/cn';

const FAQ_COUNT = 10;

function CampusRequestForm() {
  const t = useT();
  const [form, setForm] = useState({ schoolName: '', city: '', state: '', email: '', note: '' });
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const send = useMutation({
    mutationFn: () => api<{ id: string }>('/api/campuses/requests', { method: 'POST', body: { ...form, state: form.state.trim().toUpperCase() || undefined, city: form.city || undefined, email: form.email || undefined, note: form.note || undefined } }),
    onSuccess: () => {
      setDone(true);
      toast.success(t('help.request.sent'));
    },
    onError: (err) => toast.error(errorMessage(t, err)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate();
  };
  if (done) return <p className="text-body text-ink-2">{t('help.request.thanks')}</p>;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <Input label={t('help.request.school')} required maxLength={120} value={form.schoolName} onChange={set('schoolName')} className="sm:col-span-2" />
      <Input label={t('help.request.city')} value={form.city} onChange={set('city')} />
      <Input label={t('help.request.state')} maxLength={2} placeholder="IL" value={form.state} onChange={set('state')} />
      <Input label={t('auth.email')} type="email" value={form.email} onChange={set('email')} hint={t('help.request.emailHint')} className="sm:col-span-2" />
      <Textarea label={t('help.request.note')} rows={2} maxLength={500} value={form.note} onChange={set('note')} className="sm:col-span-2" />
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" loading={send.isPending} disabled={!form.schoolName.trim()}>{t('common.submit')}</Button>
      </div>
    </form>
  );
}

export default function Help() {
  const t = useT();
  const [open, setOpen] = useState<number | null>(1);
  return (
    <div className="mx-auto w-full max-w-reading px-4">
      <Head title={t('help.title')} />
      <h1 className="text-h1-sm md:text-h1 text-ink">{t('help.title')}</h1>
      <p className="mt-2 text-body-lg text-ink-2">{t('help.intro')}</p>
      <nav className="mt-4 flex flex-wrap gap-2 text-small">
        <Link to="/safety" className="rounded-pill border border-line-strong bg-surface px-3 py-1.5 text-ink hover:bg-sunken">{t('nav.safety')}</Link>
        <Link to="/verify" className="rounded-pill border border-line-strong bg-surface px-3 py-1.5 text-ink hover:bg-sunken">{t('verify.title')}</Link>
        <Link to="/pricing" className="rounded-pill border border-line-strong bg-surface px-3 py-1.5 text-ink hover:bg-sunken">{t('billing.pricing.title')}</Link>
        <a href="#campus-request" className="rounded-pill border border-line-strong bg-surface px-3 py-1.5 text-ink hover:bg-sunken">{t('nav.requestCampus')}</a>
      </nav>

      <h2 className="mt-10 text-h2 text-ink">{t('help.faqTitle')}</h2>
      <ul className="mt-3 divide-y divide-line border-y border-line">
        {Array.from({ length: FAQ_COUNT }, (_, i) => i + 1).map((n) => {
          const expanded = open === n;
          return (
            <li key={n}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`faq-${n}`}
                onClick={() => setOpen(expanded ? null : n)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left text-body font-semibold text-ink"
              >
                {t(`help.q${n}.q`)}
                <ChevronDown className={cn('size-5 shrink-0 text-ink-3 transition-transform duration-token-base', expanded && 'rotate-180')} aria-hidden />
              </button>
              <div id={`faq-${n}`} hidden={!expanded} className="flex flex-col gap-2 pb-4">
                <Paragraphs text={t(`help.q${n}.a`)} />
              </div>
            </li>
          );
        })}
      </ul>

      <section id="campus-request" className="mt-12 scroll-mt-20">
        <h2 className="text-h2 text-ink">{t('help.request.title')}</h2>
        <p className="mb-4 mt-1 text-body text-ink-2">{t('help.request.intro')}</p>
        <Card padding="lg">
          <CampusRequestForm />
        </Card>
      </section>

      <section className="mt-12">
        <h2 className="text-h2 text-ink">{t('help.contact.title')}</h2>
        <p className="mt-1 text-body text-ink-2">{t('help.contact.body')}</p>
      </section>
    </div>
  );
}
