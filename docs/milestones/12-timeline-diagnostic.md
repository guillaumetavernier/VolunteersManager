# Milestone 12 — Timeline diagnostic overlay + resizable gantt

## Goal

The timeline shipped in M07 (and extended in M11) renders the schedule as a Gantt with an animated map, but it stays passive: it shows *what is planned*, not *what is wrong*. The constraint engine from M05 produces 16 warning kinds, none of which are visible on the timeline. The gantt also takes its natural height and pushes the map into a corner.

M12 turns the timeline into a diagnostic surface:

- Mission and trip-leg bars get a severity-colored border when one or more warnings reference them.
- Hovering a bar shows the warnings; clicking opens the relevant editor in the sidebar.
- Selecting a mission or trip-leg cross-highlights on the map (VS pulse, assigned-volunteer ring, trip polyline). Trip polylines — a leftover from M06 scope — finally appear, gated on selection.
- The gantt becomes a resizable strip with a drag handle on its top border, scrollable vertically when row content overflows, and a `Tout / J1 / Jn` segmented control that constrains the time window to a single day.
- Two cheap keyboard shortcuts land: `space` toggles play, `←/→` step the cursor by 15 min.

The job-to-be-done is "spot scheduling conflicts at a glance, replay the day fluidly, drill into one entity." All three motivate this milestone; entity filtering is explicitly deferred.

## Prerequisites

- M05 complete (warning engine produces `Warning[]` via `GET /api/warnings`).
- M06 complete (trips + travel matrix; trip-leg bars exist on the gantt).
- M07 complete (timeline + map sync exist).
- M11 complete (trial badge strip rows; per-trial timing).

## Scope (in)

- `useTimelineData` pulls in `useWarnings()` and exposes two new lookup maps:
  - `warningsByMission: Map<missionID, Warning[]>`
  - `warningsByTripLeg: Map<"tripID:legIdx", Warning[]>`
- Mission bars: 2px border, color = max severity over the bar's warnings (`error` red > `warn` amber > `info` blue). No border when no warnings.
- Trip-leg bars: same border rule, with per-leg precision:
  - `capacity_exceeded` → only the leg whose `trip_stop` is referenced.
  - `board_without_alight`, `alight_before_board` → legs involving the referenced stops.
  - `driver_double_book`, `passenger_double_book` → every leg of the trip.
- `stranded` warnings: a right-pointing triangle marker on the right edge of the *from* mission bar, and a left-pointing triangle on the left edge of the *to* mission bar. No diagonal connector across rows.
- Existing fill-color encoding for `understaffed` / `overstaffed` is **kept as-is**; no border is added on top (the fill already encodes the staffing state).
- Non-time-anchored warnings (`unassigned`, `missing_phone_with_assignments`) are **not** rendered on the timeline; they continue to live in `/problemes` only.
- Canvas hover: row-index short-circuit + linear scan over the bars in that row to find the bar under `(x,y)`. A single absolutely-positioned `<div role="tooltip">` rendered as a sibling of the canvas in `TimelineView`'s container shows the warning list (kind label + `message`) on hover. Tooltip flips horizontally when within 200 px of the right edge.
- Canvas click hit-tests bars first:
  - mission bar → navigate to mission editor in the VS sidebar (existing route).
  - trip-leg bar → navigate to trip editor in the Trajets sidebar (existing route).
  - race-front sub-segment → existing selection behavior (preserved).
  - anywhere else → existing seek-cursor behavior (preserved).
- `useTimelineSelection.selected` becomes a discriminated union:
  ```ts
  type Selection =
    | { kind: "race-seg"; raceID: number; fromVsID: number; toVsID: number }
    | { kind: "mission"; missionID: number }
    | { kind: "trip-leg"; tripID: number; legIndex: number }
    | null;
  ```
- Map echoes (in `TimelineMap`):
  - `mission` selection → pulse the mission's VS marker; yellow ring on the assigned volunteers' dots.
  - `trip-leg` selection → draw the full trip polyline (haversine straight lines, stop[0]→…→stop[n]); selected leg stroke 4 px, other legs 2 px at 50 % opacity; pulse from-VS and to-VS markers. This fills the M06 "trip polyline on hover/select" gap.
  - `race-seg` selection → unchanged.
