CREATE TABLE missions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    vs_id           INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
    day             INTEGER NOT NULL,
    start_time      TEXT NOT NULL,
    end_time        TEXT NOT NULL,
    role_type       TEXT NOT NULL,
    headcount       INTEGER NOT NULL DEFAULT 1,
    title           TEXT,
    description     TEXT,
    tagged_race_ids TEXT NOT NULL DEFAULT '[]',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_missions_vs  ON missions(vs_id);
CREATE INDEX idx_missions_day ON missions(day);

CREATE TABLE assignments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id   INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(mission_id, volunteer_id)
);
CREATE INDEX idx_assignments_volunteer ON assignments(volunteer_id);
