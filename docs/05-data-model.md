# 05 — Data Model

> ⚠️ **Substantially superseded.** This schema was sketched assuming multiple events per SQLite file. The implementation uses **one event per SQLite file**, so every `event_id` column shown below has been **dropped** in the actual migrations. The authoritative schemas live in the per-milestone files under [`milestones/`](./milestones/) (`0001_init.sql` through `0008_*.sql`). Use this document as a *conceptual* reference for what each entity stores and how they relate — not for column-level DDL.
>
> See [`milestones/README.md`](./milestones/README.md) ("Locked decisions") for the full list of overrides.

This is a concrete sketch, not the final migration. Field names, types, and constraints will be refined as the code is written. Use as a reference, not a contract.

## Entity-relationship overview

```
Event ──────┬── Volunteer ─── (role_types[])
            │       │
            │       └── Assignment ─── Mission
            │                              │
            ├── Car                        │
            │       │                      │
            │       └── Trip ── Stop ──────┤  (each Stop references a VS;
            │                              │   Mission references a VS)
            │                              │
            ├── VS ────────────────────────┘
            │
            └── Race
                  │
                  ├── GPX(s)            (one or more, day-tagged)
                  └── RaceVSEntry       (ordered list, with first-in/last-in per entry)
```

## SQLite schema sketch

```sql
-- Events
CREATE TABLE events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    start_date    TEXT NOT NULL,           -- ISO date.
    end_date      TEXT NOT NULL,
    timezone      TEXT NOT NULL DEFAULT 'Europe/Paris',
    country_code  TEXT NOT NULL DEFAULT 'FR',
    settings      TEXT NOT NULL DEFAULT '{}', -- JSON blob: roadbook settings, thresholds.
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- Days are implicit (day 1, day 2, ...) derived from start_date and end_date.
-- No separate days table needed.

-- Volunteer Spots
CREATE TABLE vs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    lat           REAL NOT NULL,
    lon           REAL NOT NULL,
    notes         TEXT,
    photo_path    TEXT,                    -- Relative to assets/.
    what3words    TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    UNIQUE(event_id, name)
);

-- Volunteers
CREATE TABLE volunteers (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id                 INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    first_name               TEXT NOT NULL,
    last_name                TEXT NOT NULL,
    phone                    TEXT NOT NULL,         -- E.164.
    email                    TEXT,
    emergency_contact_name   TEXT,
    emergency_contact_phone  TEXT,
    general_info             TEXT,
    customizable_message     TEXT,
    role_types               TEXT NOT NULL DEFAULT '[]', -- JSON array of role-type strings.
    availability             TEXT NOT NULL DEFAULT '[]', -- JSON: list of {day, start, end}.
    default_vs_id            INTEGER REFERENCES vs(id) ON DELETE SET NULL,
    can_drive                INTEGER NOT NULL DEFAULT 0,
    license_type             TEXT,
    notes                    TEXT,
    archived                 INTEGER NOT NULL DEFAULT 0, -- Soft delete flag.
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL
);

CREATE INDEX idx_volunteers_event ON volunteers(event_id);

-- Cars
CREATE TABLE cars (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id          INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    seats             INTEGER NOT NULL,
    default_driver_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
    notes             TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
);

-- Races (within an event)
CREATE TABLE races (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    color         TEXT,                    -- Hex color for map rendering.
    front_pace    REAL NOT NULL DEFAULT 12.0, -- km/h.
    tail_pace     REAL NOT NULL DEFAULT 5.0,
    start_time    TEXT,                    -- ISO datetime in event's timezone.
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

-- GPX files (one or more per race, optionally tagged with a day)
CREATE TABLE gpx_files (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id       INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    day           INTEGER,                 -- Null = applies to whole race.
    file_path     TEXT NOT NULL,           -- Relative to assets/gpx/.
    points        TEXT NOT NULL,           -- JSON: simplified [(lat, lon, cum_dist_m), ...].
    total_distance_m REAL NOT NULL,
    created_at    TEXT NOT NULL
);

-- Ordered VS list along a race
CREATE TABLE race_vs_entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id       INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
    vs_id         INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
    sequence      INTEGER NOT NULL,        -- Order along the race route, 0-indexed.
    auto_first_in  TEXT,                   -- Auto-computed first-runner-in (ISO datetime).
    auto_last_in   TEXT,                   -- Auto-computed last-runner-in.
    manual_first_in TEXT,                  -- Coordinator override; takes precedence.
    manual_last_in  TEXT,
    UNIQUE(race_id, vs_id),
    UNIQUE(race_id, sequence)
);

-- Missions
CREATE TABLE missions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    vs_id           INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
    day             INTEGER NOT NULL,
    start_time      TEXT NOT NULL,         -- ISO datetime in event's timezone.
    end_time        TEXT NOT NULL,
    role_type       TEXT NOT NULL,
    headcount       INTEGER NOT NULL DEFAULT 1,
    title           TEXT,                  -- Optional human label.
    description     TEXT,
    tagged_race_ids TEXT NOT NULL DEFAULT '[]', -- JSON array of race IDs (filter only).
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE INDEX idx_missions_event ON missions(event_id);
CREATE INDEX idx_missions_vs    ON missions(vs_id);
CREATE INDEX idx_missions_day   ON missions(day);

-- Assignments (volunteer → mission)
CREATE TABLE assignments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    mission_id   INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL,
    UNIQUE(mission_id, volunteer_id)
);

CREATE INDEX idx_assignments_volunteer ON assignments(volunteer_id);

-- Trips
CREATE TABLE trips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    day         INTEGER NOT NULL,
    driver_id   INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE RESTRICT,
    car_id      INTEGER NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
    mode        TEXT NOT NULL DEFAULT 'drive', -- drive | walk.
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX idx_trips_event ON trips(event_id);

-- Trip stops (ordered)
CREATE TABLE trip_stops (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id       INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    sequence      INTEGER NOT NULL,
    vs_id         INTEGER NOT NULL REFERENCES vs(id) ON DELETE RESTRICT,
    time          TEXT NOT NULL,           -- ISO datetime; for first stop = departure; for others = arrival (= departure).
    leg_time_source TEXT NOT NULL DEFAULT 'auto', -- auto | manual.
    UNIQUE(trip_id, sequence)
);

-- Trip stop boarding/alighting
CREATE TABLE trip_stop_passengers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_stop_id  INTEGER NOT NULL REFERENCES trip_stops(id) ON DELETE CASCADE,
    volunteer_id  INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    action        TEXT NOT NULL,           -- board | alight.
    UNIQUE(trip_stop_id, volunteer_id, action)
);

-- Travel-time matrix
CREATE TABLE travel_times (
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    from_vs_id  INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
    to_vs_id    INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
    mode        TEXT NOT NULL,             -- drive | walk.
    seconds     INTEGER NOT NULL,
    source      TEXT NOT NULL,             -- auto | manual | fallback.
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (event_id, from_vs_id, to_vs_id, mode)
);

-- Warnings cache (optional; constraint engine can also recompute on demand)
CREATE TABLE warnings (
    id          TEXT PRIMARY KEY,          -- Stable hash; same situation = same ID.
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    severity    TEXT NOT NULL,
    message     TEXT NOT NULL,
    entities    TEXT NOT NULL,             -- JSON array of {type, id}.
    suggested_fix TEXT,                    -- JSON, optional.
    created_at  TEXT NOT NULL
);

CREATE INDEX idx_warnings_event ON warnings(event_id);
```

