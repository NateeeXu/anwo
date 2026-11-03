// Public surface of the "billing" module. Other modules may import only what is exported here.
//   <BoostSheet open entityType="listing" entityId={id} onClose={…} surface="owner_panel" />  — boost purchase sheet
//   <SecurePaymentCta listingId={id} />                                                       — 「安心付押金」 entry point
//   <PartnerCard p={partner} placement="listing_detail" />                                    — Newcomer Kit card (tracked)
//   boostHref('listing', id) → '/pricing?boost=listing:<id>'                                   — deep link that opens the sheet
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
export { BoostSheet, type BoostSheetProps } from './components/BoostSheet';
export { SecurePaymentCta } from './components/EscrowCta';
export { PartnerCard } from './pages/Kit';
export { TestModeBand } from './components/shared';
export { useBoostOptions, useEscrowEligibility, usePartners, type PartnerDto } from './api';

export function boostHref(entityType: 'listing' | 'market_item' | 'buddy_post', entityId: string): string {
  return `/pricing?boost=${entityType}:${entityId}`;
}
