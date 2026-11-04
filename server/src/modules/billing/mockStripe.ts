// Mock Stripe provider (DATA_MODEL §3.9, billing-requirements §8). No network, no keys. Test cards:
//   4242 4242 4242 4242 → succeeds · 4000 0000 0000 0002 → card_declined · 4000 0000 0000 9995 → insufficient_funds
//   any other Luhn-valid number → succeeds. The provider interface (createIntent / confirm / refund) is the single seam
//   to swap for the real Stripe SDK when STRIPE_SECRET_KEY + the BILLING_LIVE flag are set.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { TEST_CARDS } from '@shared/schemas/billing';
import { config } from '../../config';

/** Mock webhook signing secret (derived from the session secret; set MOCK_STRIPE_WEBHOOK_SECRET to share it with a tool).
 *  The real Stripe seam must verify the Stripe-Signature HMAC over the raw body instead. */
const WEBHOOK_SECRET = process.env.MOCK_STRIPE_WEBHOOK_SECRET || createHmac('sha256', config.jwtSecret).update('mock-stripe-webhook').digest('hex');
/** Signature for a mock webhook event: hex HMAC-SHA256 over `${type}.${intentId}`, sent as `Mock-Stripe-Signature`. */
export function signMockWebhook(type: string, intentId: string): string {
  return createHmac('sha256', WEBHOOK_SECRET).update(`${type}.${intentId}`).digest('hex');
}
export function verifyMockWebhook(type: string, intentId: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const want = Buffer.from(signMockWebhook(type, intentId), 'hex');
  const got = Buffer.from(signature.trim(), 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

export type CardLike = { cardNumber: string; expMonth: number; expYear: number; cvc?: string; name?: string };
export type Intent = { id: string; clientSecret: string; amountCents: number; status: 'requires_payment_method' };
export type ConfirmResult =
  | { ok: true; chargeId: string; brand: string; last4: string }
  | { ok: false; failureCode: 'card_declined' | 'insufficient_funds' | 'expired_card' | 'incorrect_number'; message: string };

function rid(prefix: string): string {
  return `${prefix}_mock_${randomBytes(10).toString('hex')}`;
}

export function luhnValid(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function brandOf(num: string): string {
  if (/^4/.test(num)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(num)) return 'mastercard';
  if (/^3[47]/.test(num)) return 'amex';
  if (/^62/.test(num)) return 'unionpay';
  if (/^6(011|5)/.test(num)) return 'discover';
  return 'card';
}

export function cardExpired(expMonth: number, expYear: number, now = new Date()): boolean {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return expYear < y || (expYear === y && expMonth < m);
}

export const mockStripe = {
  createIntent(amountCents: number): Intent {
    const id = rid('pi');
    return { id, clientSecret: `${id}_secret_${randomBytes(6).toString('hex')}`, amountCents, status: 'requires_payment_method' };
  },
  /** Synchronous confirm: the outcome is decided by the test card number. */
  confirm(card: CardLike): ConfirmResult {
    const num = card.cardNumber.replace(/\D/g, '');
    if (num === TEST_CARDS.declined) return { ok: false, failureCode: 'card_declined', message: 'Your card was declined.' };
    if (num === TEST_CARDS.insufficientFunds) return { ok: false, failureCode: 'insufficient_funds', message: 'Your card has insufficient funds.' };
    if (!luhnValid(num)) return { ok: false, failureCode: 'incorrect_number', message: 'Your card number is incorrect.' };
    if (cardExpired(card.expMonth, card.expYear)) return { ok: false, failureCode: 'expired_card', message: 'Your card has expired.' };
    return { ok: true, chargeId: rid('ch'), brand: brandOf(num), last4: num.slice(-4) };
  },
  /** Saved-card charge: a stored mock token always succeeds (the card was validated when saved). */
  confirmToken(token: string): ConfirmResult {
    if (!token.startsWith('pm_mock')) return { ok: false, failureCode: 'card_declined', message: 'Unknown payment method.' };
    return { ok: true, chargeId: rid('ch'), brand: 'card', last4: '' };
  },
  /** Charge id reported by a (signed) payment_intent.succeeded webhook. */
  chargeFor(_intentId: string): string {
    return rid('ch');
  },
  refund(_chargeId: string | null, amountCents: number): { id: string; amountCents: number } {
    return { id: rid('re'), amountCents };
  },
  tokenize(card: CardLike): string {
    return rid('pm');
  },
};
