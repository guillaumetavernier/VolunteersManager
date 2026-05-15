# Milestone 02 — Races + GPX

## Goal

The coordinator can define one or more races inside the event, upload one or more GPX files per race (optionally tagged with a day), define the ordered list of VS along each race's route, and see the GPX polylines + per-VS auto-computed first-in/last-in times. Each race has its own color and pace settings; manual overrides on first-in/last-in are stored separately and take precedence.

## Prerequisites

- M01 complete: event row exists, VS CRUD works, map renders.

## Scope (in)

- Race CRUD with name, color, front_pace, tail_pace, start_time.
- GPX upload + parse (gpxgo) + Douglas-Peucker simplification when >5000 points.
- VS projection onto the GPX polyline (nearest-point-on-polyline) → per-VS cumulative distance along race.
- `race_vs_entries` ordered list with `auto_first_in`, `auto_last_in`, `manual_first_in`, `manual_last_in`.
- Auto-recompute of first-in/last-in when pace, start_time, or VS list changes.
- Map renders each race's GPX as a colored polyline (toggleable).
- Per-race detail page: ordered VS list with drag-to-reorder.

## Scope (out)

- Sub-race highlighting on the map (M07 timeline brings this).
- Runner-animation markers (M07).
- Wave starts / relays / per-checkpoint cutoffs (out of v1 entirely; see [`../06-out-of-scope.md`](../06-out-of-scope.md)).

## Implementation steps

1. **Migration `0003_races.sql`** — tables per [`../05-data-model.md`](../05-data-model.md) with the `event_id` column dropped (single-event-per-file):
   ```sql
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
       points           TEXT NOT NULL,         -- JSON: [{lat, lon, dist_m}, ...]
       total_distance_m REAL NOT NULL,
       created_at       TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE race_vs_entries (
       id              INTEGER PRIMARY KEY AUTOINCREMENT,
       race_id         INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
       vs_id           INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
       sequence        INTEGER NOT NULL,
       projected_dist_m REAL,                  -- nearest-point cumulative distance
       auto_first_in   TEXT,
       auto_last_in    TEXT,
       manual_first_in TEXT,
       manual_last_in  TEXT,
       UNIQUE(race_id, vs_id),
       UNIQUE(race_id, sequence)
   );
   ```
2. **`internal/gpx/`**:
   - `parse.go` — `Parse(r io.Reader) (Track, error)` returns `[]Point{Lat, Lon, CumDistM}` using gpxgo + haversine.
   - `simplify.go` — Douglas-Peucker, tolerance 5 m, applied when raw points > 5000.
   - `project.go` — `NearestOnTrack(track []Point, lat, lon float64) (idx int, dist float64, cumDistM float64)`.
   - Heavy table-driven tests including known reference tracks (small fixtures committed under `internal/gpx/testdata/`).
3. **`internal/features/race/`** — CRUD, plus `POST /api/races/{id}/gpx` (multipart upload) and `POST /api/races/{id}/recompute` (recomputes projections + auto times).
4. **`internal/features/race_vs/`** — manage the ordered list:
   - `GET /api/races/{id}/vs` — ordered list with both projected dist and time fields.
   - `PUT /api/races/{id}/vs` — **replaces the whole ordered list**. Body: `[{vs_id, sequence}]`. Used by the frontend on drag-reorder (`useUpdateRaceVsOrder`) and on add/remove of an entry. Triggers auto-recompute.
   - `PATCH /api/races/{id}/vs/{vs_id}` — **sets per-entry `manual_first_in` / `manual_last_in` overrides only**. Used by the frontend on inline-edit of those two fields (`useOverrideRaceVsTimes`). Does **not** change ordering.
