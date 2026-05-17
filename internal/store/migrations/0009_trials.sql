CREATE TABLE trials (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  race_id      INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  sequence     INTEGER NOT NULL,
  name         TEXT NOT NULL,
  start_time   TEXT,
  front_pace   REAL NOT NULL,
  tail_pace    REAL NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(race_id, sequence)
);

CREATE TABLE race_trial_vs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  trial_id        INTEGER NOT NULL REFERENCES trials(id) ON DELETE CASCADE,
  vs_id           INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
  source          TEXT NOT NULL CHECK (source IN ('auto','manual_include','manual_exclude')),
  dist_in_trial_m REAL,
  auto_first_in   TEXT,
  auto_last_in    TEXT,
  manual_first_in TEXT,
  manual_last_in  TEXT,
  UNIQUE(trial_id, vs_id)
);
CREATE INDEX race_trial_vs_trial_idx ON race_trial_vs(trial_id);
CREATE INDEX race_trial_vs_vs_idx    ON race_trial_vs(vs_id);

ALTER TABLE gpx_files ADD COLUMN trial_id INTEGER REFERENCES trials(id) ON DELETE SET NULL;
ALTER TABLE gpx_files DROP COLUMN day;

ALTER TABLE races               DROP COLUMN start_time;
ALTER TABLE races               DROP COLUMN front_pace;
ALTER TABLE races               DROP COLUMN tail_pace;
ALTER TABLE race_vs_entries     DROP COLUMN auto_first_in;
ALTER TABLE race_vs_entries     DROP COLUMN auto_last_in;
ALTER TABLE race_vs_entries     DROP COLUMN manual_first_in;
ALTER TABLE race_vs_entries     DROP COLUMN manual_last_in;
