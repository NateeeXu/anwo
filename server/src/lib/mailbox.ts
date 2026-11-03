// Dev mailbox: email / SMS codes are stored in email_codes / phone_codes and shown at /api/dev/mailbox.
// No real mail is ever sent. In non-production the code is also returned (`devCode`) so Playwright can skip the mailbox.
//
//   const r = sendEmailCode(email, 'edu_verify', { userId, campusId, locale });   // { id, code, expiresAt, devCode? }
//   verifyEmailCode(email, 'edu_verify', code)                                     // throws CODE_INVALID / CODE_EXPIRED / CODE_ATTEMPTS
//   sendSmsCode(userId, phone); verifySmsCode(userId, code)
import { q, uid } from '../db';
import { ApiError } from './errors';
import { sixDigitCode } from './ids';
import { nowIso, nowMs, isoPlus } from './time';
import { config } from '../config';
import { checkRate } from './ratelimit';
import { NAME_DISPLAY } from '@shared/brand';

export type EmailCodePurpose = 'edu_verify' | 'login' | 'password_reset' | 'email_change';
export type SentCode = { id: string; code: string; expiresAt: string; expiresInSec: number; devCode?: string };

const EMAIL_TTL_SEC = 600;
const SMS_TTL_SEC = 300;

function render(purpose: EmailCodePurpose, code: string, locale: 'zh-CN' | 'en'): { subject: string; body: string } {
  const zh = locale === 'zh-CN';
  const subjects: Record<EmailCodePurpose, [string, string]> = {
    edu_verify: ['校园邮箱验证码', 'Your campus email verification code'],
    login: ['登录验证码', 'Your login code'],
    password_reset: ['重置密码验证码', 'Your password reset code'],
    email_change: ['更换邮箱验证码', 'Your email change code'],
  };
  const [sZh, sEn] = subjects[purpose];
  const subject = `[${NAME_DISPLAY}] ${zh ? sZh : sEn}: ${code}`;
  const body = zh
    ? `你的验证码是 ${code}，${EMAIL_TTL_SEC / 60} 分钟内有效。如果这不是你本人的操作，请忽略本邮件。`
    : `Your verification code is ${code}. It expires in ${EMAIL_TTL_SEC / 60} minutes. If you did not request this, ignore this email.`;
  return { subject, body };
}

