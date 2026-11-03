// server/src/modules/buddy/jobs.ts — registered by the scaffold scheduler as `buddy.<name>` (SERVER.md §3 jobs).
import { expireBuddyPosts, sendReminders } from './service';

export const jobs = [
  // DATA_MODEL §10 buddyReminders: members get a bell 24 h before and 2 h before an occurrence starts.
  { name: 'reminders', everyMs: 15 * 60_000, run: () => { sendReminders(24, 'day'); sendReminders(2, 'soon'); } },
  // Finer-grained than the hourly scaffold expireContent (also marks finished occurrences done).
  { name: 'expire', everyMs: 15 * 60_000, run: () => { expireBuddyPosts(); } },
];
