# Milestone 07 — Timeline

## Goal

A hand-rolled timeline view with a draggable time cursor and play/pause/speed controls. As the cursor moves: front- and last-runner markers animate along each race's GPX, volunteer markers position themselves at the right VS (or interpolated between trip stops), and car markers move along trip routes. The timeline doubles as a visual constraint check — coordinators eyeball whether VS are staffed when runners are there.

## Prerequisites

- M02 complete (GPX + race-VS timings).
- M04 complete (assignments).
- M06 complete (trips for car/volunteer position interpolation).

## Scope (in)

- Horizontal time axis spanning the event's full duration, with major (day) and minor (hour) gridlines.
- Layered rows: per-race front/tail bars, mission rows per VS, trip rows per car.
- Draggable cursor.
- Play / pause button.
- Speed control: 1x, 5x, 30x, 300x real-time.
- Race toggles, day toggles.
- Sub-race highlight on map when a leg is selected on the timeline.
- Map synchronization: at cursor time `t`, all dynamic markers (runners, volunteers, cars) update at ~30 fps.
- Position calculation done client-side from cached event data.

## Scope (out)

- Server-side position computation (everything client-side).
- Drag-to-edit on the timeline (timeline is read/visualize only).
- Volunteer rows beyond their position on the map (no per-volunteer timeline lane — too noisy at scale).
- Roadbook generation (M08).

## Implementation steps

1. **No new tables.** This milestone is pure frontend on top of existing data.
2. **`web/src/features/timeline/`** package:
   - `useTimelineData()` — aggregates GPX point arrays, race-VS timings, missions, trips into a single denormalized client cache once per event. Updates incrementally on TanStack Query cache changes.
   - `useTimelineCursor()` — Zustand store: `{cursorTime, playing, speed}` + `play()`, `pause()`, `setSpeed(n)`, `seek(t)`, `tick(dtMs)`.
   - `<TimelineView>` — the bar component. Canvas-rendered for the rows (faster than SVG with 200 missions × 5 days). Custom hit-testing for the cursor drag.
   - `<TimelineControls>` — play button + speed dropdown + day picker.
3. **Position calculation utilities** in `web/src/features/timeline/positions.ts`:
   - `runnerPosition(race, t)` — given race start, paces, and race-VS timings, interpolate front and tail along the GPX. Use the piecewise-linear function defined by `[(start, 0)] + [(vs.first_in or auto, vs.projected_dist) ...]`.
   - `volunteerPosition(volunteer, t)` — priority order:
     1. In an active mission? → mission.vs.
     2. Between board and alight on an active trip? → linear interp between adjacent stop VS along the trip leg's haversine line.
     3. Else → `default_vs`.
   - `carPosition(car, t)` — wherever the trip currently is, else "garage" (driver's default VS).
4. **Animation loop** — `requestAnimationFrame` driven; throttle to ~30 fps; deltas from `performance.now()`. When `speed=300x`, 1 real second advances the cursor by 5 minutes of event time.
5. **Map integration**:
   - Two MapLibre sources per race: `race-front` (point) and `race-tail` (point) — updated each frame.
   - One MapLibre source `volunteers` (collection of points), updated each frame.
   - One MapLibre source `cars` (collection of points), updated each frame.
   - Visibility controlled by timeline toggles.
6. **Sub-race highlight** — clicking a segment between two VS in the timeline's race row dims everything except that segment's GPX slice and the two VS markers, and zooms the map to the segment bounds.
7. **Performance discipline** — pre-bake the GPX into a flat `Float32Array` of `[lon, lat, cumDist, ...]` so per-frame interpolation is O(log N) via cumulative-distance binary search. Avoid per-frame allocations.
8. **Timeline `<canvas>` rendering**:
   - Off-screen canvas for static rows (mission/trip bars); re-rendered only on data change.
   - On-screen canvas composites the off-screen + the moving cursor.
   - Tooltip on hover (mission/trip details).

## Data model deltas

- None.

## API surface

- None new. Reuses `GET /api/races`, `GET /api/races/{id}/vs`, `GET /api/missions`, `GET /api/trips`, `GET /api/volunteers`, `GET /api/cars`.

## Frontend surface

- New tab at `/timeline` (or as a sliding panel above the map).
- Map gains four dynamic layers (front, tail, volunteers, cars) toggleable.

## Tests

- **Vitest on `positions.ts`** — table-driven cases: volunteer in mission, between stops, default; runner at race start, mid, end; cars during and between trips. Includes cross-midnight trips per [`../07-open-questions.md`](../07-open-questions.md) §12.
- **Vitest on `useTimelineCursor`** — play/pause/seek/speed transitions.
- **Canvas component** — visual regression test via Playwright screenshot diffing at fixed cursor times.
- **Performance microbench** — a script measures the frame budget on a fixture (5 races, 50 VS, 200 missions, 30 trips). Target: <16 ms per frame at 30x speed.
- Playwright e2e: "Open timeline → click play at 30x → cursor advances → markers move → click a sub-race → map zooms → click pause → cursor stops."

## Risks

- **Frame-budget regressions.** Adding any per-frame work (logging, expensive selectors) can tank performance. Lint rule: no `console.*` in `useFrame`-style callbacks; explicit profiling marker per render.
- **GPX interpolation accuracy.** The runner is parameterized by *time* but moves along *distance*. Use cumulative distance as the lookup key; binary search on it. Avoid linearly scanning the GPX.
- **Cross-midnight trips.** Make sure both the timeline rendering and `carPosition`/`volunteerPosition` handle a stop with `time` on day N+1. Test fixture required.

## Acceptance criteria

- [ ] Open the timeline; see front/tail bars per race, mission bars per VS, trip bars per car.
- [ ] Drag the cursor; map markers (runners, volunteers, cars) reposition in real time.
- [ ] Play at 30x; cursor advances smoothly; map animations stay smooth (no observable jank on a typical laptop).
- [ ] Click a sub-race segment in the timeline; map zooms to that segment; other GPX dim.
- [ ] Toggle a race off; its bar and markers hide.
- [ ] A trip that crosses midnight renders correctly across the day boundary.
- [ ] Performance bench script reports <16 ms/frame at 30x on the fixture.
- [ ] `pnpm test` and Playwright e2e green.

## References

- [`../02-spec.md`](../02-spec.md) §5.
- [`../04-design.md`](../04-design.md) §4 (GPX timeline) and §8 (sub-race derivation).
- [`../07-open-questions.md`](../07-open-questions.md) §12 (cross-midnight trip rendering).
