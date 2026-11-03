// server/src/modules/market/service.ts — OWNED BY THE `market` MODULE AGENT. Consumed by listings (POST /:id/rented { closeBundle }).
import { ApiError } from '../../lib/errors';

export function closeBundlesForListing(_listingId: string): number {
  throw new ApiError('NOT_IMPLEMENTED', 'market.closeBundlesForListing not implemented yet');
}
