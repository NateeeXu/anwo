-- 20b_sponsorships.sql — sponsored placements (BUSINESS_PLAN §2.5, billing-requirements §11): bookings sold by the team
-- (Local / Feed / Campus Partner) and their invoices. Rendered as labelled 「赞助 Sponsored」 cards on the home feed
-- (max 3 per campus) and in the matching Newcomer Kit category; never inside search results.
CREATE TABLE IF NOT EXISTS sponsorships (
  id              TEXT PRIMARY KEY,
  sponsor_name    TEXT NOT NULL,
  plan_key        TEXT,                                  -- sponsor.local / sponsor.feed / sponsor.campus_partner …
  campus_id       TEXT REFERENCES campuses(id) ON DELETE SET NULL,
  surface         TEXT NOT NULL DEFAULT 'home_feed' CHECK (surface IN ('home_feed','kit','map')),
  kit_category    TEXT,                                  -- surface = kit: the Newcomer Kit category key
  title           TEXT NOT NULL,
  title_zh        TEXT,
  body            TEXT,
  body_zh         TEXT,
  url             TEXT NOT NULL,                         -- http(s) only, opened through /api/billing/sponsorships/:id/go
  logo_upload_id  TEXT REFERENCES uploads(id) ON DELETE SET NULL,
  lat             REAL,
  lng             REAL,
  starts_at       TEXT NOT NULL,
  ends_at         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused','ended')),
  impressions     INTEGER NOT NULL DEFAULT 0,
  clicks          INTEGER NOT NULL DEFAULT 0,
  price_cents     INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sponsorships_live ON sponsorships(surface, campus_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS sponsorship_invoices (
  id              TEXT PRIMARY KEY,
  sponsorship_id  TEXT NOT NULL REFERENCES sponsorships(id) ON DELETE CASCADE,
  amount_cents    INTEGER NOT NULL CHECK (amount_cents >= 0),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','void')),
  campus_id       TEXT REFERENCES campuses(id) ON DELETE SET NULL,
  issued_at       TEXT NOT NULL,
  paid_at         TEXT,
  note            TEXT
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_invoices_paid ON sponsorship_invoices(status, paid_at);
