CREATE TABLE volunteers (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name               TEXT NOT NULL,
    last_name                TEXT NOT NULL,
    phone                    TEXT NOT NULL,
    email                    TEXT,
    emergency_contact_name   TEXT,
    emergency_contact_phone  TEXT,
    general_info             TEXT,
    customizable_message     TEXT,
    role_types               TEXT NOT NULL DEFAULT '[]',
    availability             TEXT NOT NULL DEFAULT '[]',
    default_vs_id            INTEGER REFERENCES vs(id) ON DELETE SET NULL,
    can_drive                INTEGER NOT NULL DEFAULT 0,
    license_type             TEXT,
    notes                    TEXT,
    archived                 INTEGER NOT NULL DEFAULT 0,
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX volunteers_archived_idx ON volunteers(archived);
CREATE INDEX volunteers_email_idx ON volunteers(email);
CREATE INDEX volunteers_name_idx ON volunteers(last_name, first_name);

CREATE TABLE cars (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL UNIQUE,
    seats             INTEGER NOT NULL,
    default_driver_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX cars_default_driver_idx ON cars(default_driver_id);

CREATE TABLE csv_imports (
    id          TEXT PRIMARY KEY,
    state       TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT NOT NULL
);
