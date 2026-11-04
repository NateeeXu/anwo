// /kit/:slug — partner detail: full description zh/en, what you need, user bonus, disclosure line, tracked 「前往」,
// "report a problem with this partner" (reports entity_type='partner'), related partners.
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, CircleAlert, Flag, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { Badge, Button, Card, Checkbox, Chip, EmptyState, Modal, Select, Skeleton, Textarea } from '@/components';
import { Head } from '@/app/Head';
import { errorMessage } from '@/app/errors';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { usePartner, useReportPartner } from '../api';
import { PartnerCard, PartnerMark, useKitChecklist } from './Kit';

export default function PartnerDetailPage() {
  const t = useT();
  const { slug } = useParams();
  const navigate = useNavigate();
  const { isZh } = useLocale();
  const { campusId } = useCampus();
  const { status } = useAuth();
  const q = usePartner(slug);
  const p = q.data;
  const checklist = useKitChecklist(p?.done ? [p.slug] : []);
  const report = useReportPartner();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('wrong_info');
  const [details, setDetails] = useState('');
  // kit.card_view / affiliate.click are logged by the server (partner detail + /go redirect)
  const name = p ? (isZh ? p.nameZh || p.name : p.name) : '';
  const go = p ? `${p.goUrl.split('?')[0]}?placement=kit${campusId ? `&campusId=${campusId}` : ''}` : '#';
  const submitReport = async () => {
    if (!p) return;
    try { await report.mutateAsync({ slug: p.slug, reason, details: details || undefined }); setReportOpen(false); toast.success(t('billing.kit.reportSent')); } catch (e) { toast.error(errorMessage(t, e)); }
  };
  return (
    <div className="mx-auto w-full max-w-detail px-4 lg:px-8">
      <Head title={name || t('billing.kit.title')} />
      <div className="mb-3"><Button variant="ghost" size="sm" iconLeft={<ArrowLeft />} onClick={() => navigate('/kit')}>{t('billing.kit.title')}</Button></div>
      {q.isLoading && <Skeleton variant="rect" height={320} />}
      {q.isError && <EmptyState icon={CircleAlert} title={t('error.NOT_FOUND')} action={<Button asChild variant="secondary"><Link to="/kit">{t('common.back')}</Link></Button>} />}
      {p && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card padding="lg" className="flex flex-col gap-4">
            <div className="flex items-start gap-4">
              <PartnerMark name={p.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-h1 text-ink">{name}</h1>
                  {p.isSponsored ? <Badge variant="sponsored" /> : <Badge variant="success" size="sm">{t('billing.kit.nonSponsored')}</Badge>}
                </div>
                <p className="text-small text-ink-2">{isZh ? p.taglineZh || p.tagline : p.tagline}</p>
                <p className="mt-1 text-caption text-ink-3">{t(`billing.kit.category.${p.category}`)}{p.subcategory ? ` · ${t(`billing.kit.sub.${p.subcategory}`)}` : ''}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(isZh ? p.promoTextZh || p.promoText : p.promoText) && <Chip variant="accent">{isZh ? p.promoTextZh || p.promoText : p.promoText}</Chip>}
              {p.noSsnOk && <Chip>{t('billing.kit.noSsn')}</Chip>}
              {p.feeFree && <Chip>{t('billing.kit.feeFree')}</Chip>}
              {p.campusBranch && <Chip>{t('billing.kit.campusBranch')}</Chip>}
            </div>
            <section>
              <h2 className="mb-1 text-h3 text-ink">{t('billing.kit.about')}</h2>
              <p className="text-body text-ink-2">{isZh ? p.descriptionZh || p.description : p.description}</p>
              {isZh && p.description && p.descriptionZh && <p className="mt-2 text-small text-ink-3" lang="en">{p.description}</p>}
            </section>
            {p.needs.length > 0 && (
              <section>
                <h2 className="mb-1 text-h3 text-ink">{t('billing.kit.needs')}</h2>
                <ul className="flex flex-wrap gap-1.5">{p.needs.map((n) => <li key={n}><Chip size="sm">{t(`billing.kit.need.${n}`)}</Chip></li>)}</ul>
              </section>
            )}
            {p.stages.length > 0 && <p className="text-caption text-ink-3">{t('billing.kit.bestTime')}: {p.stages.map((s) => t(`billing.kit.stageKey.${s}`)).join(' · ')}</p>}
            <p className="flex items-start gap-2 rounded-sm bg-sunken px-3 py-2 text-caption text-ink-2"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />{p.isSponsored ? t('billing.kit.disclosureCard') : t('billing.kit.nonSponsoredNote')}</p>
          </Card>
          <aside className="flex flex-col gap-3">
            <Card padding="lg" className="flex flex-col gap-3">
              <Button asChild variant="primary" size="lg" fullWidth iconRight={<ArrowUpRight />}>
                <a href={go} target="_blank" rel="sponsored noopener">{t('billing.kit.goTo', { name })}</a>
              </Button>
              <p className="text-caption text-ink-3">{t('billing.kit.goHint')}</p>
              <Checkbox label={t('billing.kit.done')} checked={checklist.isDone(p.slug)} onChange={() => checklist.toggle(p.slug)} />
              {status === 'authed' ? (
                <Button variant="ghost" size="sm" iconLeft={<Flag />} onClick={() => setReportOpen(true)}>{t('billing.kit.report')}</Button>
              ) : (
                <Link to={`/login?next=${encodeURIComponent(`/kit/${p.slug}`)}`} className="text-caption text-ink-3 underline">{t('billing.kit.loginToReport')}</Link>
              )}
            </Card>
            {p.related.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="text-small font-semibold text-ink">{t('billing.kit.related')}</h2>
                {p.related.map((r) => <PartnerCard key={r.id} p={r} compact />)}
              </div>
            )}
          </aside>
        </div>
      )}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={t('billing.kit.report')} size="sm" footer={<><Button variant="ghost" onClick={() => setReportOpen(false)}>{t('common.cancel')}</Button><Button variant="danger" loading={report.isPending} onClick={submitReport}>{t('common.submit')}</Button></>}>
        <div className="flex flex-col gap-3">
          <Select label={t('billing.kit.reportReason')} value={reason} onChange={(v) => v && setReason(v)} options={['wrong_info', 'scam', 'spam', 'fake', 'other'].map((r) => ({ value: r, label: t(`billing.kit.reportReasons.${r}`) }))} />
          <Textarea label={t('billing.kit.reportDetails')} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} optional maxLength={1000} />
        </div>
      </Modal>
    </div>
  );
}
