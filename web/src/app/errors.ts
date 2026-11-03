// Maps ApiError codes to i18n strings (keys 'error.<CODE>' live in web/src/i18n/common.ts).
import { ApiError } from '../lib/api';

export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function errorMessage(t: Translate, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `error.${err.code}`;
    const msg = t(key, (err.data as Record<string, string | number>) ?? undefined);
    if (msg !== key) return msg;
    if (err.status === 0) return t('error.offline');
    return t('error.generic');
  }
  return t('error.generic');
}

/** Field-level error from `fields` (zod path → message), translated when a key exists. */
export function fieldError(t: Translate, err: unknown, field: string): string | undefined {
  if (!(err instanceof ApiError) || !err.fields) return undefined;
  const raw = err.fields[field] ?? err.fields[`body.${field}`];
  if (!raw) return undefined;
  const key = `error.field.${field}`;
  const msg = t(key);
  return msg !== key ? msg : raw;
}
