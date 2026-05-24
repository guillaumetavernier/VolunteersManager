# HANDOFF — Milestone 12: Timeline diagnostic overlay + resizable gantt

> Drop this file path into a fresh Claude Code session and you have everything you need to start work: this doc + the milestone file + the existing harness.

## Goal

Turn the M07/M11 timeline from a passive Gantt into a **diagnostic surface**: warnings from the M05 constraint engine appear directly on mission and trip-leg bars; clicking a bar opens the relevant editor; selecting a bar cross-highlights on the map (filling the M06 trip-polyline gap as a side effect). The gantt also becomes a **resizable + vertically-scrollable** strip with a `Tout / Jn` day-window control, so the map can breathe.

Full spec: [`docs/milestones/12-timeline-diagnostic.md`](docs/milestones/12-timeline-diagnostic.md). Read it end-to-end before touching code — it has implementation steps, acceptance criteria, and explicit scope cuts.

## Current Progress

- ✅ Planning complete. Decisions resolved through grilling on 2026-05-24.
- ✅ Milestone file written: `docs/milestones/12-timeline-diagnostic.md`.
- ✅ Index updated: `docs/milestones/README.md` lists M12.
- ✅ `.harness/STATE.md`: current milestone is now `12-timeline-diagnostic`, ⚪ not_started, with the unticked acceptance-criteria block in place.
- ⛔ No code written yet. No tests written. No commits made for this milestone.

Verify the planning is consistent: run `./scripts/harness/check.sh`. It must be green before starting implementation.

## What Worked (planning decisions worth preserving)

These were locked during the grilling session — don't re-litigate them without good reason:

- **Diagnostic overlay is the focus.** Entity-filter ("show me only Marie", "only PB-3") was a stated need but explicitly **deferred** to keep this milestone shipping.
- **Bars are the only warning surface.** No cursor-time chip list, no warnings sidebar. Bar borders + hover tooltips do all the work.
- **Border encoding by severity** (red `error` > amber `warn` > blue `info`). 2 px, drawn inside the bar's geometry. `understaffed`/`overstaffed` are **already** encoded in the bar's fill color — don't double-encode.
- **Per-leg precision for trip warnings.** `capacity_exceeded` only the affected leg; `board_without_alight`/`alight_before_board` the legs involving the referenced stops; `driver_double_book`/`passenger_double_book` every leg of the trip.
- **Stranded = edge triangles, no diagonal connector.** Diagonals across rows become spaghetti at scale.
- **Non-time-anchored warnings (`unassigned`, `missing_phone_with_assignments`) don't appear on the timeline.** They live in `/problemes` only.
- **Trip polylines on the map are gated on `trip-leg` selection**, not always-on. This is how M06's "draw a polyline between stops" finally happens — selection is the trigger.
- **Resizable gantt: drag handle + double-click collapse.** Persist height in `localStorage`. Defaults to 40 % of viewport, clamped to `[80 px, 70vh]`. Day-jump uses a `Tout / J1 / Jn` **segmented control** (replacing the existing `Jour` `<select>`), not a separate "zoom" toggle.
- **Keyboard: `space` toggles play; `←/→` step 15 min.** Focus guard against inputs is non-negotiable.
- **Hit-test = row-index short-circuit + linear scan.** No spatial index needed; ~300 bars total.
- **Tooltip = single absolutely-positioned `<div>`** in `TimelineView`'s container. Flip horizontally near the right edge. No Floating UI dependency.
- **Selection becomes a discriminated union** (`race-seg | mission | trip-leg | null`). Refactor every existing consumer of `useTimelineSelection.selected`.

## What Didn't Work (rejected alternatives — don't revive)

- **Showing all 30 trip polylines all the time.** Visually too noisy. Selection-only is the rule.
- **Adding a per-volunteer row group.** Explodes row count; defeats the gantt's compactness.
- **Computing warnings client-side.** They already exist server-side via `GET /api/warnings` (M05); just plumb them through `useTimelineData`.
- **Continuous wheel/pinch zoom.** Touches `timeBounds` math in too many places; out of scope for this milestone. Discrete `Tout / Jn` only.
- **Tooltip drawn inside the canvas.** No text wrap, no a11y, no clickable content. Use a DOM tooltip.
- **Diagonal connector lines for `stranded`.** Crosses rows; becomes spaghetti at scale.
- **Reverse staffing fill → border-only.** Bigger refactor than the milestone justifies; the existing fill works.