## Notes on the schema

### JSON blobs vs. relational
- Used JSON blobs for: `role_types` (list of strings), `availability` (list of windows), `tagged_race_ids` (list of IDs), event `settings`.
- Used relational tables for: assignments, trips, stops (because we query by them and need indexes).
- Rationale: keep the schema lean where the cardinality is small and queries are by parent entity only.

### Soft delete
- Only volunteers have an `archived` flag. Other entities are hard-deleted.
- A volunteer with assignments cannot be deleted without a confirmation that handles the orphans (see [`02-spec.md`](./02-spec.md)).

### Time storage
- All times stored as ISO 8601 strings in the event's local timezone. No UTC conversion (we don't cross zones).
- SQLite has no native datetime type; strings sort lexicographically when ISO-formatted.

### Identifiers
- `INTEGER PRIMARY KEY` autoincrement for all entities.
- These IDs are stable but not portable across event archives (archive import generates new IDs).
- For warning de-duplication, the warning `ID` is a content hash, not an autoincrement.

### Migrations
- One SQL file per migration, applied in order by golang-migrate or a hand-rolled migrator.
- App runs migrations on startup, backing up the DB first.

## Index strategy

Indexes listed inline above. Summary of what we index:
- All foreign keys (event_id, vs_id, volunteer_id) on tables we query frequently.
- `missions(day)` for day-filtered views.
- Travel-time matrix has a composite primary key that covers all access patterns.

We don't pre-index everything; add indexes when queries are measurably slow.

## Data invariants the application enforces

- Every volunteer with `default_vs_id` set must reference a VS in the same event.
- Every trip's driver must be a volunteer in the same event with `can_drive = 1`.
- Every trip stop's VS must be in the same event as the trip.
- Trip stops are 0-indexed sequentially per trip.
- A volunteer cannot board the same trip twice (UNIQUE constraint).
- A race-VS entry is unique per (race, VS) pair.

Some of these are enforced at the SQL level (UNIQUE, FK constraints) and some at the application level (cross-event consistency, since SQLite's FKs don't span events).

## Things explicitly NOT in the schema

- No users table — single-user app.
- No history / audit log — snapshot model.
- No race-day mutation log — what you see is the current state.
- No notifications, no email queue — coordinator distributes PDFs out-of-band.
