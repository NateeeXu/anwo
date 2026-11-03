-- 18_billing.sql — additive billing columns + tables (docs/modules/billing-requirements.md §11). Runs once per DB.
ALTER TABLE pricing_plans ADD COLUMN fee_cap_cents INTEGER;
ALTER TABLE pricing_plans ADD COLUMN min_trust INTEGER NOT NULL DEFAULT 1;
ALTER TABLE pricing_plans ADD COLUMN requires_badge TEXT;
ALTER TABLE pricing_plans ADD COLUMN addon_for TEXT;
ALTER TABLE pricing_plans ADD COLUMN self_serve INTEGER NOT NULL DEFAULT 1;

ALTER TABLE boosts ADD COLUMN nationwide INTEGER NOT NULL DEFAULT 0;
ALTER TABLE boosts ADD COLUMN paused_at TEXT;

ALTER TABLE escrows ADD COLUMN rail TEXT NOT NULL DEFAULT 'ach';
ALTER TABLE escrows ADD COLUMN card_fee_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE escrows ADD COLUMN dispute_reason_code TEXT;

ALTER TABLE partners ADD COLUMN network TEXT;
ALTER TABLE partners ADD COLUMN no_ssn_ok INTEGER NOT NULL DEFAULT 0;
ALTER TABLE partners ADD COLUMN no_ssn_verified_at TEXT;
ALTER TABLE partners ADD COLUMN rubric_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE partners ADD COLUMN payout_note TEXT;

CREATE TABLE IF NOT EXISTS partner_conversions (
  id           TEXT PRIMARY KEY,
  partner_id   TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  click_id     TEXT REFERENCES partner_clicks(id) ON DELETE SET NULL,
  network_ref  TEXT UNIQUE,
  payout_cents INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','reversed','paid')),
  source       TEXT NOT NULL DEFAULT 'postback' CHECK (source IN ('postback','csv','manual')),
  campus_id    TEXT REFERENCES campuses(id) ON DELETE SET NULL,
  occurred_at  TEXT NOT NULL,
  imported_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_partner_conversions_partner ON partner_conversions(partner_id, occurred_at);

CREATE TABLE IF NOT EXISTS sponsor_leads (
  id            TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  contact       TEXT NOT NULL,
  campus_id     TEXT REFERENCES campuses(id) ON DELETE SET NULL,
  interest      TEXT NOT NULL DEFAULT 'sponsor' CHECK (interest IN ('sponsor','building')),
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','won','lost')),
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS subscription_seats (
  id              TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'member',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (subscription_id, user_id)
);

CREATE TABLE IF NOT EXISTS kit_checklist (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  done_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, slug)
);
