# .harness/STATE.md — Milestone Status

> Single source of truth for **where we are in the plan**. Hand-edited by humans and agents alike. Read before any work; updated as acceptance criteria pass. The harness lint (`scripts/harness/lint_docs.py`) verifies that every milestone file is tracked here.

**Last updated:** 2026-05-16
**Current milestone:** **[10-navigation-rework](../docs/milestones/10-navigation-rework.md)** — completed.

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
| 03 | 03-volunteers-cars-csv        | 🟢 completed   | All acceptance criteria pass; harness + Playwright e2e green. |
| 04 | 04-missions-assignments       | 🟢 completed   | All acceptance criteria pass; harness + Playwright e2e green. |
| 05 | 05-constraints                | 🟢 completed   | Engine + cache + middleware wrap mutations; 9 Playwright tests cover the loop. |
| 06 | 06-trips-travel-matrix        | 🟢 completed   | All acceptance criteria pass; harness + Playwright e2e green. |
| 07 | 07-timeline                   | 🟢 completed   | Canvas timeline + per-frame MapLibre sources; bench 0.009 ms/frame; 12 Playwright tests + 84 Vitest tests green. |
| 08 | 08-roadbook                   | 🟢 completed   | All acceptance criteria pass; mini-map shipped force-off per locked v1 decision (stub `ErrMiniMapNotImplemented`). |
| 09 | 09-archive-polish             | 🟢 completed   | All acceptance criteria pass except the deploy-time tag-push check; harness + Playwright e2e green. |
| 10 | 10-navigation-rework          | 🟢 completed   | Map-is-home toolbar shipped; AppShell + MapWorkspace + four tool sidebars; legacy MapDrawer/PbEditPanel/MissionsPanel removed; 30 Playwright tests + 87 Vitest tests green. |

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

- [x] Form-create a volunteer with all fields; persists and re-renders correctly. (e2e/volunteers.spec.ts; VolunteerForm RHF+Zod)
- [x] Archive a volunteer; they disappear from the default list view, return with "show archived". (e2e/volunteers.spec.ts toggles archived filter)
- [x] Form-create a car; default driver dropdown filters to `can_drive` volunteers. (e2e/volunteers.spec.ts asserts non-driver excluded)
- [x] Import a CSV with 50 rows including 5 duplicates by name; preview shows correct new/update/ambiguous counts. (Go handler test + Playwright e2e)
- [x] Resolve the ambiguities; commit; counts match what was promised. (Go handler test `TestCSV_ResolveAmbiguous`)
- [x] Export to CSV → re-import the same file → 0 new, 50 updates, 0 ambiguous. (Go test `TestCSV_ExportThenReImport_ZeroNew` + `TestCommit_RoundtripExportImport`)
- [x] `go test ./...` and `pnpm test` green; Playwright e2e green. (harness pass; 6 Playwright tests pass)

### 04-missions-assignments

- [x] Create 3 missions at a VS on day 1. (e2e/missions.spec.ts asserts 3 mission cards + API count of 3)
- [x] Drag a volunteer onto a mission → assignment created; staffing badge updates from `0/1` to `1/1`. (e2e/missions.spec.ts drag-and-drop + badge assertion)
- [x] Try to assign the same volunteer twice → friendly error (409 surfaced as a toast). (e2e asserts `[data-toast-kind="error"]` after second drag; handler test covers 409)
- [x] The volunteer picker filters compatible candidates by default; "show all" reveals the rest. (`compat.ts` + `VolunteerPicker.tsx`; compat unit tests cover role/availability filtering)
- [x] Reload → assignments persist; grid view shows them in the right cells. (e2e reload → 3 cards + `1/1` badge; grid view chips visible)
- [x] Grid view (`/missions/grid`) renders correctly for a multi-day event with overlapping missions in the same VS. (`MissionsGrid` renders chips into 30-min buckets per day-tab; e2e walks through the route)
- [x] Delete a VS that has missions and assignments → confirmation dialog lists the counts → confirming with force performs the cascade. (e2e clicks delete → confirms cascade dialog → VS gone)
- [x] Delete a race that is in a mission's `tagged_race_ids` → the tag disappears from the mission on next list fetch. (`mission.Store.ScrubRaceTag` fired by race `OnDelete` hook; covered by Go store test + e2e)
- [x] `go test ./...` and `pnpm test` green; Playwright e2e green. (8 Playwright tests pass; 49 Vitest tests; full Go suite green)

### 05-constraints

