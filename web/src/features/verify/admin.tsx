// Admin panel for "verify" — mounted by the admin shell at /admin/verify (and at /verify/admin as a standalone route).
// Queue table (oldest first, SLA timer, type / campus / search filters) → review modal with an audited document viewer,
// facts, audit trail, approve / reject with rubric codes, claim, trust override, and keyboard shortcuts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, Keyboard, Search, ShieldAlert, X, ZoomIn } from 'lucide-react';
import type { VerificationStatus, VerificationType } from '@shared/enums';
import { REJECT_REASON_CODES, type RejectReasonCode } from '@shared/schemas/verify';
import { Avatar, Badge, Button, Card, EmptyState, Input, Kbd, Modal, Pagination, Select, Skeleton, Spinner, Tabs, Textarea, TrustBadge } from '@/components';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/cn';
import { useIsMobile } from '@/lib/hooks';
import { errorMessage } from '@/app/errors';
import { Head } from '@/app/Head';
import { adminDocumentUrl, useApprove, useClaim, useQueue, useQueueRequest, useQueueStats, useReject, useTrustOverride, type QueueFilters, type QueueItem } from './api';
import { ID_TYPES, statusVariant, typeLabel } from './labels';

type QueueTab = 'queue' | 'approved' | 'rejected' | 'all';
const TAB_STATUS: Record<QueueTab, VerificationStatus[] | undefined> = {
  queue: ['pending', 'in_review'],
  approved: ['approved'],
  rejected: ['rejected'],
  all: ['pending', 'in_review', 'approved', 'rejected', 'cancelled'],
};
type Side = 'front' | 'back' | 'selfie';
const SIDES: Side[] = ['front', 'back', 'selfie'];

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

