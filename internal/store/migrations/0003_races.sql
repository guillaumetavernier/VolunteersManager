CREATE TABLE races (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,
    color         TEXT NOT NULL DEFAULT '#3b82f6',
    front_pace    REAL NOT NULL DEFAULT 12.0,
    tail_pace     REAL NOT NULL DEFAULT 5.0,
    start_time    TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE gpx_files (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id          INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    day              INTEGER,
    file_path        TEXT NOT NULL,
    points           TEXT NOT NULL,
    total_distance_m REAL NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX gpx_files_race_idx ON gpx_files(race_id);

CREATE TABLE race_vs_entries (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id         INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    vs_id           INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
    sequence        INTEGER NOT NULL,
    projected_dist_m REAL,
    auto_first_in   TEXT,
    auto_last_in    TEXT,
    manual_first_in TEXT,
    manual_last_in  TEXT,
    UNIQUE(race_id, vs_id),
    UNIQUE(race_id, sequence)
);

CREATE INDEX race_vs_entries_race_idx ON race_vs_entries(race_id);
CREATE INDEX race_vs_entries_vs_idx ON race_vs_entries(vs_id);