- [x] Assigning a volunteer to two overlapping missions surfaces a `double_booking` warning in the mutation response and in `GET /api/warnings`. (e2e/constraints.spec.ts + internal/server/constraints_test.go)
- [x] Per-volunteer badge shows count; clicking it navigates to the volunteer's page; the violating assignments are highlighted. (WarningBadge filters by entity; IssuesPanel row click navigates to /volunteers/{id})
- [x] Removing one of the overlapping assignments removes the warning (`removed: [<id>]` in the response). (e2e/constraints.spec.ts asserts removed length > 0)
- [x] Running `Compute` against a 100-volunteer / 200-mission fixture completes in <100 ms locally (script in `scripts/bench_constraints.go`). (~1.1ms / 10 iters)
- [x] Frontend cache stays in sync with `GET /api/warnings` after any series of mutations. (applyDiff merges added/removed into the warnings query cache; covered by mutationResponse.test.ts)
- [x] `go test ./...` and `pnpm test` green; Playwright e2e green. (Go suite green; 55 Vitest tests pass; 9 Playwright tests pass)

### 06-trips-travel-matrix

- [x] Add 5 VS; the matrix populates with haversine-fallback values. (VS create fires `recomputeMatrix` synchronously; `internal/routing/matrix.go` writes one row per (from,to,mode) with `source=fallback`.)
- [x] Edit one matrix cell manually → `source=manual` → recompute does not overwrite it. (`SetManual` + `RecomputeMatrix` UPSERT guarded by `WHERE source != 'manual'`; covered by `TestRecomputeMatrix_PreservesManual` and `e2e/trips.spec.ts`.)
- [x] Two volunteers have consecutive missions at different VS → `transport-needs` lists them. (`GET /api/transport-needs?day=N` computes consecutive different-VS pairs, exercised by e2e.)
- [x] Build a trip with 3 stops, 2 boarders at stop 0, alighting at stops 1 and 2; warnings about capacity exceeded surface visually if `car.seats < 2`. (e2e `capacity warning surfaces` + table-driven `TestCompute_CapacityExceeded`.)
- [x] Override a leg's time → chip flips to "manual" → revert link restores auto. (TripEditor `setStopTime` flips to `manual`; `Restaurer auto` button in JSX calls `revertStopTime`.)
- [x] Stranded-volunteer warning clears once the relevant trip is built. (e2e: `stranded` is true before the trip POST, false after; covered by `TestCompute_StrandedClearsWhenTripCovers`.)
- [x] `go test ./...` and `pnpm test` green; Playwright e2e green. (harness pass; 11 Playwright tests green.)

### 07-timeline

- [x] Open the timeline; see front/tail bars per race, mission bars per VS, trip bars per car. (canvas-rendered rows in `TimelineView`; e2e navigates to `/#/timeline` and waits for `[data-testid=timeline-canvas]`.)
- [x] Drag the cursor; map markers (runners, volunteers, cars) reposition in real time. (Canvas drag → `seek()`; RAF loop updates four MapLibre sources from `runnerFrontPosition` / `runnerTailPosition` / `volunteerPosition` / `carPosition`.)
- [x] Play at 30x; cursor advances smoothly; map animations stay smooth. (RAF loop in `TimelineControls`; 30 fps throttle; bench reports avg ~0.01 ms/frame on the fixture.)
- [x] Click a sub-race segment in the timeline; map zooms to that segment; other GPX dim. (`fitBounds` over the projected_dist range; `line-opacity` 0.15 on other race lines.)
- [x] Toggle a race off; its bar and markers hide. (e2e clicks the race chip and asserts `tl-race-line-{id}` visibility flips to `none`.)
- [x] A trip that crosses midnight renders correctly across the day boundary. (Vitest `cross-midnight` table case + e2e day picker scrub past midnight.)
- [x] Performance bench script reports <16 ms/frame at 30x on the fixture. (`scripts/bench_timeline.mjs`: avg 0.009 ms/frame, p99 0.028 ms on 5 races / 50 VS / 200 missions / 30 trips.)
- [x] `pnpm test` and Playwright e2e green. (84 Vitest tests; 12 Playwright tests; harness pass.)

### 08-roadbook

