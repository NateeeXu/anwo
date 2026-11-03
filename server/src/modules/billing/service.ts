// server/src/modules/billing/service.ts — OWNED BY THE `billing` MODULE AGENT. Consumed by listings/market/buddy/admin.
// pickSponsored / recordImpressions are implemented by the scaffold in server/src/lib/sponsored.ts (re-exported here); billing may extend.
import { ApiError } from '../../lib/errors';
export { pickSponsored, recordImpressions, mergeSponsored, sponsoredSlotCount } from '../../lib/sponsored';

export function quoteEscrowFee(_amountCents: number, _feePayer: 'payer' | 'payee' | 'split' = 'payer'): { amountCents: number; feeBps: number; feeCents: number; payerTotalCents: number; payeeNetCents: number } {
  throw new ApiError('NOT_IMPLEMENTED', 'billing.quoteEscrowFee not implemented yet');
}
