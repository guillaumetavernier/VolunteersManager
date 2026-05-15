CREATE TABLE events (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    name          TEXT NOT NULL DEFAULT '',
    start_date    TEXT NOT NULL DEFAULT '',
    end_date      TEXT NOT NULL DEFAULT '',
    timezone      TEXT NOT NULL DEFAULT 'Europe/Paris',
    country_code  TEXT NOT NULL DEFAULT 'FR',
    settings      TEXT NOT NULL DEFAULT '{}',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
