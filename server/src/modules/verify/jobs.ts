// server/src/modules/verify/jobs.ts — registered by the scaffold scheduler as `verify.<name>`.
// Document retention: ID images / selfies are deleted DOC_RETENTION_DAYS after the decision (UI privacy note promises it).
import { logger } from '../../lib/logger';
import { purgeReviewedDocuments } from './service';

export const jobs = [
  { name: 'purgeReviewedDocuments', everyMs: 6 * 60 * 60_000, run: () => { const n = purgeReviewedDocuments(); if (n) logger.info({ purged: n }, 'verification documents purged'); } },
];
export default jobs;
