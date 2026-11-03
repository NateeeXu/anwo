// server/src/modules/listings/jobs.ts — registered by the scaffold scheduler as `listings.<name>` (SERVER.md §3 jobs).
// The scaffold `expireContent` job also flips expired listings; this one adds owner notifications (expired + 3-day warning).
import { runExpiry } from './service';

export const jobs = [
  { name: 'expireListings', everyMs: 30 * 60_000, run: () => { runExpiry(); } },
];
export default jobs;