## Next Steps (suggested order)

1. **Sanity pass**: read [`docs/milestones/12-timeline-diagnostic.md`](docs/milestones/12-timeline-diagnostic.md) end-to-end. Run `./scripts/harness/check.sh`; confirm green.
2. **Worktree**: `git worktree add .claude/worktrees/12-timeline-diagnostic` (per repo conventions in CLAUDE.md).
3. **`warningLookup.ts`** (new, pure function) + Vitest table-driven test over all 16 warning kinds. Smallest unit; lands the data shape.
4. **`useTimelineData.ts`**: plumb `useWarnings()` in; expose the two lookup maps. No UI change yet — verify in dev tools.
5. **`useTimelineSelection.ts`**: migrate to the discriminated union. Grep every consumer; fix call sites.
6. **`useTimelineWindow.ts`** (new) + **`useGanttHeight.ts`** (new) with Vitest unit tests. These are the small-but-foundational state stores; landing them first lets later UI work just consume them.
7. **`TimelineView.tsx`**:
   - Add `height` / `scrollY` props + sticky-header redraw + clip rect.
   - Add severity-border draw + `stranded` edge triangles.
   - Add hit-test + DOM tooltip + bar-click router (mission/trip-leg routes).
8. **`TimelineMap.tsx`**: add `mission`-selection VS pulse + assigned-volunteer rings; add `trip-leg`-selection polyline layer + from/to VS pulse.
9. **`TimelineControls.tsx`**: replace `Jour` `<select>` with the segmented `Tout / Jn`; wire `space` and `←/→` with focus guards.
10. **`MapWorkspace.tsx`** (specifically `ChronologieWorkspace`): wire the resizable container — drag handle, double-click collapse, scrollable wrapper.
11. **`scripts/bench_timeline.mjs`**: re-run; confirm the new border-draw + tooltip costs still keep p99 under 16 ms/frame.
12. **Playwright**: write `e2e/timeline-diagnostic.spec.ts` covering each acceptance criterion.
13. **Tick acceptance criteria in `.harness/STATE.md`** as they pass. Don't batch.
14. **PR**: cite M12, link the criteria, use the repo's PR template.

## Useful entry points

- Constraint engine warnings (server): `internal/domain/constraints/` and `GET /api/warnings`.
- Warning types (client): `web/src/features/warnings/api.ts` — 16 `WarningKind`s + `EntityRef`.
- Existing localized kind labels: `web/src/features/warnings/IssuesPanel.tsx` (`KIND_LABEL`).
- Current timeline files (all under `web/src/features/timeline/`):
  - `useTimelineData.ts` — data hook to extend.
  - `useTimelineCursor.ts` — cursor + play state (don't touch logic, just consume).
  - `useTimelineSelection.ts` — selection store to migrate to the union.
  - `TimelineView.tsx` — canvas Gantt; biggest changes live here.
  - `TimelineMap.tsx` — MapLibre layer management; add polyline + pulse.
  - `TimelineControls.tsx` — sidebar control strip; segmented control + keyboard.
- Mount point: `web/src/components/shell/MapWorkspace.tsx::ChronologieWorkspace` — where the resizable container will replace the current `<div className="border-t ...">`.

## Hard rules to obey (from CLAUDE.md)

- Frontend-only milestone — **no DB migrations, no new endpoints, no Go changes**.
- FR-only strings; use the existing `KIND_LABEL` map for warning labels.
- No comments unless the *why* is non-obvious. No re-exports for the sake of it.
- Every handler / store query / component covered by tests. Playwright e2e on critical flows.
- Worktrees for non-trivial work.
- `./scripts/harness/check.sh` green before commit; green before PR.
