// Public surface of the "wanted" module — other modules may import only what is exported here.
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
export { WantedCard, AreaChips, OfferButton } from './components/WantedCard';
export { ScoreBadge, ScoreBreakdown, ScoreDial } from './components/MatchScore';
export { MatchRow } from './components/MatchRow';
export { OfferModal } from './components/OfferModal';
export { useMatchesForMe, useSeekersForListing, useWanted, wantedKeys, fetchForListing, fetchForMe, offerListing } from './api';
export type { MatchWithListing, MatchWithWanted, ForMe, Digest } from './api';
