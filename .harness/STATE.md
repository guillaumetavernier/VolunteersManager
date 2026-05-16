# .harness/STATE.md — Milestone Status

> Single source of truth for **where we are in the plan**. Hand-edited by humans and agents alike. Read before any work; updated as acceptance criteria pass. The harness lint (`scripts/harness/lint_docs.py`) verifies that every milestone file is tracked here.

**Last updated:** 2026-05-16
**Current milestone:** none in progress. M00–M02 completed; next to start: **[03-volunteers-cars-csv](../docs/milestones/03-volunteers-cars-csv.md)**.

## Status legend

- 🟢 **completed** — every acceptance criterion passes locally and in CI
- 🟡 **in_progress** — code under active development; some criteria pass
- ⚪ **not_started** — no code yet
- 🟠 **blocked** — see "Blockers" below

## Milestone table

| #  | Slug                          | Status         | Notes |
|----|-------------------------------|----------------|-------|
| 00 | 00-scaffolding                | 🟢 completed   | All five CI checks green on PR #1. |
| 01 | 01-event-vs-map               | 🟢 completed   | All M01 flows covered by Playwright e2e; offline-tiles render needs a real .pmtiles in prod. |
| 02 | 02-races-gpx                  | 🟢 completed   | All M02 flows covered by Playwright e2e (wizard, VS, race, polyline color). |
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

- [x] Fresh `event.db` → first request returns the wizard. (e2e/0-wizard.spec.ts)
- [x] Wizard submission writes the event row + kicks off tile download. (e2e/0-wizard.spec.ts asserts event row + non-idle download status)
- [x] Once tiles are in place, the map renders fully offline. _Byte-range tile handler + pmtiles protocol registration covered by Go tests; MapLibre style points at `pmtiles:///tiles/<region>.pmtiles`. Confirmed end-to-end against a real `.pmtiles` is a deploy-time check; the mechanical wiring is now exercised in e2e via the styledata fallback path._
- [x] Click empty map → VS create panel; submit → marker appears. (e2e/vs.spec.ts)
- [x] Drag marker → coords update in DB. (e2e/vs.spec.ts drags the marker, polls API until coords change)
- [x] Photo upload writes a content-hashed file; the panel shows the image. (Go table-driven test; multipart now works end-to-end after the apiFetch Content-Type fix)
- [x] `go test ./...` and `pnpm test` green; Playwright e2e green. (3 specs, 3 passes)

### 02-races-gpx

- [x] Create a race, set color + paces + start_time. (e2e/race.spec.ts fills the form + saves; Go handler tests cover the API)
- [x] Upload a GPX (multi-segment, with elevation, ~2000 points). (e2e uploads via the UI file input; parse_test covers multi-segment flattening)
- [x] Add 4 VS to the race's ordered list; auto-first-in/last-in populate. (PUT /api/races/{id}/vs triggers recompute; e2e adds a VS and polls until auto_first_in is set)
- [x] Override one VS's first-in; it persists across recomputes. (e2e enters a manual time in the datetime input, then patches the race pace; manual_first_in stays set)
- [x] Map shows the GPX polyline in the race color. (e2e checks `map.getLayer("race-line-<id>")` exists and `line-color` matches `#ff0000`)
- [x] Move a VS on the map → projection + auto times recompute automatically. (VS PATCH lat/lon fires `RecomputeForVS`; e2e patches coords and polls until projected_dist_m differs)
- [x] `go test ./...` and `pnpm test` green; Playwright e2e green. (8 Go packages, 7 Vitest files / 24 tests, 3 Playwright specs all pass)

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
