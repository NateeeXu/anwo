// Small shared pieces for the billing module: test-mode band, plan naming, status badges, money lines, SVG charts, card form.
import { useId, useMemo, useState, type ReactNode } from 'react';
import { CreditCard, FlaskConical, Check } from 'lucide-react';
import type { Plan } from '@shared/types';
import { Badge, Checkbox, Input } from '@/components';
import { cn } from '@/lib/cn';
import { useLocale, useT } from '@/lib/i18n';
import type { CardInput } from '@shared/schemas/billing';
import type { PlanDto } from '../api';

/** 「测试模式 Test mode · 不会真实扣款」 — mandatory, non-dismissible on every checkout surface (billing-requirements §8). */
export function TestModeBand({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useT();
  return (
    <div role="note" className={cn('flex items-center gap-2 rounded-sm border border-warning/30 bg-warning-soft px-3 text-warning', compact ? 'py-1.5 text-caption' : 'py-2 text-small', className)}>
      <FlaskConical className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span>{t('billing.testMode.band')}</span>
    </div>
  );
}

export function usePlanName() {
  const { isZh } = useLocale();
  return (plan: Pick<Plan, 'name' | 'nameZh'> | null | undefined) => (plan ? (isZh ? plan.nameZh || plan.name : plan.name) : '');
}

export function durationLabel(t: ReturnType<typeof useT>, days: number | null | undefined): string {
  if (!days) return '';
  return t('billing.duration.days', { n: days });
}

export function tierLabel(t: ReturnType<typeof useT>, tier: string | null | undefined): string {
  if (!tier) return '';
  return t(`billing.tier.${tier}`);
}

export function OrderStatusBadge({ status }: { status: string }) {
  const t = useT();
  const variant = status === 'fulfilled' || status === 'paid' ? 'success' : status === 'failed' ? 'danger' : status === 'refunded' ? 'info' : status === 'cancelled' ? 'neutral' : 'warning';
  return <Badge variant={variant} size="sm">{t(`billing.orderStatus.${status}`)}</Badge>;
}
export function BoostStatusBadge({ status }: { status: string }) {
  const t = useT();
  const variant = status === 'active' ? 'success' : status === 'scheduled' ? 'info' : status === 'refunded' ? 'info' : 'neutral';
  return <Badge variant={variant} size="sm">{t(`billing.boostStatus.${status}`)}</Badge>;
}
export function EscrowStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const t = useT();
  const variant = status === 'released' || status === 'resolved' ? 'success' : status === 'disputed' ? 'danger' : status === 'funded' || status === 'in_inspection' ? 'accent' : status === 'refunded' ? 'info' : status === 'cancelled' || status === 'expired' ? 'neutral' : 'warning';
  return <Badge variant={variant} size={size}>{t(`billing.escrowStatus.${status}`)}</Badge>;
}

export function MoneyLine({ label, cents, strong, muted, negative, hint }: { label: ReactNode; cents: number; strong?: boolean; muted?: boolean; negative?: boolean; hint?: ReactNode }) {
  const { formatMoney } = useLocale();
  return (
    <div className={cn('flex items-baseline justify-between gap-3', strong ? 'text-body font-semibold text-ink' : muted ? 'text-small text-ink-3' : 'text-small text-ink-2')}>
      <span className="min-w-0">
        {label}
        {hint && <span className="ml-1 text-caption text-ink-3">{hint}</span>}
      </span>
      <span className={cn('tnum shrink-0', negative && 'text-success')}>{negative ? '−' : ''}{formatMoney(Math.abs(cents))}</span>
    </div>
  );
}

