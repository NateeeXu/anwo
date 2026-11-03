// Small building blocks shared by the admin pages: filter state in the URL, panels, reason dialog, status badges,
// export link, error state, and keyboard row navigation. Semantic tokens only (dark mode is automatic).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { CircleAlert, Download, Info } from 'lucide-react';
import type { ReportStatus } from '@shared/enums';
import { Badge, Button, Card, EmptyState, Modal, Select, Textarea, Tooltip, buttonClasses } from '@/components';
import { useCampus } from '@/lib/campus';
import { useLocale, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/app/errors';

// ------------------------------------------------------------------ URL-backed filters
export type RangeKey = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Campus (`cid`, '' = all campuses) + date range (`range` preset or `from`/`to`) shared across admin pages. */
export function useAdminFilters() {
  const [params, setParams] = useSearchParams();
  const campusId = params.get('cid') || null;
  const range = (params.get('range') as RangeKey | 'custom' | null) ?? '30d';
  const today = ymd(Date.now());
  let from: string;
  let to: string;
  if (range === 'custom' && params.get('from') && params.get('to')) {
    from = params.get('from')!;
    to = params.get('to')!;
  } else {
    const days = RANGE_DAYS[(range as RangeKey) in RANGE_DAYS ? (range as RangeKey) : '30d'];
    to = today;
    from = ymd(Date.now() - (days - 1) * 86_400_000);
  }
  const update = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );
  return {
    campusId,
    range,
    from,
    to,
    setCampus: (id: string | null) => update({ cid: id }),
    setRange: (r: RangeKey) => update({ range: r, from: null, to: null }),
    setCustom: (f: string, t: string) => update({ range: 'custom', from: f, to: t }),
    param: (k: string) => params.get(k),
    setParam: (k: string, v: string | null) => update({ [k]: v }),
    setParamsPatch: update,
  };
}