// ---------------------------------------------------------------- stats strip
function StatsStrip() {
  const t = useT();
  const q = useQueueStats();
  const s = q.data;
  const tiles = [
    { key: 'pending', label: t('verify.admin.stat.pending'), value: s?.pending ?? 0, tone: 'text-ink' },
    { key: 'inReview', label: t('verify.admin.stat.inReview'), value: s?.inReview ?? 0, tone: 'text-ink' },
    { key: 'overdue', label: t('verify.admin.stat.overdue'), value: s?.overdue ?? 0, tone: s?.overdue ? 'text-danger' : 'text-ink' },
    { key: 'decided', label: t('verify.admin.stat.decided24h'), value: (s?.approved24h ?? 0) + (s?.rejected24h ?? 0), tone: 'text-ink' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((x) => (
        <Card key={x.key} padding="sm" className="flex flex-col gap-0.5">
          <span className="text-caption text-ink-3">{x.label}</span>
          {q.isLoading ? <Skeleton variant="text" width={48} height={28} /> : <span className={cn('text-price-lg tnum', x.tone)}>{x.value}</span>}
          {x.key === 'pending' && s?.oldestPendingHours != null && <span className="text-caption text-ink-3">{t('verify.admin.stat.oldest', { hours: s.oldestPendingHours })}</span>}
          {x.key === 'decided' && s?.medianDecisionHours7d != null && <span className="text-caption text-ink-3">{t('verify.admin.stat.median', { hours: s.medianDecisionHours7d })}</span>}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- queue rows
function StatusBadge({ status }: { status: VerificationStatus }) {
  const t = useT();
  return <Badge variant={statusVariant(status)} size="sm">{t(`verify.admin.status.${status}`)}</Badge>;
}

function QueueRows({ items, selected, onSelect, onOpen }: { items: QueueItem[]; selected: number; onSelect: (i: number) => void; onOpen: (item: QueueItem) => void }) {
  const t = useT();
  const { formatRelative } = useLocale();
  const isMobile = useIsMobile();
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    rowRefs.current[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (isMobile) {
    return (
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => (
          <li key={it.id} ref={(el) => { rowRefs.current[i] = el; }}>
            <Card interactive padding="sm" as="button" className={cn('w-full text-left', i === selected && 'border-accent')} onClick={() => { onSelect(i); onOpen(it); }} aria-label={t('verify.admin.review', { name: it.user.name })}>
              <div className="flex items-center gap-3">
                <Avatar src={it.user.avatarUrl} name={it.user.name} size="sm" trustLevel={it.user.trustLevel} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink">{it.user.name}</p>
                  <p className="truncate text-caption text-ink-3">{typeLabel(t, it.type)} · {it.campus?.shortName ?? '—'} · {formatRelative(it.submittedAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={it.status} />
                  {it.overdue && <span className="text-caption text-danger">{t('verify.admin.overdue')}</span>}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <table className="w-full border-collapse text-small">
        <thead className="bg-sunken text-caption text-ink-2">
          <tr>
            <th scope="col" className="px-4 py-2.5 text-left font-medium">{t('verify.admin.col.user')}</th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('verify.admin.col.type')}</th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('verify.admin.col.campus')}</th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('verify.admin.col.submitted')}</th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('verify.admin.col.waiting')}</th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('verify.admin.col.status')}</th>
            <th scope="col" className="px-3 py-2.5 text-left font-medium">{t('verify.admin.col.reviewer')}</th>
            <th scope="col" className="px-3 py-2.5"><span className="sr-only">{t('verify.admin.open')}</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr
              key={it.id}
              ref={(el) => { rowRefs.current[i] = el; }}
              className={cn('cursor-pointer border-t border-line transition-colors hover:bg-sunken/60', i === selected && 'bg-accent-soft/40')}
              aria-selected={i === selected}
              onClick={() => { onSelect(i); onOpen(it); }}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <Avatar src={it.user.avatarUrl} name={it.user.name} size="sm" trustLevel={it.user.trustLevel} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                      {it.user.name}
                      {it.duplicateDocument && <Badge variant="warning" size="sm" icon={<ShieldAlert />} title={t('verify.admin.duplicateHint')}>{t('verify.admin.duplicate')}</Badge>}
                    </p>
                    <p className="truncate text-caption text-ink-3">{it.user.email}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-ink-2">{typeLabel(t, it.type)}</td>
              <td className="px-3 py-2.5 text-ink-2">{it.campus?.shortName ?? '—'}</td>
              <td className="px-3 py-2.5 text-ink-2">{formatRelative(it.submittedAt)}</td>
              <td className={cn('px-3 py-2.5 text-right tnum', it.overdue ? 'font-medium text-danger' : 'text-ink-2')}>
                {it.status === 'pending' || it.status === 'in_review' ? t('verify.admin.waiting', { hours: it.ageHours }) : '—'}
              </td>
              <td className="px-3 py-2.5"><StatusBadge status={it.status} /></td>
              <td className="px-3 py-2.5 text-ink-2">{it.reviewer?.name ?? '—'}</td>
              <td className="px-3 py-2.5 text-right">
                <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onSelect(i); onOpen(it); }}>{t('verify.admin.open')}</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- document viewer
function DocumentViewer({ item, side, onSide }: { item: QueueItem; side: Side; onSide: (s: Side) => void }) {
  const t = useT();
  const [zoom, setZoom] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const upload = side === 'front' ? item.front : side === 'back' ? item.back : item.selfie;
  const url = upload ? adminDocumentUrl(item.id, side) : null;
  useEffect(() => { setLoaded(false); setFailed(false); setZoom(false); }, [url]);
  const tabs = SIDES.map((s) => ({ key: s, label: t(`verify.admin.doc.${s}`), disabled: !(s === 'front' ? item.front : s === 'back' ? item.back : item.selfie) }));
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Tabs variant="pill" items={tabs} value={side} onChange={onSide} label={t('verify.admin.doc.front')} />
      <div className={cn('relative flex min-h-[280px] items-center justify-center overflow-auto rounded-card border border-line bg-sunken', zoom ? 'max-h-[70vh]' : 'max-h-[420px]')}>
        {!url && <p className="p-6 text-small text-ink-3">{t('verify.admin.doc.missing')}</p>}
        {url && !loaded && !failed && <div className="absolute inset-0 flex items-center justify-center gap-2 text-small text-ink-3"><Spinner size={16} label={t('verify.admin.doc.loading')} />{t('verify.admin.doc.loading')}</div>}
        {url && failed && <p className="p-6 text-small text-danger">{t('error.generic')}</p>}
        {url && upload?.mime === 'application/pdf' && <iframe title={t(`verify.admin.doc.${side}`)} src={url} className="h-[420px] w-full" onLoad={() => setLoaded(true)} />}
        {url && upload?.mime !== 'application/pdf' && (
          <img
            src={url}
            alt={`${item.user.name} · ${t(`verify.admin.doc.${side}`)}`}
            className={cn('transition-opacity duration-token-base', loaded ? 'opacity-100' : 'opacity-0', zoom ? 'max-w-none' : 'max-h-[420px] max-w-full object-contain')}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-3">
        <span>{t('verify.admin.doc.auditNote')}</span>
        {url && (
          <span className="flex gap-1">
            <Button variant="ghost" size="sm" iconLeft={<ZoomIn />} onClick={() => setZoom((z) => !z)} aria-pressed={zoom}>{t('verify.admin.doc.zoom')}</Button>
            <Button variant="ghost" size="sm" iconLeft={<ExternalLink />} asChild><a href={url} target="_blank" rel="noreferrer">{t('verify.admin.doc.openNew')}</a></Button>
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- review modal
type Mode = 'view' | 'approve' | 'reject' | 'override';

function ReviewModal({ id, onClose, onPrev, onNext, hasPrev, hasNext, onDecided }: { id: string; onClose: () => void; onPrev: () => void; onNext: () => void; hasPrev: boolean; hasNext: boolean; onDecided: () => void }) {
  const t = useT();
  const { formatDate, formatRelative, locale } = useLocale();
  const detail = useQueueRequest(id);
  const claim = useClaim();
  const approve = useApprove();
  const reject = useReject();
  const override = useTrustOverride();
  const [side, setSide] = useState<Side>('front');
  const [mode, setMode] = useState<Mode>('view');
  const [note, setNote] = useState('');
  const [code, setCode] = useState<RejectReasonCode>('blurry');
  const [reason, setReason] = useState(t('verify.admin.reasonText.blurry'));
  const [ovLevel, setOvLevel] = useState<'0' | '1' | '2' | '3'>('2');
  const [ovReason, setOvReason] = useState('');
  useEffect(() => { setSide('front'); setMode('view'); setNote(''); }, [id]);

  const item = detail.data;
  const open = !!item && (item.status === 'pending' || item.status === 'in_review');
  const busy = claim.isPending || approve.isPending || reject.isPending;

  const doApprove = useCallback(async () => {
    if (!item || !open) return;
    try {
      await approve.mutateAsync({ id: item.id, note });
      toast.success(t('verify.admin.approved', { name: item.user.name }));
      onDecided();
    } catch (err) {
      toast.error(errorMessage(t, err));
    }
  }, [item, open, note, approve, t, onDecided]);
  const doReject = useCallback(async () => {
    if (!item || !open) return;
    try {
      await reject.mutateAsync({ id: item.id, reason: reason.trim(), code, note });
      toast.success(t('verify.admin.rejected', { name: item.user.name }));
      onDecided();
    } catch (err) {
      toast.error(errorMessage(t, err));
    }
  }, [item, open, reason, code, note, reject, t, onDecided]);
  const doClaim = useCallback(async () => {
    if (!item || item.status !== 'pending') return;
    try {
      await claim.mutateAsync(item.id);
      toast.info(t('verify.admin.claimed'));
    } catch (err) {
      toast.error(errorMessage(t, err));
    }
  }, [item, claim, t]);

  // keyboard shortcuts inside the modal
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'a' && open && mode === 'view') { e.preventDefault(); setMode('approve'); }
      else if (k === 'r' && open && mode === 'view') { e.preventDefault(); setMode('reject'); }
      else if (k === 'c' && item?.status === 'pending') { e.preventDefault(); void doClaim(); }
      else if (k === 'arrowleft' || k === 'arrowright') {
        if (!item) return;
        const avail = SIDES.filter((s) => (s === 'front' ? item.front : s === 'back' ? item.back : item.selfie));
        const i = avail.indexOf(side);
        const n = avail[(i + (k === 'arrowright' ? 1 : avail.length - 1)) % avail.length];
        if (n) setSide(n);
      } else if (k === 'n' && hasNext) onNext();
      else if (k === 'p' && hasPrev) onPrev();
      else if (k === 'enter' && mode === 'approve') { e.preventDefault(); void doApprove(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mode, item, side, hasNext, hasPrev, onNext, onPrev, doApprove, doClaim]);

  const onCodeChange = (c: RejectReasonCode) => {
    setCode(c);
    const key = `verify.admin.reasonText.${c}`;
    const txt = t(key);
    setReason(txt === key ? '' : txt);
  };
  const accountAge = item ? Math.max(1, Math.round((Date.now() - Date.parse(item.user.memberSince)) / 86_400_000)) : 0;

  const footer = item && (
    <div className="flex w-full flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" iconLeft={<ArrowLeft />} onClick={onPrev} disabled={!hasPrev}>{t('verify.admin.prev')}</Button>
      <Button variant="ghost" size="sm" iconRight={<ArrowRight />} onClick={onNext} disabled={!hasNext}>{t('verify.admin.next')}</Button>
      <span className="flex-1" />
      {mode === 'view' && (
        <>
          <Button variant="ghost" size="sm" onClick={() => { setOvLevel(String(Math.min(3, item.user.trustLevel)) as '0' | '1' | '2' | '3'); setMode('override'); }}>{t('verify.admin.override')}</Button>
          {item.status === 'pending' && <Button variant="secondary" onClick={doClaim} loading={claim.isPending}>{t('verify.admin.claim')} <Kbd className="ml-1">C</Kbd></Button>}
          {open && <Button variant="danger" onClick={() => setMode('reject')} disabled={busy}>{t('verify.admin.reject')} <Kbd className="ml-1">R</Kbd></Button>}
          {open && <Button variant="primary" iconLeft={<Check />} onClick={() => setMode('approve')} disabled={busy}>{t('verify.admin.approve')} <Kbd className="ml-1">A</Kbd></Button>}
        </>
      )}
      {mode !== 'view' && <Button variant="ghost" onClick={() => setMode('view')}>{t('common.cancel')}</Button>}
      {mode === 'approve' && <Button variant="primary" iconLeft={<Check />} onClick={doApprove} loading={approve.isPending}>{t('verify.admin.approve')}</Button>}
      {mode === 'reject' && <Button variant="danger" iconLeft={<X />} onClick={doReject} loading={reject.isPending} disabled={reason.trim().length < 3}>{t('verify.admin.reject')}</Button>}
      {mode === 'override' && (
        <Button
          variant="primary"
          loading={override.isPending}
          disabled={ovReason.trim().length < 3}
          onClick={async () => {
            try {
              await override.mutateAsync({ userId: item.userId, trustLevel: Number(ovLevel), reason: ovReason.trim() });
              toast.success(t('verify.admin.override.done', { level: ovLevel }));
              setMode('view');
              setOvReason('');
            } catch (err) {
              toast.error(errorMessage(t, err));
            }
          }}
        >
          {t('common.confirm')}
        </Button>
      )}
    </div>
  );

  return (
    <Modal open onClose={onClose} size="lg" title={item ? t('verify.admin.review', { name: item.user.name }) : t('verify.admin.title')} footer={footer} sheetSnap="full">
      {!item ? (
        <div className="flex flex-col gap-3" aria-busy><Skeleton variant="rect" height={280} /><Skeleton variant="row" /><Skeleton variant="row" /></div>
      ) : (
        <div className="grid gap-5 md:grid-cols-[minmax(0,1.3fr)_minmax(260px,1fr)]">
          <DocumentViewer item={item} side={side} onSide={setSide} />
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar src={item.user.avatarUrl} name={item.user.name} size="md" trustLevel={item.user.trustLevel} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-body font-semibold text-ink">{item.user.name}<TrustBadge level={item.user.trustLevel} size="inline" noTooltip /><StatusBadge status={item.status} /></p>
                <p className="text-caption text-ink-3">{typeLabel(t, item.type)} · {item.campus?.shortName ?? '—'} · {formatRelative(item.submittedAt)}</p>
              </div>
            </div>
            {item.duplicateDocument && <p className="flex items-center gap-2 rounded-card bg-warning-soft px-3 py-2 text-small text-ink"><ShieldAlert className="size-4 text-warning" aria-hidden />{t('verify.admin.duplicateHint')}</p>}

            {mode === 'approve' && (
              <div className="flex flex-col gap-2 rounded-card border border-line bg-sunken p-3">
                <p className="text-body font-semibold text-ink">{t('verify.admin.approveTitle')}</p>
                <p className="text-small text-ink-2">{t('verify.admin.approveBody', { name: item.user.name })}</p>
                <Textarea label={t('verify.admin.note')} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
            {mode === 'reject' && (
              <div className="flex flex-col gap-3 rounded-card border border-danger-soft bg-danger-soft/30 p-3">
                <p className="text-body font-semibold text-ink">{t('verify.admin.rejectTitle')}</p>
                <Select<RejectReasonCode> label={t('verify.admin.rejectCode')} value={code} onChange={onCodeChange} options={REJECT_REASON_CODES.map((c) => ({ value: c, label: t(`verify.admin.reason.${c}`) }))} />
                <Textarea label={t('verify.admin.rejectReason')} hint={t('verify.admin.rejectReasonHint')} rows={3} maxLength={500} showCount value={reason} onChange={(e) => setReason(e.target.value)} required />
                <Textarea label={t('verify.admin.note')} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
            {mode === 'override' && (
              <div className="flex flex-col gap-3 rounded-card border border-line bg-sunken p-3">
                <p className="text-body font-semibold text-ink">{t('verify.admin.override')}</p>
                <Select<'0' | '1' | '2' | '3'> label={t('verify.admin.override.level')} value={ovLevel} onChange={setOvLevel} options={(['0', '1', '2', '3'] as const).map((l) => ({ value: l, label: `L${l} · ${t(`ui.trust.l${l}`)}` }))} />
                <Textarea label={t('verify.admin.override.reason')} rows={2} maxLength={500} value={ovReason} onChange={(e) => setOvReason(e.target.value)} required />
              </div>
            )}

            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-small">
              <dt className="text-ink-3">{t('verify.admin.fact.fullName')}</dt><dd className="font-medium text-ink">{item.fullName ?? '—'}</dd>
              <dt className="text-ink-3">{t('verify.admin.fact.last4')}</dt><dd className="font-mono text-ink">{item.docNumberLast4 ? `•••• ${item.docNumberLast4}` : t('verify.admin.fact.none')}</dd>
              <dt className="text-ink-3">{t('verify.admin.fact.email')}</dt><dd className="truncate text-ink">{item.user.email}</dd>
              <dt className="text-ink-3">{t('verify.admin.fact.eduEmail')}</dt><dd className="truncate text-ink">{item.user.eduEmail ?? t('verify.admin.fact.none')}</dd>
              <dt className="text-ink-3">{t('verify.admin.fact.accountAge')}</dt><dd className="text-ink tnum">{locale === 'en' ? `${accountAge} days` : `${accountAge} 天`}</dd>
              <dt className="text-ink-3">{t('verify.admin.fact.trust')}</dt><dd className="text-ink">L{item.user.trustLevel}</dd>
              <dt className="text-ink-3">{t('verify.admin.fact.prior')}</dt><dd className="text-ink tnum">{item.user.priorRequests}</dd>
              <dt className="text-ink-3">{t('verify.admin.fact.submitted')}</dt><dd className="text-ink">{formatDate(item.submittedAt, 'datetime')}</dd>
              {item.reviewer && <><dt className="text-ink-3">{t('verify.admin.fact.reviewer')}</dt><dd className="text-ink">{item.reviewer.name}</dd></>}
              {item.reviewedAt && <><dt className="text-ink-3">{t('verify.admin.fact.decidedAt')}</dt><dd className="text-ink">{formatDate(item.reviewedAt, 'datetime')}</dd></>}
              {item.reason && <><dt className="text-ink-3">{t('verify.admin.fact.reason')}</dt><dd className="text-ink">{item.reason}</dd></>}
              {item.internalNote && <><dt className="text-ink-3">{t('verify.admin.fact.note')}</dt><dd className="text-ink-2">{item.internalNote}</dd></>}
            </dl>

            <div className="rounded-card bg-sunken p-3 text-small text-ink-2">
              <p className="text-caption text-ink-3">{t('verify.admin.rubric.title')}</p>
              <ul className="mt-1 flex flex-col gap-0.5">{[1, 2, 3].map((n) => <li key={n}>· {t(`verify.admin.rubric.${n}`)}</li>)}</ul>
            </div>

            {(item.history.length > 0 || item.userRequests.length > 0) && (
              <div>
                <p className="text-caption text-ink-3">{t('verify.admin.history')}</p>
                <ul className="mt-1 flex flex-col gap-1 text-small">
                  {item.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap gap-x-2 text-ink-2">
                      <span className="text-ink">{h.action}</span>
                      <span>{h.actor?.name ?? t('verify.timeline.by.system')}</span>
                      {h.reason && <span className="text-ink-3">· {h.reason}</span>}
                      <span className="text-ink-3">· {formatRelative(h.createdAt)}</span>
                    </li>
                  ))}
                  {item.userRequests.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-2 text-ink-2">
                      <StatusBadge status={r.status} /><span>{typeLabel(t, r.type)}</span><span className="text-ink-3">· {formatRelative(r.submittedAt)}</span>{r.reason && <span className="text-ink-3">· {r.reason}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- panel
export default function VerifyAdminPanel() {
  const t = useT();
  const { campuses } = useCampus();
  const [tab, setTab] = useState<QueueTab>('queue');
  const [type, setType] = useState<VerificationType | 'all'>('all');
  const [campusId, setCampusId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'oldest' | 'newest'>('oldest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = useMemo<QueueFilters>(() => ({ status: TAB_STATUS[tab], type: type === 'all' ? undefined : [type], campusId: campusId === 'all' ? undefined : campusId, q: search.trim() || undefined, sort, page, pageSize: 20 }), [tab, type, campusId, search, sort, page]);
  const queue = useQueue(filters);
  const items = queue.data?.items ?? [];
  useEffect(() => { setSelected(0); setPage(1); }, [tab, type, campusId, search, sort]);
  useEffect(() => { if (selected >= items.length) setSelected(Math.max(0, items.length - 1)); }, [items.length, selected]);

  const openIndex = openId ? items.findIndex((i) => i.id === openId) : -1;
  const openAt = useCallback((i: number) => { const it = items[i]; if (it) { setSelected(i); setOpenId(it.id); } }, [items]);

  // list shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (openId || isTypingTarget(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'j' || k === 'arrowdown') { e.preventDefault(); setSelected((s) => Math.min(items.length - 1, s + 1)); }
      else if (k === 'k' || k === 'arrowup') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); }
      else if (k === 'enter' || k === 'o') { e.preventDefault(); openAt(selected); }
      else if (k === '/') { e.preventDefault(); document.getElementById('verify-admin-search')?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, items.length, selected, openAt]);

  const campusOptions = useMemo(() => [{ value: 'all', label: t('verify.admin.filter.allCampuses') }, ...campuses.map((c) => ({ value: c.id, label: c.shortName }))], [campuses, t]);
  const typeOptions = useMemo(() => [{ value: 'all' as const, label: t('verify.admin.filter.allTypes') }, ...ID_TYPES.map((v) => ({ value: v, label: typeLabel(t, v) }))], [t]);
  const shortcuts: [string, string][] = [['J / K', t('verify.admin.kbd.nav')], ['Enter', t('verify.admin.kbd.open')], ['A', t('verify.admin.kbd.approve')], ['R', t('verify.admin.kbd.reject')], ['C', t('verify.admin.kbd.claim')], ['← →', t('verify.admin.kbd.docs')], ['Esc', t('verify.admin.kbd.close')]];

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 py-2 lg:px-8">
      <Head title={t('verify.admin.title')} />
      <header className="flex flex-col gap-1">
        <h1 className="text-h1-sm md:text-h1 text-ink">{t('verify.admin.title')}</h1>
        <p className="text-small text-ink-2">{t('verify.admin.subtitle')}</p>
      </header>
      <StatsStrip />
      <div className="flex flex-col gap-3">
        <Tabs<QueueTab>
          variant="underline"
          value={tab}
          onChange={setTab}
          items={[
            { key: 'queue', label: t('verify.admin.filter.queue'), count: tab === 'queue' ? queue.data?.total : undefined },
            { key: 'approved', label: t('verify.admin.filter.approved') },
            { key: 'rejected', label: t('verify.admin.filter.rejected') },
            { key: 'all', label: t('verify.admin.filter.all') },
          ]}
          label={t('verify.admin.filter.status')}
        />
        <div className="grid gap-2 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
          <Input id="verify-admin-search" size="sm" iconLeft={<Search />} placeholder={t('verify.admin.filter.search')} value={search} onChange={(e) => setSearch(e.target.value)} clearable aria-label={t('verify.admin.filter.search')} />
          <Select<VerificationType | 'all'> size="sm" value={type} onChange={setType} options={typeOptions} label={t('verify.admin.filter.type')} />
          <Select size="sm" value={campusId} onChange={setCampusId} options={campusOptions} label={t('verify.admin.filter.campus')} searchable />
          <Select<'oldest' | 'newest'> size="sm" value={sort} onChange={setSort} options={[{ value: 'oldest', label: t('verify.admin.sort.oldest') }, { value: 'newest', label: t('verify.admin.sort.newest') }]} label={t('verify.admin.col.submitted')} />
        </div>
      </div>

      {queue.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy>{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="row" />)}</div>
      ) : queue.isError ? (
        <EmptyState icon={ShieldAlert} title={t('error.generic')} description={errorMessage(t, queue.error)} action={{ label: t('common.retry'), onClick: () => queue.refetch() }} />
      ) : items.length === 0 ? (
        <EmptyState icon={Check} title={t('verify.admin.empty')} description={t('verify.admin.emptyHint')} />
      ) : (
        <>
          <QueueRows items={items} selected={selected} onSelect={setSelected} onOpen={(it) => setOpenId(it.id)} />
          <Pagination page={page} pageSize={20} total={queue.data?.total ?? 0} onChange={setPage} loading={queue.isFetching} />
        </>
      )}

      <footer className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-3 md:flex">
        <span className="flex items-center gap-1"><Keyboard className="size-3.5" aria-hidden />{t('verify.admin.shortcuts')}</span>
        {shortcuts.map(([k, label]) => <span key={k} className="flex items-center gap-1"><Kbd>{k}</Kbd>{label}</span>)}
      </footer>

      {openId && (
        <ReviewModal
          id={openId}
          onClose={() => setOpenId(null)}
          hasPrev={openIndex > 0}
          hasNext={openIndex >= 0 && openIndex < items.length - 1}
          onPrev={() => openAt(openIndex - 1)}
          onNext={() => openAt(openIndex + 1)}
          onDecided={() => {
            // after a decision the row leaves the open queue; move to the next one, or close
            if (tab === 'queue') {
              const next = items[openIndex + 1] ?? items[openIndex - 1];
              if (next) { setOpenId(next.id); setSelected(Math.max(0, Math.min(openIndex, items.length - 2))); }
              else setOpenId(null);
            }
          }}
        />
      )}
    </div>
  );
}
