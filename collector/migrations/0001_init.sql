-- League Plus 24/7 collector schema.
CREATE TABLE IF NOT EXISTS lp_rounds (
  round_id   INTEGER NOT NULL,
  game       INTEGER NOT NULL,
  ts         INTEGER NOT NULL,
  json       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (round_id, game)
);

CREATE INDEX IF NOT EXISTS idx_lp_rounds_ts ON lp_rounds(ts);

CREATE TABLE IF NOT EXISTS lp_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
