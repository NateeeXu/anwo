// server/src/modules/listings/service.ts — OWNED BY THE `listings` MODULE AGENT. Stable exports consumed by wanted/billing/chat.
import type { ContextCard } from '@shared/types';
import { ApiError } from '../../lib/errors';

/** The ONLY writer of listing_leads. */
export function recordLead(_args: { listingId: string; userId: string; conversationId?: string | null; source: 'message' | 'wanted_offer' | 'escrow' | 'phone_reveal' }): { id: string; created: boolean } {
  throw new ApiError('NOT_IMPLEMENTED', 'listings.recordLead not implemented yet');
}
export function listingContextCard(_id: string): ContextCard | null {
  throw new ApiError('NOT_IMPLEMENTED', 'listings.listingContextCard not implemented yet');
}
