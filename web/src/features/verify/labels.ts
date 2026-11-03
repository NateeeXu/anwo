// Small shared label helpers for the verify feature.
import type { VerificationStatus, VerificationType } from '@shared/enums';
import type { Translate } from '@/app/errors';

export const ID_TYPES: VerificationType[] = ['student_id', 'passport', 'government_id', 'landlord_proof'];

export function typeLabel(t: Translate, type: VerificationType | string | null | undefined): string {
  return type ? t(`verify.id.type.${type}`) : '';
}

export function statusVariant(status: VerificationStatus): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  switch (status) {
    case 'pending': return 'warning';
    case 'in_review': return 'info';
    case 'approved': return 'success';
    case 'rejected': return 'danger';
    default: return 'neutral';
  }
}

export function brandLabel(t: Translate, brand: string): string {
  const key = `verify.payment.brand.${brand}`;
  const v = t(key);
  return v === key ? brand : v;
}

/** Minutes → "1 小时" / "1 h"-ish, using the existing formatMinutes-free fallback. */
export function roughDuration(minutes: number, locale: string): string {
  const zh = locale.startsWith('zh');
  if (minutes < 60) return zh ? `${Math.max(1, Math.round(minutes))} 分钟` : `${Math.max(1, Math.round(minutes))} min`;
  const h = Math.round(minutes / 60);
  if (h < 48) return zh ? `${h} 小时` : `${h} h`;
  const d = Math.round(h / 24);
  return zh ? `${d} 天` : `${d} days`;
}
