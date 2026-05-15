# Milestone 01 — Event + VS + Map

## Goal

The coordinator can initialize the event (one-time wizard), see a map of their region, click on the map to add a named Volunteer Spot, drag a VS to reposition it, edit its metadata, and persist all of this between restarts. The map is fully offline using a Protomaps `.pmtiles` file served by the Go binary.

## Prerequisites

- M00 complete: dev loop running, migrations apply, embedded frontend serves.

## Scope (in)

- First-run wizard: name, date range, timezone, country code → writes the singleton `events` row.
- VS entity: full CRUD (create on map click, read list, update name/notes/coords/photo, delete with confirm).
- Photo upload (multipart) → `assets/vs/<content-hash>.<ext>`.
- Protomaps tile serving: byte-range `/tiles/*` handler.
- Tile downloader: first-run prompts for a region (e.g., "France", "Europe") and downloads the corresponding `.pmtiles` to `./tiles/`.
- `--offline-tiles=<path>` flag for prefetched setup.
- MapLibre GL JS direct integration (no React wrapper).
- VS markers + click-to-edit panel.
- Drag-to-move marker → PATCH endpoint.

## Scope (out)

- Race/GPX layer (M02).
- Mission overlays on the map (M04).
- Trip overlays (M06).
- Timeline-driven position markers (M07).

## Implementation steps

1. **Migration `0002_event_vs.sql`** — add `vs` table and update `events` defaults:
   ```sql
   CREATE TABLE vs (
       id            INTEGER PRIMARY KEY AUTOINCREMENT,
       name          TEXT NOT NULL,
       lat           REAL NOT NULL,
       lon           REAL NOT NULL,
       notes         TEXT,
       photo_path    TEXT,
       what3words    TEXT,
       created_at    TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
       UNIQUE(name)
   );
   ```
