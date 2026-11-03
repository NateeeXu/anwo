// server/src/db/seed/map.ts — OWNED BY THE `map` MODULE AGENT (scaffold stub).
// Fill with realistic bilingual seed data for ≥ 3 campuses (Northwestern rich; e.g. UIUC + NYU lighter).
// Contract: default export `async function seed(db)`; bump `version` whenever the data changes (seed/index.ts re-runs
// when the version increases; delete-and-insert your module's tables inside q.tx()). Core seed runs first:
// look up users by email (q.get('SELECT id FROM users WHERE email = ?')), campuses by id ('northwestern', 'uiuc', 'nyu', ...),
// seed images via insertSeedUpload({ path: 'seed/rooms/r01.svg', purpose: 'seed' }) from server/src/lib/uploads.ts.
import type { DatabaseSync } from 'node:sqlite';

export const version = 0; // 0 = stub (skipped by the runner once recorded)

export default async function seed(_db: DatabaseSync): Promise<void> {
  // TODO(map agent): insert seed rows for this module.
}
