// Public surface of the "listings" module. Other modules import only from here.
//   import { ListingCard } from '@/features/listings'   →  <ListingCard listing={card} variant="grid" | "row" onHover={…} />
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
export { ListingCard, roomsLabel, type ListingCardProps } from './components/ListingCard';
export { SaveButton, useSaveListing } from './components/SaveButton';
export { StatusBadge as ListingStatusBadge } from './components/StatusBadge';
export { TrustStrip } from './components/TrustStrip';
export { listingsApi, keys as listingsQueryKeys } from './api';