export function FeatureList({ features, className }: { features: string[]; className?: string }) {
  const t = useT();
  return (
    <ul className={cn('flex flex-col gap-1.5', className)}>
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-small text-ink-2">
          <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} aria-hidden />
          <span>{t(f)}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- SVG charts (brand-neutral, token colors)
export function LineChart({ series, height = 160, className, formatValue, labels }: { series: { key: string; label: string; values: number[]; color: string }[]; height?: number; className?: string; formatValue?: (v: number) => string; labels: string[] }) {
  const id = useId();
  const width = 600;
  const padL = 44;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => padL + (i / n) * (width - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (height - padT - padB);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const fmt = formatValue ?? ((v: number) => String(v));
  const labelEvery = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>{series.map((s) => s.label).join(', ')}</title>
      {ticks.map((tv) => (
        <g key={tv}>
          <line x1={padL} x2={width - padR} y1={y(tv)} y2={y(tv)} stroke="var(--color-line)" strokeDasharray={tv === 0 ? undefined : '3 4'} />
          <text x={padL - 6} y={y(tv) + 4} textAnchor="end" fontSize="10" fill="var(--color-ink-3)" className="tnum">{fmt(tv)}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % labelEvery === 0 || i === labels.length - 1) && (
        <text key={l + i} x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--color-ink-3)">{l}</text>
      ))}
      {series.map((s) => {
        const d = s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        const area = `${d} L${x(s.values.length - 1).toFixed(1)},${y(0)} L${x(0)},${y(0)} Z`;
        return (
          <g key={s.key}>
            <path d={area} fill={s.color} opacity={0.08} />
            <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({ data, height = 160, className, formatValue, color = 'var(--color-accent)' }: { data: { label: string; value: number; color?: string }[]; height?: number; className?: string; formatValue?: (v: number) => string; color?: string }) {
  const id = useId();
  const width = 600;
  const padL = 44;
  const padB = 22;
  const padT = 10;
  const max = Math.max(1, ...data.map((d) => d.value));
  const slot = (width - padL - 8) / Math.max(1, data.length);
  const bw = Math.max(4, Math.min(28, slot * 0.6));
  const fmt = formatValue ?? ((v: number) => String(v));
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('w-full', className)} role="img" aria-labelledby={`${id}-title`}>
      <title id={`${id}-title`}>{data.map((d) => `${d.label}: ${fmt(d.value)}`).join(', ')}</title>
      {[0, 0.5, 1].map((f) => {
        const v = Math.round(max * f);
        const yy = padT + (1 - f) * (height - padT - padB);
        return (
          <g key={f}>
            <line x1={padL} x2={width - 8} y1={yy} y2={yy} stroke="var(--color-line)" strokeDasharray={f === 0 ? undefined : '3 4'} />
            <text x={padL - 6} y={yy + 4} textAnchor="end" fontSize="10" fill="var(--color-ink-3)" className="tnum">{fmt(v)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const h = (d.value / max) * (height - padT - padB);
        const cx = padL + i * slot + slot / 2;
        return (
          <g key={d.label + i}>
            <rect x={cx - bw / 2} y={height - padB - h} width={bw} height={h} rx={2} fill={d.color ?? color} />
            {(i % labelEvery === 0 || i === data.length - 1) && <text x={cx} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--color-ink-3)">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- mock card form
export type CardFormValue = CardInput;
export function formatCardNumber(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}
export function CardForm({ value, onChange, errors, showSave, showTestHint = true }: { value: CardFormValue; onChange: (v: CardFormValue) => void; errors?: Partial<Record<keyof CardFormValue, string>>; showSave?: boolean; showTestHint?: boolean }) {
  const t = useT();
  const [exp, setExp] = useState(value.expMonth && value.expYear ? `${String(value.expMonth).padStart(2, '0')}/${String(value.expYear).slice(-2)}` : '');
  const brand = useMemo(() => {
    const n = value.cardNumber.replace(/\D/g, '');
    if (/^4/.test(n)) return 'Visa';
    if (/^(5[1-5]|2[2-7])/.test(n)) return 'Mastercard';
    if (/^3[47]/.test(n)) return 'Amex';
    if (/^62/.test(n)) return 'UnionPay';
    return null;
  }, [value.cardNumber]);
  return (
    <div className="flex flex-col gap-3">
      <Input
        label={t('billing.card.number')}
        inputMode="numeric"
        autoComplete="cc-number"
        placeholder="4242 4242 4242 4242"
        iconLeft={<CreditCard />}
        suffix={brand ?? undefined}
        value={formatCardNumber(value.cardNumber)}
        onChange={(e) => onChange({ ...value, cardNumber: e.target.value.replace(/\D/g, '') })}
        error={errors?.cardNumber}
        required
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('billing.card.exp')}
          inputMode="numeric"
          autoComplete="cc-exp"
          placeholder="MM/YY"
          value={exp}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
            const next = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
            setExp(next);
            const m = Number(digits.slice(0, 2));
            const y = digits.length === 4 ? 2000 + Number(digits.slice(2)) : 0;
            onChange({ ...value, expMonth: m, expYear: y });
          }}
          error={errors?.expMonth ?? errors?.expYear}
          required
        />
        <Input label={t('billing.card.cvc')} inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={value.cvc} onChange={(e) => onChange({ ...value, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })} error={errors?.cvc} required />
      </div>
      <Input label={t('billing.card.name')} autoComplete="cc-name" value={value.name ?? ''} onChange={(e) => onChange({ ...value, name: e.target.value })} optional />
      {showSave && <Checkbox label={t('billing.card.save')} checked={!!value.save} onChange={(e) => onChange({ ...value, save: e.target.checked })} />}
      {showTestHint && import.meta.env.DEV && (
        <p className="text-caption text-ink-3">{t('billing.card.testHint')}</p>
      )}
    </div>
  );
}

export const EMPTY_CARD: CardFormValue = { cardNumber: '', expMonth: 0, expYear: 0, cvc: '', name: '', save: false };
export function cardValid(c: CardFormValue): boolean {
  const n = c.cardNumber.replace(/\D/g, '');
  return n.length >= 13 && n.length <= 19 && c.expMonth >= 1 && c.expMonth <= 12 && c.expYear >= 2024 && /^\d{3,4}$/.test(c.cvc);
}

export function entityPath(entityType: string | null, entityId: string | null): string {
  if (!entityType || !entityId) return '/';
  return entityType === 'listing' ? `/listings/${entityId}` : entityType === 'market_item' ? `/market/${entityId}` : entityType === 'buddy_post' ? `/buddy/${entityId}` : entityType === 'escrow' ? `/billing/escrows/${entityId}` : '/';
}

export function planFor(plans: PlanDto[] | undefined, key: string): PlanDto | undefined {
  return plans?.find((p) => p.key === key);
}
