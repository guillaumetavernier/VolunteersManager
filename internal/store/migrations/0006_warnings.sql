CREATE TABLE warnings (
    id            TEXT PRIMARY KEY,
    kind          TEXT NOT NULL,
    severity      TEXT NOT NULL,
    message       TEXT NOT NULL,
    entities      TEXT NOT NULL,
    suggested_fix TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_warnings_kind ON warnings(kind);