/** Campus selector with a leading 「全部校区」 option (nationwide total). */
export function CampusFilter({ value, onChange, className, label }: { value: string | null; onChange: (id: string | null) => void; className?: string; label?: string }) {
  const t = useT();
  const { locale } = useLocale();
  const { campuses } = useCampus();
  const options = useMemo(
    () => [
      { value: '__all', label: t('admin.filters.allCampuses'), text: t('admin.filters.allCampuses') },
      ...[...campuses]
        .sort((a, b) => a.state.localeCompare(b.state) || a.shortName.localeCompare(b.shortName))
        .map((c) => {
          const name = locale === 'zh-CN' && c.nameZh ? `${c.nameZh} ${c.shortName}` : c.shortName;
          return { value: c.id, label: `${name} · ${c.state}`, text: `${name} ${c.name} ${c.city} ${c.state}` };
        }),
    ],
    [campuses, locale, t],
  );
  return (
    <div className={cn('min-w-0', className)}>
      <Select
        aria-label={label ?? t('admin.filters.campus')}
        size="sm"
        searchable
        options={options}
        value={value ?? '__all'}
        onChange={(v) => onChange(v === '__all' ? null : v)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ panels
export function Panel({ title, hint, actions, children, className, bodyClassName, id }: { title: ReactNode; hint?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; id?: string }) {
  return (
    <Card padding="none" className={cn('min-w-0', className)} aria-labelledby={id}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 id={id} className="text-h3 text-ink">
            {title}
          </h2>
          {hint && <DefHint text={hint} />}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </Card>
  );
}

/** Info icon with a definition tooltip (every KPI documents its query). */
export function DefHint({ text }: { text: ReactNode }) {
  const t = useT();
  return (
    <Tooltip content={<span className="block max-w-[280px] text-small">{text}</span>}>
      <button type="button" className="inline-flex size-6 items-center justify-center rounded-pill text-ink-3 hover:text-ink" aria-label={t('admin.common.definition')}>
        <Info size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </Tooltip>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-h1 text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-small text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT();
  return <EmptyState icon={CircleAlert} title={t('error.generic')} description={errorMessage(t, error)} action={{ label: t('common.retry'), onClick: onRetry }} size="sm" />;
}

export function ExportLink({ table, query, label }: { table: string; query?: Record<string, string | null | undefined>; label?: string }) {
  const t = useT();
  const qs = new URLSearchParams(Object.entries(query ?? {}).filter(([, v]) => !!v) as [string, string][]).toString();
  return (
    <a href={`/api/admin/export/${table}.csv${qs ? `?${qs}` : ''}`} download className={buttonClasses({ variant: 'secondary', size: 'sm' })}>
      <Download size={16} strokeWidth={1.75} aria-hidden />
      {label ?? t('admin.common.exportCsv')}
    </a>
  );
}

// ------------------------------------------------------------------ status badges
export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const t = useT();
  const v = status === 'open' ? 'warning' : status === 'in_review' ? 'info' : status === 'actioned' ? 'success' : 'neutral';
  return (
    <Badge variant={v} size="sm">
      {t(`admin.reportStatus.${status}`)}
    </Badge>
  );
}
export function ModerationBadge({ status }: { status: string | null }) {
  const t = useT();
  if (!status) return null;
  const v = status === 'ok' ? 'success' : status === 'flagged' ? 'warning' : 'danger';
  return (
    <Badge variant={v} size="sm">
      {t(`admin.moderation.${status}`)}
    </Badge>
  );
}

// ------------------------------------------------------------------ reason dialog (every destructive action)
export type ReasonDialogProps = {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  presets?: string[];
  extra?: ReactNode;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown>;
};
export function ReasonDialog({ open, title, description, confirmLabel, danger, presets, extra, onClose, onConfirm }: ReasonDialogProps) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (open) {
      setReason('');
      setErr(null);
    }
  }, [open]);
  const submit = async () => {
    if (reason.trim().length < 3) {
      setErr(t('admin.reason.tooShort'));
      ref.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      onClose();
    } catch (e) {
      setErr(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      description={description}
      size="sm"
      initialFocus={ref}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={submit} data-testid="reason-confirm">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {extra}
        {presets && presets.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label={t('admin.reason.presets')}>
            {presets.map((p) => (
              <button key={p} type="button" onClick={() => setReason(p)} className="rounded-pill border border-line px-2.5 py-1 text-caption text-ink-2 hover:border-line-strong hover:text-ink">
                {p}
              </button>
            ))}
          </div>
        )}
        <Textarea
          ref={ref}
          label={t('admin.reason.label')}
          hint={t('admin.reason.hint')}
          rows={3}
          maxLength={500}
          showCount
          value={reason}
          error={err ?? undefined}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          }}
          name="reason"
        />
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ keyboard bulk-selection helpers
/** j/k (or ↓/↑) move the cursor, x toggles selection, Enter opens, Esc clears — ignored while typing. */
export function useRowKeys<T>(rows: T[], key: (r: T) => string, opts: { onOpen?: (r: T) => void; selected: string[]; setSelected: (ids: string[]) => void; enabled?: boolean }) {
  const [cursor, setCursor] = useState(-1);
  const { onOpen, selected, setSelected, enabled = true } = opts;
  useEffect(() => {
    setCursor((c) => Math.min(c, rows.length - 1));
  }, [rows.length]);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        if (e.key === 'ArrowDown' && el && el !== document.body) return;
        e.preventDefault();
        setCursor((c) => Math.min(rows.length - 1, c + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        if (e.key === 'ArrowUp' && el && el !== document.body) return;
        e.preventDefault();
        setCursor((c) => Math.max(0, c - 1));
      } else if (e.key === 'x' && cursor >= 0 && rows[cursor]) {
        e.preventDefault();
        const id = key(rows[cursor]!);
        setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
      } else if (e.key === 'Enter' && cursor >= 0 && rows[cursor] && onOpen) {
        e.preventDefault();
        onOpen(rows[cursor]!);
      } else if (e.key === 'Escape' && selected.length) {
        setSelected([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, cursor, key, onOpen, selected, setSelected, enabled]);
  return { cursor, setCursor };
}

/** Sticky bar shown while rows are selected. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  const t = useT();
  if (!count) return null;
  return (
    <div role="region" aria-label={t('admin.bulk.label')} className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-[2] flex flex-wrap items-center gap-2 rounded-card border border-line-strong bg-surface px-3 py-2 shadow-md md:bottom-4">
      <span className="text-small font-medium text-ink" aria-live="polite">
        {t('admin.bulk.selected', { count })}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear}>
          {t('admin.bulk.clear')}
        </Button>
      </div>
    </div>
  );
}

export function KeyHints() {
  const t = useT();
  return <p className="hidden text-caption text-ink-3 md:block">{t('admin.bulk.keys')}</p>;
}

/** Hours → 「3 小时」/「2 天」 compact age. */
export function useAge() {
  const t = useT();
  return (hours: number | null | undefined) => {
    if (hours === null || hours === undefined) return '—';
    if (hours < 1) return t('admin.age.minutes', { n: Math.max(1, Math.round(hours * 60)) });
    if (hours < 48) return t('admin.age.hours', { n: Math.round(hours) });
    return t('admin.age.days', { n: Math.round(hours / 24) });
  };
}
