CREATE TABLE travel_times (
    from_vs_id  INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
    to_vs_id    INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
    mode        TEXT NOT NULL,
    seconds     INTEGER NOT NULL,
    source      TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (from_vs_id, to_vs_id, mode)
);

CREATE TABLE trips (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    day         INTEGER NOT NULL,
    driver_id   INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE RESTRICT,
    car_id      INTEGER NOT NULL REFERENCES cars(id) ON DELETE RESTRICT,
    mode        TEXT NOT NULL DEFAULT 'drive',
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_trips_day    ON trips(day);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_car    ON trips(car_id);

CREATE TABLE trip_stops (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id         INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    sequence        INTEGER NOT NULL,
    vs_id           INTEGER NOT NULL REFERENCES vs(id) ON DELETE RESTRICT,
    time            TEXT NOT NULL,
    leg_time_source TEXT NOT NULL DEFAULT 'auto',
    UNIQUE(trip_id, sequence)
);
CREATE INDEX idx_trip_stops_trip ON trip_stops(trip_id);
CREATE INDEX idx_trip_stops_vs   ON trip_stops(vs_id);

CREATE TABLE trip_stop_passengers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_stop_id  INTEGER NOT NULL REFERENCES trip_stops(id) ON DELETE CASCADE,
    volunteer_id  INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
    action        TEXT NOT NULL,
    UNIQUE(trip_stop_id, volunteer_id, action)
);
CREATE INDEX idx_tsp_volunteer ON trip_stop_passengers(volunteer_id);