- Resizable gantt:
  - 4 px drag handle on the gantt's top border, between the map area and the gantt. `cursor: row-resize` on hover.
  - Drag adjusts the gantt height; the map area absorbs the delta via the existing flexbox.
  - Double-click on the handle toggles collapsed (80 px, `TimelineControls` only) ↔ previous height.
  - Persisted in `localStorage` under key `timeline.heightPx` and `timeline.collapsed`.
  - Defaults on first load: 40 % of viewport height. Clamped to `[80 px, 70vh]`.
- Scrollable gantt:
  - When canvas content height > container height, gantt scrolls vertically inside its container.
  - Day-header strip stays "sticky": redrawn at the top of the visible area regardless of `scrollY`.
  - Cursor line drawing limited to visible row range (no draw outside the clip rect).
  - Hit-test reads `clientY − canvasTop + scrollY`.
- Cursor controls:
  - `space` toggles `useTimelineCursor.toggle()` (only when focus is not inside an input/select/textarea).
  - `←` / `→` step the cursor by 15 min, clamped to `[startMs, endMs]`. Same focus guard.
  - The `Jour` `<select>` in `TimelineControls` is replaced with a segmented control: `Tout | J1 | J2 | … | Jn`. `Tout` shows the full event window (today's behavior). `Jn` constrains `timeBounds` to `[dayStart, dayStart + 86_400_000]`. When `timeBounds` changes, if the cursor lies outside, auto-seek to the new `startMs`.
- `timeBounds` is now driven by a new piece of `useTimelineSelection` (or a new tiny store, `useTimelineWindow`): `{ kind: "all" } | { kind: "day"; dayIndex: number }`. `useTimelineData` reads it to compute the effective `startMs`/`endMs`.

## Scope (out)

- Entity-filter (volunteer / car / VS scoping). Deferred to a later milestone; the bar overlays make density less painful in the meantime.
- Moving-dot labels on the map (hover labels for volunteer / car / runner dots).
- A separate scrubber bar above the canvas, snap-to-event keybinds, scrub-time tooltip on canvas hover (warning tooltip is the only canvas tooltip).
- Continuous horizontal zoom (wheel / pinch); only the discrete `Tout / Jn` day-window switch is in scope.
- Always-on trip polylines on the map (selection-triggered only).
- Cursor-time warning aggregate (chip list, side panel, sidebar). Bars are the only warning surface.
- New row groupings (per-volunteer lane, transport-needs lane).
- Auto-scroll the gantt when the cursor exits the visible row range.
- Server-side changes: no migrations, no new endpoints, no model edits.

## Implementation steps

1. Write `docs/milestones/12-timeline-diagnostic.md` (this file). Update `docs/milestones/README.md` and `.harness/STATE.md`.
2. **`web/src/features/timeline/warningLookup.ts`** (new): pure function `buildWarningLookups(missions, trips, warnings) → { warningsByMission, warningsByTripLeg }`. Defensive against stale refs (skip warnings whose mission/trip is missing).
3. **`web/src/features/timeline/useTimelineData.ts`**: add `useWarnings()` query; expose `warningsByMission`, `warningsByTripLeg` via the memoized return.
4. **`web/src/features/timeline/useTimelineSelection.ts`**: change `selected` to the discriminated union; update `setSelected`; rename / split helpers where needed.
5. **`web/src/features/timeline/useTimelineWindow.ts`** (new): tiny Zustand store with `{ kind: "all" } | { kind: "day"; dayIndex }` + `setWindow(...)`.
6. **`web/src/features/timeline/useGanttHeight.ts`** (new): hook reading/writing `localStorage`, exposing `{ heightPx, setHeightPx, collapsed, toggleCollapsed }`. Listens to `resize` events; clamps `heightPx` to `[80, 0.7 * window.innerHeight]`.
7. **`web/src/features/timeline/TimelineView.tsx`**:
   - Accept `height` and `scrollY` props.
   - `drawStatic` clips drawing to `[0, height]`; offsets row `y` by `-scrollY`; redraws the day-header strip after the body draw to keep it sticky.
   - Cursor line drawn only between `HEADER_H` and `height`.
   - Add severity border to bars: compute `severity = max(warnings)` and stroke a 2 px rect inside the bar's geometry (color: red `#dc2626`, amber `#f59e0b`, blue `#2563eb`).
   - Add edge-triangle markers for `stranded` warnings on mission bars (left + right edges depending on role in the stranded pair).
   - Hit-test for mouse-move: track hovered bar; render a `<div>` tooltip via React state. Tooltip lists each warning's localized kind (use `IssuesPanel.KIND_LABEL`) and `message`. Tooltip flips horizontally near the right edge.
   - Click handler delegates to a router: `onClickBar({ kind: "mission" | "trip-leg" | "race-front" | ..., ... })`. Mission and trip-leg navigate via `navigate("/pb/{vsID}?mission={id}")` / `navigate("/trajets/{tripID}")` (reuse existing routes).
   - Update `selected`-driven render: highlight the selected bar.
8. **`web/src/features/timeline/TimelineMap.tsx`**:
   - On `mission` selection: pulse the VS marker (extra MapLibre layer with a growing circle bound to the VS coord; ring on assigned-volunteer dots).
   - On `trip-leg` selection: add `tl-trip-polyline-{tripID}` sources/layers; full trip polyline (other legs faint, selected leg bold). Pulse from-VS and to-VS markers.
   - Cleanup layers on selection change.
9. **`web/src/features/timeline/TimelineControls.tsx`**:
   - Replace the `Jour` `<select>` with a segmented control sourced from `useTimelineWindow`. Buttons: `Tout`, `J1`, …, `Jn`.
   - Bind `space` (toggle play) and `←`/`→` (cursor ±15 min) via a `useEffect` registering on `window`, guarded by `document.activeElement` not being an `INPUT|SELECT|TEXTAREA`.
10. **`web/src/components/shell/MapWorkspace.tsx`**:
    - Replace the static `<div className="border-t ..."> + <TimelineView>` with a new `ResizableTimelineContainer` (inline or extracted) holding: drag handle (4 px) + scrollable canvas wrapper. Wrap `TimelineView` with `height`, `scrollY` props; manage scroll via the wrapper's `onScroll`.
    - The top flex item (`map + sidebar`) remains `flex-1`; the gantt sits at the bottom with `height = useGanttHeight.heightPx` (or 80 px when collapsed).
11. **Tests**: see "Tests" section.
12. Run `./scripts/harness/check.sh`; tick acceptance criteria; commit.

## Data model deltas

None. M12 is purely frontend.

## API surface

None. M12 reuses `GET /api/warnings` (M05).

## Frontend surface

- `/` (map workspace) → resizable + scrollable gantt; warned bars; hover/click semantics; segmented day window.
- Selection-triggered trip polyline overlay on the chronologie map.

## Tests

- **Vitest `warningLookup.test.ts`** — table-driven over all 16 warning kinds: assert correct `Map` membership for synthetic warnings on a fixture of 5 missions + 2 trips × 3 legs. Stale-ref case: warning with `mission_id` not present in data → skipped.
- **Vitest `useGanttHeight.test.ts`** — persists/restores; clamps to viewport bounds; double-click toggles collapsed and restores.
- **Vitest `useTimelineWindow.test.ts`** — `Tout` / `J{n}` selection produces correct `timeBounds` over a 3-day event.
- **Vitest `TimelineView.draw.test.ts`** — render with a warned-mission fixture; assert via canvas mock or pixel snapshot that the border is drawn in the correct color. Same for `stranded` edge triangles.
- **Vitest `TimelineView.hittest.test.ts`** — given a synthetic `(rows, bars, rowOffsets)`, `hitTest(x, y, scrollY)` returns the right bar; scrolled case verified.
- **Vitest `TimelineView.keys.test.ts`** — `space` toggles play unless focus is in an input; `←/→` advances by 15 min and clamps.
- **Playwright `e2e/timeline-diagnostic.spec.ts`** (new):
  - Stranded scenario: two consecutive missions at different VS without a trip → both bars show the edge triangles; hover one bar → tooltip lists `Sans transport`.
  - Capacity-exceeded trip: build a 2-seat car trip with 3 boarders → only the affected leg has a red border; hover lists `Capacité dépassée`.
  - Click a mission bar → VS sidebar opens; map's VS marker pulses; assigned-volunteer dots get a ring.
  - Click a trip-leg → trip editor opens; trip polyline appears on the map; from/to VS markers pulse.
  - Press `space` → `[data-testid=timeline-toggle-play]` flips state.
  - Press `→` four times from a known cursor time → cursor advances by 60 min.
  - Click `J2` → gantt timeBounds become `[day2-start, day3-start]`; click `Tout` → restore.
  - Drag the resize handle up by 100 px → map area shrinks; reload → height persists.
  - Double-click handle → gantt collapses to 80 px; double-click → restore.
  - Add enough rows (≥ 20 VS) so the gantt overflows; scroll within the gantt → day header stays visible at the top.

## Risks

- **Stale-data race**: warnings may reference a deleted mission between fetches. `buildWarningLookups` skips refs whose target isn't in the data; tested explicitly.
- **Narrow bars**: a 2 px border on a 3 px-wide bar swallows the fill. Mitigation: bump the minimum bar width from 2 px to 6 px in `drawStatic`, or only draw the border when `bw ≥ 4`.
- **Hover perf**: linear scan with row-index short-circuit is fine for ~300 bars; re-run `scripts/bench_timeline.mjs` to confirm <16 ms/frame still holds with the new draw cost (border + tooltip).
- **Tooltip clipping**: at the right edge of the canvas, the tooltip must flip to `mouseX − tooltipW − 12`. Pure CSS, no Floating UI dependency.
- **Day-zoom + cursor**: when switching from `Tout` to `Jn`, the cursor may sit outside the new window. Auto-seek to the day's start.
- **Sticky header in canvas land**: implemented by re-drawing the header strip after the body draw with a clip rect at the top — not via CSS `position: sticky` (canvas can't do that). Order: body bars (offset by `-scrollY`) → header strip at `y=0`.
- **Resize during play**: the RAF loop lives in `TimelineControls` and only reads `useTimelineCursor` state; height/scroll changes do not affect it. Confirm in the e2e by toggling play, then resizing.
- **Keyboard shortcuts vs forms**: `space` and arrow keys are heavily used inside inputs. The focus guard (`document.activeElement` tag check) is non-negotiable.
- **Selection model migration**: every existing consumer of `useTimelineSelection.selected` (currently the `race-seg` flavor) must be updated to the union shape. Grep before the refactor; type errors are the safety net.

## Acceptance criteria

- [ ] A mission bar referenced by at least one `error`-severity warning renders with a 2 px red border. Same for `warn` (amber) and `info` (blue).
- [ ] A trip-leg bar referenced by `capacity_exceeded` for `trip_stop` *S* shows a red border on the single leg that includes stop *S* — no border on the trip's other legs.
- [ ] `driver_double_book` / `passenger_double_book` borders every leg of the trip.
- [ ] A `stranded` warning renders a right-edge triangle on the *from* mission bar and a left-edge triangle on the *to* mission bar.
- [ ] `understaffed` / `overstaffed` mission bars keep their amber/red fill; no border overlay is added.
- [ ] `unassigned` and `missing_phone_with_assignments` warnings produce no visual change on the timeline.
- [ ] Hovering a warned bar shows a tooltip listing each warning's localized kind label and `message`. Tooltip flips when near the right edge.
- [ ] Clicking a mission bar opens the mission editor in the sidebar; clicking a trip-leg opens the trip editor; clicking elsewhere seeks the cursor (existing behavior).
- [ ] Selecting a mission pulses the mission's VS marker and rings the assigned-volunteer dots on the map.
- [ ] Selecting a trip-leg draws the trip polyline (selected leg thicker) and pulses from-VS / to-VS markers.
- [ ] Dragging the handle on the gantt's top border resizes the gantt; the map absorbs the delta. Reload preserves the height.
- [ ] Double-clicking the handle collapses the gantt to 80 px and restores on the next double-click.
- [ ] When row content exceeds gantt height, the canvas scrolls vertically inside the container; the day-header strip stays at the top.
- [ ] `space` toggles play unless focus is inside an input/select/textarea.
- [ ] `←/→` step the cursor by 15 min, clamped to `[startMs, endMs]`, with the same focus guard.
- [ ] Segmented control `Tout / J1 / Jn` constrains `timeBounds` accordingly; cursor auto-seeks to the new window start when it falls outside.
- [ ] `pnpm test` green; Playwright `e2e/timeline-diagnostic.spec.ts` green.
- [ ] `./scripts/harness/check.sh` green.

## References

- [`../milestones/05-constraints.md`](./05-constraints.md) — warning engine + `GET /api/warnings`.
- [`../milestones/06-trips-travel-matrix.md`](./06-trips-travel-matrix.md) §8 — "Map integration" (selection-triggered trip polylines: gap filled here).
- [`../milestones/07-timeline.md`](./07-timeline.md) — canvas timeline + map sync foundation.
- [`../milestones/11-trials.md`](./11-trials.md) — badge-row precedent for the gantt.
- [`../04-design.md`](../04-design.md) §1, §4 — constraint engine surfaces, scrubber UI.