export function sendEmailCode(
  to: string,
  purpose: EmailCodePurpose,
  opts: { userId?: string | null; campusId?: string | null; locale?: 'zh-CN' | 'en'; rateLimit?: boolean } = {},
): SentCode {
  const email = to.trim().toLowerCase();
  if (opts.rateLimit !== false) checkRate(`email-code:${email}`, 3, 10 * 60_000);
  const code = sixDigitCode();
  const id = uid();
  const expiresAt = isoPlus(EMAIL_TTL_SEC * 1000);
  const { subject, body } = render(purpose, code, opts.locale ?? 'zh-CN');
  // invalidate older unconsumed codes for the same purpose
  q.run('UPDATE email_codes SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL', [nowIso(), email, purpose]);
  q.run(
    `INSERT INTO email_codes (id, user_id, email, code, purpose, campus_id, subject, body, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, opts.userId ?? null, email, code, purpose, opts.campusId ?? null, subject, body, expiresAt, nowIso()],
  );
  return { id, code, expiresAt, expiresInSec: EMAIL_TTL_SEC, ...(config.isProd ? {} : { devCode: code }) };
}

export type EmailCodeRow = {
  id: string;
  user_id: string | null;
  email: string;
  code: string;
  purpose: string;
  campus_id: string | null;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
};

/** Validates + consumes the latest unconsumed code. Returns the row (with campus_id) on success. */
export function verifyEmailCode(to: string, purpose: EmailCodePurpose, code: string): EmailCodeRow {
  const email = to.trim().toLowerCase();
  const row = q.get<EmailCodeRow>(
    'SELECT * FROM email_codes WHERE email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [email, purpose],
  );
  if (!row) throw new ApiError('CODE_INVALID', 'No active code for this address');
  if (row.expires_at < nowIso()) throw new ApiError('CODE_EXPIRED', 'Code expired, request a new one');
  if (row.attempts >= row.max_attempts) throw new ApiError('CODE_ATTEMPTS', 'Too many attempts, request a new one');
  if (row.code !== code.trim()) {
    q.run('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    if (row.attempts + 1 >= row.max_attempts) throw new ApiError('CODE_ATTEMPTS', 'Too many attempts, request a new one');
    throw new ApiError('CODE_INVALID', 'Incorrect code');
  }
  q.run('UPDATE email_codes SET consumed_at = ? WHERE id = ?', [nowIso(), row.id]);
  return row;
}

export function sendSmsCode(userId: string, phone: string, purpose: 'phone_verify' | 'login' = 'phone_verify', opts: { locale?: 'zh-CN' | 'en' } = {}): SentCode {
  checkRate(`sms-code:${phone}`, 3, 10 * 60_000);
  const code = sixDigitCode();
  const id = uid();
  const expiresAt = isoPlus(SMS_TTL_SEC * 1000);
  const body = opts.locale === 'en' ? `${NAME_DISPLAY} code: ${code} (valid ${SMS_TTL_SEC / 60} min)` : `【${NAME_DISPLAY}】验证码 ${code}，${SMS_TTL_SEC / 60} 分钟内有效。`;
  q.run('UPDATE phone_codes SET consumed_at = ? WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL', [nowIso(), userId, purpose]);
  q.run('INSERT INTO phone_codes (id, user_id, phone, code, purpose, body, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, userId, phone, code, purpose, body, expiresAt, nowIso()]);
  return { id, code, expiresAt, expiresInSec: SMS_TTL_SEC, ...(config.isProd ? {} : { devCode: code }) };
}
export type PhoneCodeRow = { id: string; user_id: string; phone: string; code: string; purpose: string; attempts: number; max_attempts: number; expires_at: string; consumed_at: string | null };
export function verifySmsCode(userId: string, code: string, purpose: 'phone_verify' | 'login' = 'phone_verify'): PhoneCodeRow {
  const row = q.get<PhoneCodeRow>('SELECT * FROM phone_codes WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1', [userId, purpose]);
  if (!row) throw new ApiError('CODE_INVALID', 'No active code');
  if (row.expires_at < nowIso()) throw new ApiError('CODE_EXPIRED', 'Code expired');
  if (row.attempts >= row.max_attempts) throw new ApiError('CODE_ATTEMPTS', 'Too many attempts');
  if (row.code !== code.trim()) {
    q.run('UPDATE phone_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    throw new ApiError('CODE_INVALID', 'Incorrect code');
  }
  q.run('UPDATE phone_codes SET consumed_at = ? WHERE id = ?', [nowIso(), row.id]);
  return row;
}

// ------------------------------------------------------------------ dev mailbox
export type MailboxEmail = { id: string; to: string; subject: string | null; body: string | null; code: string; purpose: string; consumedAt: string | null; createdAt: string };
export type MailboxSms = { id: string; to: string; body: string | null; code: string; purpose: string; consumedAt: string | null; createdAt: string };
export function listMailbox(filter: { email?: string; phone?: string; limit?: number } = {}): { emails: MailboxEmail[]; sms: MailboxSms[] } {
  const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
  const emails = q
    .all<{ id: string; email: string; subject: string | null; body: string | null; code: string; purpose: string; consumed_at: string | null; created_at: string }>(
      `SELECT id, email, subject, body, code, purpose, consumed_at, created_at FROM email_codes ${filter.email ? 'WHERE email = ?' : ''} ORDER BY created_at DESC LIMIT ${limit}`,
      filter.email ? [filter.email.toLowerCase()] : [],
    )
    .map((r) => ({ id: r.id, to: r.email, subject: r.subject, body: r.body, code: r.code, purpose: r.purpose, consumedAt: r.consumed_at, createdAt: r.created_at }));
  const sms = q
    .all<{ id: string; phone: string; body: string | null; code: string; purpose: string; consumed_at: string | null; created_at: string }>(
      `SELECT id, phone, body, code, purpose, consumed_at, created_at FROM phone_codes ${filter.phone ? 'WHERE phone = ?' : ''} ORDER BY created_at DESC LIMIT ${limit}`,
      filter.phone ? [filter.phone] : [],
    )
    .map((r) => ({ id: r.id, to: r.phone, body: r.body, code: r.code, purpose: r.purpose, consumedAt: r.consumed_at, createdAt: r.created_at }));
  return { emails, sms };
}
export function clearMailbox(): void {
  q.run('DELETE FROM email_codes');
  q.run('DELETE FROM phone_codes');
}
export function cleanupOldCodes(days = 7): number {
  const before = new Date(nowMs() - days * 86_400_000).toISOString();
  const a = q.run('DELETE FROM email_codes WHERE created_at < ?', [before]).changes;
  const b = q.run('DELETE FROM phone_codes WHERE created_at < ?', [before]).changes;
  return Number(a) + Number(b);
}