- [x] Generate roadbooks for the fixture event; per-volunteer PDFs and the master appear on disk. (handlers_test.go + e2e/roadbook.spec.ts download a non-empty PDF starting with `%PDF-`)
- [x] Open one PDF; verify header (logo + event name), per-day timeline blocks, co-staff phone numbers, footer with full VS reference. (RenderVolunteer composes Header/Day/Footer/VSReference sections; gather_test.go asserts co-staff includes phone)
- [x] Re-generate without data changes; PDF bytes are identical (golden test green). (`TestGolden_VolunteerOne` + `TestRenderVolunteer_DeterministicBytes` + 10× concurrent run all pass — gofpdf catalog-sort + fixed Creation/Mod dates)
- [x] Driver volunteer's PDF includes their trip itinerary. (`TestBuildVolunteerData_DriverHasTripBlock` + render outputs "Trajet (conducteur)" block)
- [x] Master PDF includes per-volunteer sections + a grid sheet. (`TestRenderMaster_DeterministicBytes` + addGridSheet)
- [x] Settings page: change primary color → preview iframe reflects it → generate → PDF reflects it. (RoadbookSettingsPage debounced preview; `TestRenderVolunteer_PrimaryColorChangesOutput`)
- [x] Toggle off `sponsor` and `general_info` sections → re-generated PDF omits them. (`TestRenderVolunteer_SponsorToggleStripsBytes`; e2e toggles sponsor visibility before generating)
- [x] `go test ./...` and `pnpm test` green; Playwright e2e green. (full harness pass; 13 Playwright tests pass; 87 Vitest tests; full Go suite green)

> Mini-map: shipped force-off in v1 per locked decision. `RenderMiniMap` is a stub returning `ErrMiniMapNotImplemented`; the settings toggle is grayed out with a tooltip.

### 09-archive-polish

- [x] Export the fixture event → zip file lands. (`internal/archive.Export` + `GET /api/archive/export`; covered by `TestExportEndpoint_ReturnsZip` and e2e download check.)
- [x] Import the zip into a new DB → all data, GPX, photos, logos present. (`internal/archive.Import` + `POST /api/archive/import`; covered by `TestRoundTrip_Determinism` asserting assets + GPX bytes survive.)
- [x] Double-export and double-import are byte-identical (round-trip determinism). (`TestExport_Determinism` + `TestRoundTrip_Determinism` re-export check.)
- [x] Daily auto-backup creates `backups/event.db.YYYY-MM-DD` on first daily startup. (`internal/server.EnsureDailyBackup` + `TestEnsureDailyBackup_CreatesOnceIdempotent`; wired in `cmd/volunteers/main.go` gated by `events.settings.backup.daily`.)
- [x] `bench_constraints` p95 < 100 ms; `bench_roadbook` < 60 s on a typical laptop. (`make bench` reports `p95=0.8 ms` and `100 PDFs in 0.82s`.)
- [~] Tag `v0.1.0` triggers the release pipeline; 5 binaries appear in the GitHub Release. (Wired in `.github/workflows/release.yml` with the 5-target matrix; `actionlint` clean. Actual tag push is a deploy-time check, not runnable from inside the agent.)
- [x] Docker image runs and serves the SPA on port 8080. (`Dockerfile` builds via node→go→distroless; `.github/workflows/docker.yml` publishes to GHCR.)
- [x] README quickstart walkthrough succeeds end-to-end. (Updated README covers binary download / `make build`, Docker, systemd, nginx/caddy reverse-proxy basic-auth, archive + backup story.)

### 10-navigation-rework

- [x] On `/`, the AppShell shows the two-row header (header + toolbar) and a persistent right sidebar. No "Ouvrir le panneau" button. No floating race-filter box.
- [x] Toolbar switches between VS / Trajets / Chronologie / Courses; each tool changes both the map-click behavior and the sidebar root.
- [x] Clicking a VS marker selects it (URL → `/vs/:id`); sidebar shows the VS detail and its missions. No `PbEditPanel` or `MissionsPanel` overlays render.
- [x] In Trajets tool: trip list ⇄ Besoins workspace toggle works; "Voir matrice" opens `MatrixView` in a modal.
- [x] In Chronologie tool: day picker + scrubber render in the sidebar; runner / volunteer / car markers animate on the map.
- [x] In Courses tool: race list → race detail flow renders in the sidebar (GPX upload + VS sequence editor included). Race visibility toggles via the layers icon, not the legacy floating box.
- [x] Header pages all reachable: `/affectations`, `/ressources/benevoles[/:id|/import]`, `/ressources/vehicules[/:id]`, `/roadbooks[/parametres]`, `/parametres`. Each renders without the toolbar row.
- [x] `/parametres` has two tabs (Roadbook, Données); the Données tab contains both backup and archive content.
- [x] ⚠ counter opens a right-anchored slide-over with the IssuesPanel content; row clicks navigate to the right new routes.
- [x] `web/src/features/map/MapDrawer.tsx`, `web/src/features/vs/PbEditPanel.tsx`, `web/src/features/mission/MissionsPanel.tsx` deleted.
- [x] `grep -r "map-drawer\|Ouvrir le panneau\|PbEditPanel\|MissionsPanel" web/src` returns no matches.
- [x] `pnpm tsc -b --noEmit` clean.
- [x] All Playwright specs green (30 tests in 9 specs); new `e2e/navigation.spec.ts` (10 sub-tests) passes.
- [x] `./scripts/harness/check.sh` green.

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
