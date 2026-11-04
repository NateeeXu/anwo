-- 20_review_fixes.sql — additive columns from the security + product-QA review fixes (docs/REVIEW_FIXES.md). Runs once per DB.
-- Pro plan changes: downgrades are scheduled for the period end; at most one change per billing period.
ALTER TABLE subscriptions ADD COLUMN pending_plan_id TEXT;
ALTER TABLE subscriptions ADD COLUMN plan_changed_at TEXT;
-- Amount actually paid for one boost row (its share of the order, after discount); cancel refunds are prorated from it.
ALTER TABLE boosts ADD COLUMN price_cents INTEGER;
-- Session invalidation: JWTs carry `sv`; bumping it logs every session out (password change / reset / ban / log out everywhere).
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
-- Verification documents are purged after review; the request keeps the timestamp (and the upload sha256 for duplicate detection).
ALTER TABLE verification_requests ADD COLUMN files_purged_at TEXT;
-- Per-partner HMAC secret for conversion postbacks.
ALTER TABLE partners ADD COLUMN postback_secret TEXT;
