-- 14_map.sql — map module (docs/modules/map.md). Additive only.
-- Students suggest a missing campus place from the explore map (「补充地点」); admins approve it into `pois`
-- or reject it with a reason. The suggester is notified either way. No existing table can hold the pending
-- state + suggester + review trail, hence this table.
CREATE TABLE IF NOT EXISTS poi_suggestions (
  id            TEXT PRIMARY KEY,
  campus_id     TEXT NOT NULL REFERENCES campuses(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  name_zh       TEXT,
  category      TEXT NOT NULL CHECK (category IN ('building','library','dining','grocery','asian_grocery','transit','gym','health','bank','pharmacy','post','landmark','other')),
  lat           REAL NOT NULL,
  lng           REAL NOT NULL,
  address       TEXT,
  url           TEXT,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  poi_id        TEXT REFERENCES pois(id) ON DELETE SET NULL,
  reviewer_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  review_reason TEXT,
  reviewed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_poi_suggestions_status ON poi_suggestions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_poi_suggestions_user ON poi_suggestions(user_id, created_at);
