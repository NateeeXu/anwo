// /kit — Newcomer Kit (DESIGN §7.14): h1 + Badge sponsored + disclosure, stage switcher 出发前 / 落地 7 天 / 第一个月,
// category sections as 3-col grids of partner cards (tracked outbound 「前往 ↗」, 「赞助」 caption, 「无需 SSN」 chip,
// 「我已办好」 checkbox), left rail checklist 「落地第一周」 (server for members, localStorage for visitors).
import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, CircleAlert, ListChecks, Share2 } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, Button, Card, Checkbox, Chip, EmptyState, SegmentedControl, Skeleton } from '@/components';
import { Head } from '@/app/Head';
import { useAuth } from '@/lib/auth';
import { useCampus } from '@/lib/campus';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import { storage } from '@/lib/storage';
import { toast } from '@/lib/toast';
import { track } from '@/lib/track';
import { useKitDone, usePartners, type PartnerDto } from '../api';

const CHECKLIST_KEY = 'anwo.kit.done';
export const KIT_CATEGORY_ORDER = ['bank', 'sim', 'insurance', 'other', 'movers', 'storage', 'furniture', 'airport_pickup', 'housing', 'food'];
const STAGES = ['pre_arrival', 'arrival', 'settled'] as const;
type Stage = (typeof STAGES)[number];

/** Checklist state: members persist on the server (POST /kit/done); visitors use localStorage (per device). */
export function useKitChecklist(serverDone: string[] | undefined) {
  const { status } = useAuth();
  const done = useKitDone();
  const [local, setLocal] = useState<string[]>(() => storage.get<string[]>(CHECKLIST_KEY, []));
  const set = useMemo(() => new Set(status === 'authed' ? serverDone ?? [] : local), [status, serverDone, local]);
  const toggle = (slug: string) => {
    const next = !set.has(slug);
    track('kit.card_done', { slug, done: next });
    if (status === 'authed') done.mutate({ slug, done: next });
    else { const arr = next ? [...local, slug] : local.filter((s) => s !== slug); setLocal(arr); storage.set(CHECKLIST_KEY, arr); }
  };
  return { isDone: (slug: string) => set.has(slug), toggle, count: set.size };
}

