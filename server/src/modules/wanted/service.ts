// server/src/modules/wanted/service.ts — OWNED BY THE `wanted` MODULE AGENT. Stable exports consumed by listings and the digest job.
import { ApiError } from '../../lib/errors';

export function recomputeForListing(_listingId: string): number {
  throw new ApiError('NOT_IMPLEMENTED', 'wanted.recomputeForListing not implemented yet');
}
export function seekersForListing(_listingId: string): unknown[] {
  throw new ApiError('NOT_IMPLEMENTED', 'wanted.seekersForListing not implemented yet');
}
export function buildDigest(_userId: string): { subject: string; items: unknown[]; generatedAt: string } {
  throw new ApiError('NOT_IMPLEMENTED', 'wanted.buildDigest not implemented yet');
}