2. **`internal/features/event/`**:
   - `handlers.go` — `GET /api/event` (returns the singleton; 404 with `{code:"not_initialized"}` if the row doesn't exist) and `PUT /api/event` (upserts the row 1).
   - `store.go` — `Get()`, `Upsert(Event)`.
   - `model.go` — `type Event struct { ... }`.
   - `handlers_test.go`, `store_test.go`.
3. **`internal/features/vs/`** — same layout: `model.go`, `store.go`, `handlers.go`, tests. Endpoints:
   - `GET /api/vs` → list (sorted by name).
   - `POST /api/vs` → create. Body: `{name, lat, lon, notes?, what3words?}`. 409 on duplicate name.
   - `GET /api/vs/{id}` → detail.
   - `PATCH /api/vs/{id}` → partial update (any subset of fields).
   - `DELETE /api/vs/{id}` → delete. Cascades are not visible yet (M01 has no dependent rows), but the handler is **forward-extended in M04 and M06** to surface a confirmation prompt listing what will be deleted (missions, assignments) or refusing (trip_stops via `ON DELETE RESTRICT`). Keep the handler structure ready to refuse with a 409 + payload describing dependents.
   - `POST /api/vs/{id}/photo` → multipart upload; max 10 MB; JPEG/PNG only; stored at `assets/vs/<sha256>.<ext>`; updates `photo_path`.
4. **Tile serving** — `internal/server/tiles.go`:
   - `GET /tiles/{region}/{z}/{x}/{y}.mvt` is **not** what we serve; Protomaps reads the `.pmtiles` archive directly via byte-range requests. Instead serve `/tiles/{region}.pmtiles` with `Accept-Ranges: bytes` and proper `Range` handling. The path segment is the region slug (matches the wizard's region choice and the filename on disk).
   - Files live under `./tiles/<region>.pmtiles`. `--offline-tiles=<path>` overrides the directory.
5. **Tile downloader** — `internal/server/tile_download.go`:
   - On first run if `tiles/` is empty: server emits a startup log "Tiles directory empty; tile downloader available at /api/tiles/download".
   - `POST /api/tiles/download` with `{region: "europe-france"}` downloads from the Protomaps daily build URL pattern and saves to disk.
   - Status streaming via `GET /api/tiles/download/status` (server-sent events or simple polling).
   - Region whitelist (a small enum) — coordinator picks one from the wizard.
6. **Frontend `web/src/features/event/`**:
   - `useEvent()` TanStack Query hook hitting `/api/event`.
   - `EventInitWizard` component: shown when `useEvent` 404s. Form fields (name, start_date, end_date, timezone, country_code, region for tiles). Submit calls `PUT /api/event` and `POST /api/tiles/download`.
7. **Frontend `web/src/features/map/`**:
   - `MapView` component owns a MapLibre `Map` instance (created in `useEffect`, cleaned up on unmount). MapLibre needs a **style JSON** (not just a tile URL). Use [`protomaps-themes-base`](https://github.com/protomaps/basemaps) (npm package) to generate a style for the basemap, then register the [pmtiles protocol](https://github.com/protomaps/PMTiles/tree/main/js) and point its source URL at `pmtiles:///tiles/<region>.pmtiles`. The style is generated once at app boot from `protomaps-themes-base` and stays static.
   - VS markers as a GeoJSON source layer (one feature per VS). Click handler opens a side panel.
   - Click-on-blank-map → opens a "create VS" panel with the clicked lat/lon pre-filled.
   - Drag handler on VS markers → optimistic local update then PATCH; revert on error.
8. **Frontend `web/src/features/vs/`**:
   - `useVsList()`, `useCreateVs()`, `useUpdateVs()`, `useDeleteVs()` hooks (TanStack Query).
   - `VsEditPanel` — form with RHF + Zod; photo upload field; delete button with confirm dialog.
9. **shadcn/ui components vendored as needed**: `dialog`, `button`, `input`, `textarea`, `form`, `toast`.

## Data model deltas

- New `vs` table.
- Filesystem: `./tiles/<region>.pmtiles`, `./assets/vs/<sha256>.<ext>`.

## API surface

- `GET /api/event`, `PUT /api/event`.
- `GET /api/vs`, `POST /api/vs`, `GET /api/vs/{id}`, `PATCH /api/vs/{id}`, `DELETE /api/vs/{id}`, `POST /api/vs/{id}/photo`.
- `GET /tiles/{region}.pmtiles` (byte-range).
- `POST /api/tiles/download`, `GET /api/tiles/download/status`.

## Frontend surface

- `/` — if uninitialized, shows the wizard. Otherwise shows the map.
- `/vs` — list view of VS (table, sortable, click to open the panel).

## Tests

- **Backend**: table-driven tests for event upsert, VS CRUD (including duplicate-name 409), photo upload (size + MIME validation), byte-range correctness on tile handler.
- **Frontend**: Vitest on the API hooks (mock server with msw); component tests for the wizard and VS edit panel.
- **e2e (Playwright)**: "First run → wizard → tiles download → map renders → click to add VS → drag to move → reload → VS persists at new position."

## Risks

- **Protomaps tile region size.** Europe-wide `.pmtiles` is ~30 GB; France-only is ~1 GB; a single département is ~50 MB. The wizard should warn before downloading anything >1 GB.
- **Drag-to-move + concurrent updates.** Optimistic update may drift if PATCH fails. Show a toast on revert.

## Acceptance criteria

- [ ] Fresh `event.db` → first request returns the wizard.
- [ ] Wizard submission writes the event row + kicks off tile download.
- [ ] Once tiles are in place, the map renders fully offline (verify by killing internet).
- [ ] Click empty map → VS create panel; submit → marker appears.
- [ ] Drag marker → coords update in DB.
- [ ] Photo upload writes a content-hashed file; the panel shows the image.
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green.

## References

- [`../02-spec.md`](../02-spec.md) §1, §4.
- [`../05-data-model.md`](../05-data-model.md) "Volunteer Spots".
- [`../07-open-questions.md`](../07-open-questions.md) §9 (tile delivery).