export function PartnerCard({ p, done, onToggle, placement = 'kit', compact }: { p: PartnerDto; done?: boolean; onToggle?: () => void; placement?: string; compact?: boolean }) {
  const t = useT();
  const { isZh } = useLocale();
  const { campusId } = useCampus();
  const name = isZh ? p.nameZh || p.name : p.name;
  const tagline = isZh ? p.taglineZh || p.tagline : p.tagline;
  const promo = isZh ? p.promoTextZh || p.promoText : p.promoText;
  const go = `${p.goUrl.split('?')[0]}?placement=${placement}${campusId ? `&campusId=${campusId}` : ''}`;
  return (
    <Card as="article" padding="md" className={cn('flex flex-col gap-2', done && 'opacity-80')} data-partner={p.slug}>
      <div className="flex items-start gap-3">
        {p.logoUrl && <img src={p.logoUrl} alt="" className="size-10 shrink-0 rounded-sm bg-sunken object-cover dark:brightness-[.92]" />}
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-semibold text-ink"><Link to={`/kit/${p.slug}`} className="hover:underline">{name}</Link></h3>
          {!isZh && p.nameZh && <span className="block text-caption text-ink-3" lang="zh-CN">{p.nameZh}</span>}
        </div>
        {p.isSponsored ? <span className="text-caption text-ink-3">{t('ui.sponsored')}</span> : <span className="text-caption text-success">{t('billing.kit.nonSponsored')}</span>}
      </div>
      {tagline && <p className={cn('text-small text-ink-2', compact ? 'line-clamp-1' : 'line-clamp-2')}>{tagline}</p>}
      <div className="flex flex-wrap gap-1.5">
        {promo && <Chip variant="accent" size="sm">{promo}</Chip>}
        {p.noSsnOk && <Chip size="sm">{t('billing.kit.noSsn')}</Chip>}
        {p.feeFree && <Chip size="sm">{t('billing.kit.feeFree')}</Chip>}
        {p.campusBranch && <Chip size="sm">{t('billing.kit.campusBranch')}</Chip>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        {onToggle ? <Checkbox label={t('billing.kit.done')} checked={!!done} onChange={onToggle} /> : <span />}
        <Button asChild variant="secondary" size="sm" iconRight={<ArrowUpRight />}>
          <a href={go} target="_blank" rel="sponsored noopener" onClick={() => track('affiliate.click', { slug: p.slug, category: p.category, placement })}>{t('billing.kit.go')}</a>
        </Button>
      </div>
    </Card>
  );
}

export default function KitPage() {
  const t = useT();
  const { campus, campusId } = useCampus();
  const { status } = useAuth();
  const { isZh } = useLocale();
  const localName = (p: PartnerDto) => (isZh ? p.nameZh || p.name : p.name);
  const [stage, setStage] = useState<Stage | 'all'>('all');
  const q = usePartners({ campusId, stage: stage === 'all' ? null : stage });
  const checklist = useKitChecklist(q.data?.done);
  useEffect(() => { track('kit.view', { campusId, stage, preArrival: status !== 'authed' }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stage]);
  const categories = q.data?.categories ?? [];
  const all = categories.flatMap((c) => c.partners);
  const checklistItems = all.filter((p) => p.stages.includes('first_7_days') || p.stages.includes('before_you_fly')).slice(0, 8);
  const share = async () => {
    const url = `${window.location.origin}/kit?campus=${campusId ?? ''}`;
    try { if (navigator.share) await navigator.share({ title: t('billing.kit.shareTitle', { campus: campus?.shortName ?? '' }), url }); else { await navigator.clipboard.writeText(url); toast.success(t('billing.success.copied')); } } catch { /* dismissed */ }
  };
  return (
    <div className="mx-auto w-full max-w-content px-4 lg:px-8">
      <Head title={t('billing.kit.title')} description={t('billing.kit.disclosure')} />
      <header className="mb-4 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h1 text-ink">{t('billing.kit.title')}</h1>
          <Badge variant="sponsored" />
          {campus && <span className="text-small text-ink-3">· {campus.shortName}</span>}
          <Button variant="ghost" size="sm" iconLeft={<Share2 />} onClick={share} className="ml-auto">{t('billing.kit.share')}</Button>
        </div>
        <p className="text-small text-ink-2">{t('billing.kit.intro')}</p>
        <p className="text-caption text-ink-3">{t('billing.kit.disclosure')}</p>
        <SegmentedControl label={t('billing.kit.stage')} size="sm" value={stage} onChange={(v) => setStage(v as Stage | 'all')} options={[{ value: 'all', label: t('billing.kit.stage.all') }, ...STAGES.map((s) => ({ value: s, label: t(`billing.kit.stage.${s}`) }))]} />
      </header>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="order-2 lg:order-1">
          <Card padding="md" className="flex flex-col gap-2 lg:sticky lg:top-20">
            <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-small font-semibold text-ink"><ListChecks className="size-4 text-ink-2" aria-hidden />{t('billing.kit.checklist')}</h2><span className="text-caption tnum text-ink-3">{checklistItems.filter((p) => checklist.isDone(p.slug)).length}/{checklistItems.length}</span></div>
            {q.isLoading ? <Skeleton variant="text" lines={5} /> : (
              <ul className="flex flex-col">
                {checklistItems.map((p) => (
                  <li key={p.slug}><Checkbox label={<span className={cn(checklist.isDone(p.slug) && 'text-ink-3 line-through')}>{t(`billing.kit.task.${p.category}`)} · {localName(p)}</span>} checked={checklist.isDone(p.slug)} onChange={() => checklist.toggle(p.slug)} /></li>
                ))}
              </ul>
            )}
            <p className="text-caption text-ink-3">{status === 'authed' ? t('billing.kit.checklistSynced') : t('billing.kit.checklistLocal')}</p>
          </Card>
        </aside>
        <div className="order-1 flex flex-col gap-8 lg:order-2">
          {q.isLoading && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Skeleton variant="rect" height={180} /><Skeleton variant="rect" height={180} /><Skeleton variant="rect" height={180} /></div>}
          {q.isError && <EmptyState icon={CircleAlert} title={t('error.generic')} action={{ label: t('common.retry'), onClick: () => q.refetch() }} />}
          {q.data && q.data.enabled === false && <EmptyState title={t('billing.kit.disabled')} />}
          {q.data && q.data.enabled && categories.length === 0 && <EmptyState icon={Check} title={t('billing.kit.emptyStage')} action={{ label: t('billing.kit.stage.all'), onClick: () => setStage('all') }} />}
          {categories.map((c) => (
            <section key={c.key} aria-labelledby={`kit-${c.key}`}>
              <div className="mb-3 flex items-baseline justify-between"><h2 id={`kit-${c.key}`} className="text-h2 text-ink">{t(`billing.kit.category.${c.key}`)}</h2><span className="text-caption text-ink-3">{t(`billing.kit.categoryHint.${c.key}`)}</span></div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {c.partners.map((p) => <PartnerCard key={p.id} p={p} done={checklist.isDone(p.slug)} onToggle={() => checklist.toggle(p.slug)} />)}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
