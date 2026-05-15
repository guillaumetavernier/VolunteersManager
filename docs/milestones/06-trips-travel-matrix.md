# Milestone 06 — Trips + Travel-Time Matrix

## Goal

The coordinator can build vehicle trips that ferry volunteers between VS, with multi-stop drop-off from a single origin (Shape A). Per-leg travel times auto-fill from a haversine fallback matrix (real routing comes later). Each leg's time and source (auto/manual/fallback) are visible and overridable. Trip-related warnings (capacity, stranded volunteer, boarding consistency) extend the constraint engine.

## Prerequisites

- M05 complete (constraint engine to extend).
- M04 complete (consecutive-mission transport needs are derived from assignments).
- M01 complete (VS exist for the matrix).

## Scope (in)

- `travel_times` matrix table for `(from_vs, to_vs, mode)` ∈ {drive, walk}.
- Auto-fill via haversine × configured speed; `source = fallback`.
- Manual override per cell or per trip leg; `source = manual`; survives recomputes.
- Schema field `source = auto` reserved for later ORS/OSRM (not used in v1).
- Recompute trigger on VS add/move/delete.
- Trip CRUD: `(driver, car, day, mode, ordered stops, notes)`.
- Trip stops with `(VS, time, board[], alight[])`.
- "Transport needs" list — derived view showing volunteers whose consecutive assignments are at different VS with no covering trip.
- Trip editor UI: pick driver, car, day → add stops, each with board/alight pickers → save.
- Trip-related warnings added to the constraint engine.
- Map visualization: when a trip is selected/hovered, draw a polyline between its stops.

## Scope (out)

- Real routing API (ORS/OSRM) — locked decision: defer.
- Milk-run / Shape B trips — explicitly out of v1.
- Multi-driver swap within a trip — out of v1.
- Trip optimization / auto-build — out of v1.

## Implementation steps

1. **Migration `0007_trips.sql`** — `event_id` dropped:
   ```sql
   CREATE TABLE travel_times (
       from_vs_id  INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
       to_vs_id    INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
       mode        TEXT NOT NULL,                     -- drive | walk
       seconds     INTEGER NOT NULL,
       source      TEXT NOT NULL,                     -- auto | manual | fallback
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

   CREATE TABLE trip_stops (
       id              INTEGER PRIMARY KEY AUTOINCREMENT,
       trip_id         INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
       sequence        INTEGER NOT NULL,
       vs_id           INTEGER NOT NULL REFERENCES vs(id) ON DELETE RESTRICT,
       time            TEXT NOT NULL,                  -- ISO datetime. Semantics: this is the
                                                       -- DEPARTURE time from this stop. For the
                                                       -- final stop, departure = arrival (no
                                                       -- further leg). For the first stop,
                                                       -- departure is when the vehicle leaves.
                                                       -- Arrival at stop[n] (n > 0) is derived
                                                       -- as stop[n].time MINUS the leg duration
                                                       -- (matrix or manual). Constraint checks
                                                       -- (stranded, insufficient_travel) read
                                                       -- this convention.
       leg_time_source TEXT NOT NULL DEFAULT 'auto',  -- auto | manual
       UNIQUE(trip_id, sequence)
   );

   CREATE TABLE trip_stop_passengers (
       id            INTEGER PRIMARY KEY AUTOINCREMENT,
       trip_stop_id  INTEGER NOT NULL REFERENCES trip_stops(id) ON DELETE CASCADE,
       volunteer_id  INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
       action        TEXT NOT NULL,                   -- board | alight
       UNIQUE(trip_stop_id, volunteer_id, action)
   );
   ```
2. **`internal/routing/`**:
   - `haversine.go` — `Distance(a, b LatLon) float64` in meters.
   - `matrix.go` — `RecomputeMatrix(vs []VS, settings Settings)` fills missing cells with `source=fallback`; preserves `source=manual` rows.
   - `client.go` — `Provider` interface; v1 ships exactly one implementation, `HaversineOnly`, hardcoded in the wiring (`internal/server/server.go` constructs `HaversineOnly{}` and passes it to `RecomputeMatrix`). ORS / OSRM clients are explicitly **not** built in v1 — the interface exists only so the later swap doesn't ripple. No registry, no env-driven selection, no constructor variation.
   - Default speeds from settings: drive 40 km/h, walk 5 km/h (configurable per [`../07-open-questions.md`](../07-open-questions.md) §5).
3. **Matrix recompute triggers**: VS create/update/delete fires a goroutine recompute. New cells `source=fallback`; existing `source=manual` rows untouched.
4. **`internal/features/trip/`**:
   - `model.go` — `Trip` with embedded `Stops []Stop`, `Stop` with embedded board/alight lists.
   - `store.go` — load/save a whole trip transactionally (delete-and-recreate stops on update for simplicity).
   - `handlers.go` — CRUD endpoints.
   - `GET /api/trips`, `POST /api/trips`, `GET /api/trips/{id}`, `PUT /api/trips/{id}` (whole trip replace), `DELETE /api/trips/{id}`.
   - `GET /api/transport-needs?day=N` — derived list of `{volunteer_id, from_vs, from_time, to_vs, to_time}` for consecutive-different-VS pairs not covered by any trip.
