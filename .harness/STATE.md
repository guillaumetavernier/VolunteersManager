# .harness/STATE.md — Milestone Status

> Single source of truth for **where we are in the plan**. Hand-edited by humans and agents alike. Read before any work; updated as acceptance criteria pass. The harness lint (`scripts/harness/lint_docs.py`) verifies that every milestone file is tracked here.

**Last updated:** 2026-05-15
**Current milestone:** none in progress. Next to start: **[00-scaffolding](../docs/milestones/00-scaffolding.md)**.

## Status legend

- 🟢 **completed** — every acceptance criterion passes locally and in CI
- 🟡 **in_progress** — code under active development; some criteria pass
- ⚪ **not_started** — no code yet
- 🟠 **blocked** — see "Blockers" below

## Milestone table

| #  | Slug                          | Status         | Notes |
|----|-------------------------------|----------------|-------|
| 00 | 00-scaffolding                | ⚪ not_started | First up. Sets repo layout + CI + dev loop. |
| 01 | 01-event-vs-map               | ⚪ not_started | |
| 02 | 02-races-gpx                  | ⚪ not_started | |
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
_Not yet started._

### 01-event-vs-map
_Not yet started._

### 02-races-gpx
_Not yet started._

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
- **Tile style JSON specifics** (M01). `protomaps-themes-base` is the chosen generator; lock the theme variant (`light`, `dark`, `white`, `black`, `grayscale`) before M01.

When an open question gets answered, move it into the relevant milestone file and remove it from here.

## Harness operating notes

- `scripts/harness/check.sh` is fast; run it before every commit.
- Adding a new locked decision? Add it to:
  1. `docs/milestones/README.md` "Locked decisions"
  2. `CLAUDE.md` "Hard rules"
  3. `scripts/harness/lint_docs.py` (`FORBIDDEN_IN_MILESTONES` or a new `check_*`)
- Adding a new milestone? Update both the table above **and** the milestone index in `docs/milestones/README.md`. The harness verifies that every milestone file is in both.