5. **Auto-recompute logic** (units: paces are in km/h, distance in metres, so convert with `* 1000.0 / 3600.0` to m/s):
   - Each VS's projected distance = `NearestOnTrack(merged_gpx_points, vs.lat, vs.lon).cumDistM`.
   - `auto_first_in = start_time + projected_dist_m / (front_pace * 1000.0 / 3600.0)` — front-runner (fastest) pace gives the **earliest** arrival.
   - `auto_last_in  = start_time + projected_dist_m / (tail_pace  * 1000.0 / 3600.0)` — tail-runner (slowest) pace gives the **latest** arrival.
   - Manual values, when non-null, take precedence in any consumer.
6. **Recompute triggers** — fired automatically on:
   - GPX upload to a race.
   - VS coordinate change (affects every race containing that VS).
   - Race pace or start_time change.
   - Race-VS list change.
7. **Frontend `web/src/features/race/`**:
   - `RaceList` page: table of races, color swatches, "Add race" button.
   - `RaceDetail` page: form for name/color/paces/start; GPX upload area (per day); ordered VS picker (dnd-kit drag-reorder), each row shows projected dist + auto times + override fields.
   - `useRaces()`, `useRace(id)`, `useUploadGpx(id)`, `useUpdateRaceVs(id)` hooks.
8. **Map integration**:
   - Add GPX polyline layers — one source per race, colored by race color.
   - Layer toggle UI in the map sidebar.
9. **GPX file storage** — under `./assets/gpx/<race_id>/<sha256>.gpx`. The parsed points live in the DB so re-parsing isn't needed at render time.

## Data model deltas

- `races`, `gpx_files`, `race_vs_entries` tables.
- Filesystem: `./assets/gpx/<race_id>/<sha256>.gpx`.

## API surface

- `GET /api/races`, `POST /api/races`, `GET /api/races/{id}`, `PATCH /api/races/{id}`, `DELETE /api/races/{id}`.
- `POST /api/races/{id}/gpx` (multipart, optional `?day=N`).
- `DELETE /api/races/{id}/gpx/{gpxId}`.
- `POST /api/races/{id}/recompute`.
- `GET /api/races/{id}/vs`, `PUT /api/races/{id}/vs`, `PATCH /api/races/{id}/vs/{vsId}`.

## Frontend surface

- `/races` list page.
- `/races/{id}` detail/edit page.
- Map "Races" toggle group in sidebar.

## Tests

- **`internal/gpx/`** is the heaviest-tested package this milestone: parse known fixtures, simplification preserves shape within tolerance, projection accuracy against hand-calculated reference points.
- Race + race-VS handler tests cover the full CRUD matrix and the recompute trigger.
- Frontend: component tests on the ordered-VS list (dnd-kit interactions), Vitest on time-calculation utility (so the UI doesn't trust server-only numbers blindly).
- Playwright e2e: "create race → upload GPX → add 3 VS in order → verify first-in/last-in times in the UI → override one → verify it sticks."

## Risks

- **GPX file diversity.** Real-world GPX files vary wildly (tracks vs routes, multiple track segments, missing elevation). The parser must be lenient: take all `trkpt` across all segments in order.
- **VS-to-GPX projection fidelity.** If a VS is far from the track (e.g., a parking lot 500m off), the nearest-point is still useful but the timing is approximate. Optionally surface the projection distance in the UI ("nearest track point is 480 m away").

## Acceptance criteria

- [ ] Create a race, set color + paces + start_time.
- [ ] Upload a GPX (multi-segment, with elevation, ~2000 points).
- [ ] Add 4 VS to the race's ordered list; auto-first-in/last-in populate.
- [ ] Override one VS's first-in; it persists across recomputes.
- [ ] Map shows the GPX polyline in the race color.
- [ ] Move a VS on the map → projection + auto times recompute automatically.
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green.

## References

- [`../02-spec.md`](../02-spec.md) §2.3, §4.
- [`../04-design.md`](../04-design.md) §4 (GPX timeline parsing, projection).
- [`../05-data-model.md`](../05-data-model.md) "Races", "GPX files", "Ordered VS list".