5. **Matrix endpoints**:
   - `GET /api/travel-times` — full matrix with sources.
   - `PATCH /api/travel-times` — body: `{from_vs, to_vs, mode, seconds}`. Sets `source=manual`.
   - `POST /api/travel-times/recompute` — force-recompute all `auto`/`fallback` cells.
6. **Trip-related constraint checks** in `internal/domain/constraints/`:
   - `stranded.go` — consecutive missions at different VS with no covering trip leg.
   - `insufficient_travel.go` — gap between consecutive missions < `travel_matrix(from, to) + buffer`.
   - `capacity.go` — per-leg passenger count > `car.seats`.
   - `driver_double_book.go` — driver assigned to a mission during the trip window.
   - `passenger_double_book.go` — volunteer on two simultaneous trips, or a trip + mission overlap.
   - `board_alight_consistency.go` — covers both directions of `docs/02-spec.md` §3.2 "boarding logic error": a volunteer who boards but never alights, **and** a volunteer who alights at stop M but boards at stop N > M (alight-before-board). One check, two failure modes; report distinct warning sub-kinds via the `Message` field if needed.
7. **Frontend `web/src/features/trip/`**:
   - `TripList` page — grouped by day.
   - `TripEditor` — the most complex screen in the app. Three-column layout:
     - Left: trip metadata (day, driver, car, mode, notes).
     - Middle: ordered stops, drag-reorder; each row has VS picker, time input with `auto`/`manual` chip + revert button, board/alight pickers (filtered to candidates: needing transport from this VS / currently on the vehicle).
     - Right: per-leg validation summary (capacity, passenger consistency, travel-time mismatch) shown inline as warning chips.
   - `TransportNeedsList` — `/transport-needs/{day}` — read-only list; clicking a row opens a new trip editor pre-populated.
8. **Map integration**:
   - On hover/select of a trip, draw a polyline from `stop[0].vs` through `stop[n].vs`.
   - On the timeline (M07) the trip animates a car marker along the polyline.
9. **Per-leg time auto-fill**:
   - When the coordinator picks `stop[n].vs`, default `stop[n].time = stop[n-1].time + matrix(stop[n-1].vs, stop[n].vs, trip.mode)`.
   - Editing the time switches `leg_time_source` to `manual` and shows a `Reset to auto` link.

## Data model deltas

- `travel_times`, `trips`, `trip_stops`, `trip_stop_passengers` tables.

## API surface

- Trips: full CRUD on `/api/trips`.
- Transport needs: `GET /api/transport-needs?day=N`.
- Matrix: `GET /api/travel-times`, `PATCH /api/travel-times`, `POST /api/travel-times/recompute`.

## Frontend surface

- `/trips` list page.
- `/trips/new` and `/trips/{id}` editor.
- `/transport-needs` list.
- `/travel-times` matrix view with per-cell source indicators.

## Tests

- **`internal/routing/`** — haversine accuracy; matrix recompute preserves manual overrides; configured-speed unit conversions.
- **`internal/features/trip/`** — full trip round-trip (create with stops + passengers, load, update, delete).
- **New constraint checks** — table-driven, one file per kind, with hand-built fixtures.
- **Frontend** — `TripEditor` interaction tests (add stop, change VS, override time, add boarder, validate inline warnings).
- Playwright e2e: "Two consecutive missions at different VS → transport need surfaces → build a 2-stop trip → warning clears."

## Risks

- **Per-leg time UX.** Coordinators may want to chain manual edits; ensure each edit only switches its own leg to manual, not subsequent ones. Subsequent legs still auto-fill from the previous leg's (potentially manual) time + matrix.
- **Trip on day boundary.** A trip's `day` integer = the day the trip **starts** (the date matching `stop[0].time`). Stops on subsequent calendar dates are valid and identified by their full datetime. A trip starting day 2 at 23:50 with `stop[1].time` on day 3 at 00:20 has `trips.day = 2`. The timeline (M07) reads stop datetimes, not `trips.day`, for rendering. This resolves [`../07-open-questions.md`](../07-open-questions.md) §12.
- **Cascade deletes via `ON DELETE RESTRICT`.** Deleting a volunteer who is a driver, or a car used by a trip, will be refused by SQLite. The API translates this into **409 with `{dependents: {trips: [<ids>]}}`** so the UI can show a cascade-confirmation dialog. The same pattern as M01's VS-delete and M03's volunteer-hard-delete.

## Acceptance criteria

- [ ] Add 5 VS; the matrix populates with haversine-fallback values.
- [ ] Edit one matrix cell manually → `source=manual` → recompute does not overwrite it.
- [ ] Two volunteers have consecutive missions at different VS → `transport-needs` lists them.
- [ ] Build a trip with 3 stops, 2 boarders at stop 0, alighting at stops 1 and 2; warnings about capacity exceeded surface visually if `car.seats < 2`.
- [ ] Override a leg's time → chip flips to "manual" → revert link restores auto.
- [ ] Stranded-volunteer warning clears once the relevant trip is built.
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green.

## References

- [`../02-spec.md`](../02-spec.md) §1 (Trip), §2.7, §3.2.
- [`../04-design.md`](../04-design.md) §2 (trip editor), §3 (travel-time matrix).
- [`../05-data-model.md`](../05-data-model.md) "Trips", "Travel-time matrix".
- [`../06-out-of-scope.md`](../06-out-of-scope.md) Trip section.
- [`../07-open-questions.md`](../07-open-questions.md) §5 (default speeds), §12 (day-boundary).
