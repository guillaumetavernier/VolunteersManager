# Milestone 11 — Épreuves (Trials)

## Goal

Races currently model a single start time, two paces (front/tail), and a single concatenated GPX polyline. This does not handle multi-stage events (day = trail → MTB → run-and-bike). M11 adds **trials** (FR: épreuves): ordered segments within a race, each with its own start time, paces, and an optional GPX file. Chrono is implicit-dwell at PBs between trials; front/tail of trial N+1 are bounded below by the previous trial's arrival times (planning envelope).

## Prerequisites

- Milestones 00–10 complete.

## Scope (in)

- New `trials` table with `(race_id, sequence, name, start_time, front_pace, tail_pace)`.
- New `race_trial_vs` table replacing per-PB timing columns on `race_vs_entries`.
- Migration `0009_trials.sql`: add tables, move timing to `race_trial_vs`, drop columns from `races` and `race_vs_entries`, move `day` from `gpx_files` to `trial_id`.
- New `internal/features/trial/` package: CRUD + GPX endpoints + reorder.
- Rewritten `internal/features/race/recompute.go` that walks trials in sequence, propagates timing envelope, projects each PB per trial, upserts `race_trial_vs`.
- Trimmed `internal/features/racevs/` model: entry shrinks to `(id, race_id, vs_id, sequence)`; timing-specific endpoints removed; list endpoint returns aggregated `(earliest_first_in, latest_last_in)` across all `race_trial_vs` rows for that PB.
- Frontend: new `web/src/features/trial/` with `api.ts`, `hooks.ts`, `TrialCard.tsx`.
- Restructured `RaceDetail.tsx`: RaceForm (name + color only) → TrialsSection (dnd-kit cards) → VSListSection (read-only timing summary).
- Timeline: `useTimelineData.ts` rebuilt from per-trial timing; `TimelineView.tsx` adds a `race-trial-badge` row (12 px strip) above each race's front/tail pair.
- Granular explicit `RecomputeRace` calls from every mutation handler; no DB triggers.
- FR-only UI strings ("Épreuve" / "Épreuves").
- Comprehensive tests: `internal/features/trial/handlers_test.go`, extended `recompute_test.go`, `positions.test.ts` dwell case, `e2e/trials.spec.ts`.

## Scope (out)

- Per-discipline icons / colors on trials.
- Per-PB `min_dwell_s`.
- Per-trial polyline rendering on the map (one continuous polyline per race remains).
- Backfill of existing data.
- Multi-GPX per trial (cardinality stays 0..1).

## Implementation steps

1. Write `docs/milestones/11-trials.md` (this file). Update `docs/milestones/README.md`. Update `.harness/STATE.md`.
2. Write `internal/store/migrations/0009_trials.sql`.
3. Implement `internal/features/trial/` (model.go, store.go, handlers.go, handlers_test.go).
4. Update `internal/features/race/model.go`, `store.go`, `handlers.go`, `handlers_test.go`: drop `start_time`/`front_pace`/`tail_pace` from races; move GPX endpoints from race-scoped to trial-scoped. Update `recompute.go` for multi-trial logic.
5. Update `internal/features/racevs/model.go`, `store.go`, `handlers.go`: trim `Entry` to `(id, race_id, vs_id, sequence)`; remove timing PATCH/clear endpoints; add aggregated timing read on list.
6. Wire trial handler into `internal/server/server.go`.
7. Implement `web/src/features/trial/api.ts`, `hooks.ts`, `TrialCard.tsx`.
8. Restructure `web/src/features/race/RaceDetail.tsx`.
9. Rebuild `web/src/features/timeline/useTimelineData.ts` for per-trial timing.
10. Add `race-trial-badge` row to `web/src/features/timeline/TimelineView.tsx`.
11. Write/update tests: `recompute_test.go` multi-trial cases; `positions.test.ts` dwell case; `e2e/trials.spec.ts`.
12. Run harness; commit.

## Data model deltas

See `internal/store/migrations/0009_trials.sql`.

New tables: `trials`, `race_trial_vs`.

Dropped columns: `races.start_time`, `races.front_pace`, `races.tail_pace`, `race_vs_entries.auto_first_in`, `race_vs_entries.auto_last_in`, `race_vs_entries.manual_first_in`, `race_vs_entries.manual_last_in`, `gpx_files.day`.

Added column: `gpx_files.trial_id INTEGER REFERENCES trials(id) ON DELETE SET NULL`.

## API surface

New endpoints:

- `GET    /api/races/{id}/trials`
- `POST   /api/races/{id}/trials`
- `PATCH  /api/trials/{id}`
- `DELETE /api/trials/{id}`
- `PUT    /api/races/{id}/trials/reorder`
- `POST   /api/trials/{id}/gpx`
- `DELETE /api/trials/{trialId}/gpx/{gpxId}`
- `PUT    /api/race_trial_vs/{id}`

Removed endpoints:

- `POST /api/races/{id}/gpx` (replaced by trial-scoped)
- `DELETE /api/races/{raceId}/gpx/{gpxId}` (replaced by trial-scoped)
- `PATCH /api/races/{id}/vs/{vsId}` (timing now lives in race_trial_vs)
- `DELETE /api/races/{id}/vs/{vsId}/manual` (no longer needed)

Changed endpoints:

- `GET /api/races/{id}/vs` now returns `(id, race_id, vs_id, sequence, earliest_first_in, latest_last_in)`.

## Frontend surface

- `web/src/features/trial/api.ts` — Trial CRUD + GPX + race_trial_vs PUT.
- `web/src/features/trial/hooks.ts` — React Query hooks for trials.
- `web/src/features/trial/TrialCard.tsx` — dnd-kit-sortable card with inline form + GPX + PB chips.
- `web/src/features/race/RaceDetail.tsx` — restructured: RaceForm (name + color) → TrialsSection → VSListSection.
- `web/src/features/race/api.ts` — Race type drops `front_pace`/`tail_pace`/`start_time`; RaceVSEntry gains `earliest_first_in`/`latest_last_in`.
- `web/src/features/timeline/useTimelineData.ts` — rebuilt from `race_trial_vs` data.
- `web/src/features/timeline/TimelineView.tsx` — new `race-trial-badge` row kind.

## Tests

- `internal/features/trial/handlers_test.go` — CRUD, reorder, GPX upload bound to trial, `race_trial_vs` PUT.
- `internal/features/race/recompute_test.go` — multi-trial projection, envelope propagation, `manual_include`/`manual_exclude`, no-GPX trial.
- `web/src/features/timeline/__tests__/positions.test.ts` — dwell-at-PB between trials.
- `web/e2e/trials.spec.ts` — create race → add 2 trials → upload GPX into each → set start_times → assert badge strip + per-trial PB chips.

## Risks

- **SQLite DROP COLUMN.** `DROP COLUMN` requires SQLite 3.35+. The bundled `modernc.org/sqlite` ships a recent enough version; if a CI runner ships an older system SQLite (unlikely given `CGO_ENABLED=0` usage), the rename-and-rebuild dance is the fallback.
- **Timeline bandwidth.** The timeline now needs `N_races × N_trials` extra queries for per-trial VS timing. Cache aggressively; add a combined endpoint if latency proves problematic in a later pass.
- **Recompute correctness.** The envelope propagation (previous trial's last-PB timing bounds next trial's start) is new domain logic with no existing tests. Cover every boundary condition before shipping.

## Acceptance criteria

- [ ] `GET /api/races/{id}/trials` returns an ordered list of trials with name/sequence/start_time/front_pace/tail_pace.
- [ ] `POST /api/races/{id}/trials` creates a trial; `PATCH /api/trials/{id}` updates it; `DELETE /api/trials/{id}` removes it and its `race_trial_vs` rows (cascade).
- [ ] `PUT /api/races/{id}/trials/reorder` reorders trials and triggers `RecomputeRace`.
- [ ] `POST /api/trials/{id}/gpx` uploads a GPX file bound to a trial (not a race); `DELETE /api/trials/{trialId}/gpx/{gpxId}` removes it; both trigger `RecomputeRace`.
- [ ] `GET /api/races/{id}/vs` returns entries with `earliest_first_in` / `latest_last_in` aggregated across all `race_trial_vs` rows for each PB.
- [ ] `PUT /api/race_trial_vs/{id}` accepts `{source, manual_first_in, manual_last_in}` and persists the row; does **not** trigger full recompute.
- [ ] `RecomputeRace` correctly walks trials in sequence order, propagates the timing envelope across trial boundaries, projects each PB per-trial GPX within the 50 m threshold, upserts `race_trial_vs`, and skips `manual_exclude` rows.
- [ ] `internal/features/race/model.go` contains no `FrontPace`, `TailPace`, or `StartTime` fields.
- [ ] `internal/features/racevs/model.go` contains no `AutoFirstIn`, `AutoLastIn`, `ManualFirstIn`, `ManualLastIn` fields.
- [ ] Frontend `RaceForm` shows only name + color inputs.
- [ ] Frontend `TrialsSection` renders trial cards with drag-to-reorder; each card shows name / start_time / front_pace / tail_pace / GPX attachment + expandable PB chips with three-state toggle.
- [ ] Frontend `VSListSection` shows a read-only aggregated timing summary (earliest_first_in / latest_last_in) per PB.
- [ ] Timeline badge strip (`race-trial-badge` row) renders a colored chip per trial spanning its `[startMs, endMs]` range.
- [ ] Dwell-at-PB between trials appears as a gap in front/tail bars (existing `< 2 px` skip handles it).
- [ ] `go test ./...` green; `pnpm test` green.
- [ ] `./scripts/harness/check.sh` green.

## References

- [Brief in task prompt] — locked design decisions 1–16 govern every implementation choice.
- [`./README.md`](./README.md) "Locked decisions" — global rules.
