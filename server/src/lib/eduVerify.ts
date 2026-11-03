// Edu email verification — one implementation mounted at /api/auth/request-edu-code + /confirm-edu-code;
// verify's /api/verify/edu/* routes are thin aliases (DATA_MODEL §3.4).
//
//   requestEduCode(user, email) → { sent: true, expiresInSec: 600, campusId, devCode? }
//   confirmEduCode(user, email, code) → updated AuthUser (trust ≥ 1, campus set when it was null)
import { ApiError } from './errors';
import { q } from '../db';
import { campusForEmailDb } from './campuses';
import { sendEmailCode, verifyEmailCode } from './mailbox';
import { recomputeTrust } from './trust';
import { nowIso } from './time';
import { hooks } from './hooks';
import { loadUser } from './auth';
import type { AuthUser } from './types';
import { isEduEmail } from '@shared/campuses';

export function eduCampusFor(email: string): { campusId: string | null; isEdu: boolean } {
  const campus = campusForEmailDb(email);
  const isEdu = !!campus || isEduEmail(email);
  return { campusId: campus?.id ?? null, isEdu };
}

export function requestEduCode(user: AuthUser, emailRaw: string): { sent: true; expiresInSec: number; campusId: string | null; devCode?: string } {
  const email = emailRaw.trim().toLowerCase();
  const { campusId, isEdu } = eduCampusFor(email);
  if (!isEdu) throw new ApiError('NOT_EDU_EMAIL', 'Use a university (.edu) email address', { fields: { email: 'not an edu address' } });
  const other = q.get<{ id: string }>('SELECT id FROM users WHERE edu_email = ? AND email_verified_at IS NOT NULL AND id <> ? AND deleted_at IS NULL', [email, user.id]);
  if (other) throw new ApiError('CONFLICT', 'This edu email is already verified by another account');
  const sent = sendEmailCode(email, 'edu_verify', { userId: user.id, campusId, locale: user.locale });
  return { sent: true, expiresInSec: sent.expiresInSec, campusId, ...(sent.devCode ? { devCode: sent.devCode } : {}) };
}

export function confirmEduCode(user: AuthUser, emailRaw: string, code: string): AuthUser {
  const email = emailRaw.trim().toLowerCase();
  const row = verifyEmailCode(email, 'edu_verify', code);
  const campusId = row.campus_id ?? eduCampusFor(email).campusId;
  const t = nowIso();
  const prevCampus = user.campus_id;
  q.run(
    `UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), edu_email = ?, campus_id = COALESCE(campus_id, ?), updated_at = ? WHERE id = ?`,
    [t, email, campusId, t, user.id],
  );
  recomputeTrust(user.id, 'edu_confirm');
  const updated = loadUser(user.id)!;
  if (prevCampus !== updated.campus_id) hooks.emit('user.campusChanged', { userId: user.id, from: prevCampus, to: updated.campus_id });
  return updated;
}
