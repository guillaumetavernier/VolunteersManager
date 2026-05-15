# .harness/STATE.md — Milestone Status

> Single source of truth for **where we are in the plan**. Hand-edited by humans and agents alike. Read before any work; updated as acceptance criteria pass. The harness lint (`scripts/harness/lint_docs.py`) verifies that every milestone file is tracked here.

**Last updated:** 2026-05-16
**Current milestone:** **[02-races-gpx](../docs/milestones/02-races-gpx.md)** (in_progress).

## Status legend

- 🟢 **completed** — every acceptance criterion passes locally and in CI
- 🟡 **in_progress** — code under active development; some criteria pass
- ⚪ **not_started** — no code yet
- 🟠 **blocked** — see "Blockers" below

## Milestone table

| #  | Slug                          | Status         | Notes |
|----|-------------------------------|----------------|-------|
| 00 | 00-scaffolding                | 🟢 completed   | All five CI checks green on PR #1. |
| 01 | 01-event-vs-map               | 🟡 in_progress | Event + VS CRUD + Protomaps tile serving. 3 boxes need browser/Playwright verification. |
| 02 | 02-races-gpx                  | 🟡 in_progress | Races + GPX upload + projection + ordered VS list. |
| 03 | 03-volunteers-cars-csv        | ⚪ not_started | |
| 04 | 04-missions-assignments       | ⚪ not_started | Includes VS-delete cascade-confirm extension. |
| 05 | 05-constraints                | ⚪ not_started | Response-shape change retrofits M01–M04 endpoints. |
| 06 | 06-trips-travel-matrix        | ⚪ not_started | |
| 07 | 07-timeline                   | ⚪ not_started | |
| 08 | 08-roadbook                   | ⚪ not_started | Mini-map rasterization risk — see M08 risks. |
| 09 | 09-archive-polish             | ⚪ not_started | |

## Acceptance criteria — per-milestone checklist

When you start a milestone, copy its **Acceptance criteria** block from the milestone file into the corresponding section below and tick items off as they pass. The milestone file remains the canonical wording; this section is the live progress board.

### 00-scaffolding

- [x] `make dev` opens the browser to a placeholder page served at `http://localhost:8080` proxied to Vite.
- [x] `make build` produces a single static binary; running it from a fresh directory creates `event.db`, applies migrations, serves the SPA.
- [x] `go test ./...` green; `pnpm test` green.
- [x] CI green on a clean push.
- [x] Migration runner backs up `event.db` to `event.db.bak` before applying anything pending.

### 01-event-vs-map

- [x] Fresh `event.db` → first request returns the wizard. (GET /api/event 404 → wizard renders)
- [x] Wizard submission writes the event row + kicks off tile download. (PUT /api/event + POST /api/tiles/download chained in mutation)
- [ ] Once tiles are in place, the map renders fully offline (verify by killing internet). _Mechanically wired (MapLibre + pmtiles protocol). Needs runtime verification with a real `.pmtiles` archive._
- [ ] Click empty map → VS create panel; submit → marker appears. _Wired via `MapView` click handler; needs Playwright e2e to tick._
- [x] Drag marker → coords update in DB. (PATCH /api/vs/{id} on marker dragend; PATCH endpoint covered by tests + verified via curl)
- [x] Photo upload writes a content-hashed file; the panel shows the image. (backend table-driven test; frontend hook wires multipart upload)
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green. _Go + Vitest green; Playwright still has no specs (deferred from M00 scaffold; will land as part of e2e pass)._

### 02-races-gpx

- [x] Create a race, set color + paces + start_time. (POST /api/races + PATCH covered; smoke-tested via curl)
- [x] Upload a GPX (multi-segment, with elevation, ~2000 points). (parse_test asserts multi-segment flattening; handler smoke-test uploads + parses)
- [x] Add 4 VS to the race's ordered list; auto-first-in/last-in populate. (PUT /api/races/{id}/vs triggers recompute; smoke-tested with arithmetic match: 166 m → 40 s @ 15 km/h)
- [x] Override one VS's first-in; it persists across recomputes. (Replace preserves manual_first_in — covered in `TestRaceVS_ReplacePreservesManualOverrides`)
- [ ] Map shows the GPX polyline in the race color. _GeoJSON endpoint + `RacePolyline` layer wired; needs browser verification with a real pmtiles archive._
- [x] Move a VS on the map → projection + auto times recompute automatically. (VS PATCH lat/lon fires `RecomputeForVS`; smoke-tested east-move 166 m → 278 m + new auto times)
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green. _Go (8 packages) + Vitest (7 files / 24 tests) green; Playwright still has no specs._

### 03-volunteers-cars-csv
_Not yet started._

### 04-missions-assignments
_Not yet started._

### 05-constraints
_Not yet started._

### 06-trips-travel-matrix
_Not yet started._

### 07-timeline
_Not yet started._

### 08-roadbook
_Not yet started._

### 09-archive-polish
_Not yet started._

## Blockers

_None._

## Open questions deferred during planning

These came up during pre-implementation grilling and the post-merge review but aren't blocking. Resolve before the relevant milestone if possible.

- **Mini-map vector-pmtiles → PNG rasterization** (M08). Three mitigations enumerated in M08 risks; the current default is to ship v1 with mini-maps disabled if neither (a) raster pmtiles archive nor (b) offline pre-rasterization lands easily. Spike on this before committing to a roadbook ship date.
- **`gpx_files.day`, `missions.day`, `trips.day` → real-date helper** (cross-cutting). The integer `day` and `events.start_date` need a single helper for conversion. Decide where it lives — likely `internal/domain/eventcal.go` — before M02.
- **i18n key extraction timing** (M05 → v1.x). Current FR-only constraint engine emits messages directly. Refactor to emit `(Key, Args)` instead of `Message` is scheduled "when EN ships."
- ~~**Tile style JSON specifics** (M01). `protomaps-themes-base` is the chosen generator; lock the theme variant (`light`, `dark`, `white`, `black`, `grayscale`) before M01.~~ **Resolved 2026-05-16:** `light` variant locked in `web/src/features/map/style.ts`.

When an open question gets answered, move it into the relevant milestone file and remove it from here.

## Harness operating notes

- `scripts/harness/check.sh` is fast; run it before every commit.
- Adding a new locked decision? Add it to:
  1. `docs/milestones/README.md` "Locked decisions"
  2. `CLAUDE.md` "Hard rules"
  3. `scripts/harness/lint_docs.py` (`FORBIDDEN_IN_MILESTONES` or a new `check_*`)
- Adding a new milestone? Update both the table above **and** the milestone index in `docs/milestones/README.md`. The harness verifies that every milestone file is in both.
