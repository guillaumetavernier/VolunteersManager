# Milestone 05 — Constraint Engine

## Goal

A pure-function warning engine that, given the current event state, produces a stable, idempotent set of warnings. The engine runs server-side after every mutation; affected warnings are returned in the mutation response and cached. The frontend renders badges per affected entity, a global counter in the header, and a dedicated `/issues` panel with one-click navigation. Warnings **never block** any mutation — they are advisory only.

## Prerequisites

- M04 complete (assignments exist to check).
- M03 complete (volunteer availability/role data exists).

## Scope (in)

- `internal/domain/constraints` package as the engine's home.
- Warning kinds (assignment, mission, volunteer levels — trip-level lands in M06):
  - **Assignment**: `double_booking`, `role_mismatch`, `availability_violation`, `excessive_duty`, `no_break`.
  - **Mission**: `understaffed`, `overstaffed` (informational).
  - **Volunteer**: `unassigned` (informational), `missing_phone_with_assignments`.
- Pure function `Compute(state EventState) []Warning`.
- Stable warning ID via deterministic hash of `(kind + sorted entity IDs)`.
- Server-side recompute middleware that runs after every successful POST/PATCH/DELETE and writes to a `warnings` cache table.
- `GET /api/warnings` returning all current warnings.
- Mutation responses include `{data: ..., warnings: {added: [], removed: [], unchanged: count}}`.
- Per-entity badge component in the UI.
- Global header counter.
- `/issues` panel listing all warnings, grouped by kind, with click-to-navigate.

## Scope (out)

- Trip-related warnings (M06 adds them once the trip schema is in place).
- Client-side optimistic warning preview (out of v1 — too expensive to dual-implement).
- Suggested-fix actions (the `SuggestedFix` field is in the type but always `nil` in v1).
- Severity-driven UI changes beyond color (a future polish pass).

## Implementation steps

1. **Migration `0006_warnings.sql`**:
   ```sql
   CREATE TABLE warnings (
       id            TEXT PRIMARY KEY,         -- stable hash
       kind          TEXT NOT NULL,
       severity      TEXT NOT NULL,            -- info | warn | error
       message       TEXT NOT NULL,
       entities      TEXT NOT NULL,            -- JSON: [{type, id}]
       suggested_fix TEXT,                     -- JSON, nullable
       created_at    TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_warnings_kind ON warnings(kind);
   ```
2. **`internal/domain/constraints/types.go`** — the public types:
   ```go
   type Warning struct {
       ID           string
       Kind         WarningKind
       Severity     Severity     // info, warn, error
       Message      string       // already-translated (FR for v1)
       Entities     []EntityRef
       SuggestedFix *Fix         // nullable, unused in v1
   }
   type EntityRef struct { Type EntityType; ID int64 }
   type EventState struct {
       Volunteers      []Volunteer
       Missions        []Mission
       Assignments     []Assignment
       Settings        Settings   // duty thresholds, break thresholds
   }
   ```
3. **`internal/domain/constraints/engine.go`** — `Compute(state EventState) []Warning`. Runs each kind's checker in turn, concatenates, sorts by ID for determinism.
4. **Per-kind files** — one per warning kind, with table-driven tests:
   - `double_booking.go` — pairwise overlap on a volunteer's assignments.
   - `role_mismatch.go` — `volunteer.role_types ∩ mission.role_type == ∅`.
   - `availability_violation.go` — mission window not inside any availability window.
   - `excessive_duty.go` — total hours/day > threshold (default 10h, from settings).
   - `no_break.go` — assignments run >6h with no gap (configurable).
   - `understaffed.go`, `overstaffed.go` — per-mission count vs headcount.
   - `unassigned.go`, `missing_phone.go` — per-volunteer.
5. **Stable ID** — `id = sha256(kind || ":" || sortedEntityIDs).hex()[:16]`. Two identical situations → same ID; small diff → different ID. The frontend uses this to diff `added`/`removed`.
6. **`internal/server/middleware.go`** — `WithConstraintRecompute` wraps mutation handlers:
   - On 2xx response, load the full state, run `Compute`, write the new warning set to the `warnings` table (transactional `DELETE FROM warnings; INSERT ...`), compute diff against previous IDs, attach `{warnings: {added, removed}}` to the response.
   - On error, no recompute (state unchanged).
7. **State loader** — `internal/domain/constraints/state.go` reads everything the engine needs in a single transaction. Initially a naive "load all" approach; if it's slow at the 100-volunteer / 200-mission scale, profile and narrow.
8. **`GET /api/warnings`** — returns the current warning set.
9. **Frontend `web/src/features/warnings/`**:
   - `useWarnings()` query hook.
   - `<WarningBadge entity={...}>` — renders count + severity color based on warnings matching the entity.
   - `<GlobalIssueCounter>` — header chip.
   - `<IssuesPanel>` — full list grouped by kind; row click navigates to the relevant entity page.
   - Mutation hooks merge `added`/`removed` from responses into the cache for instant UI update without a refetch.
10. **Severity policy** (informational; not enforced):
    - `error`: double_booking, missing_phone_with_assignments.
    - `warn`: role_mismatch, availability_violation, excessive_duty, no_break, understaffed.
    - `info`: overstaffed, unassigned.

## Data model deltas

- `warnings` table (cache).

## API surface

- `GET /api/warnings`.
- All mutation responses now wrap the entity in `{data: ..., warnings: {added: [...], removed: [...]}}`.

## Frontend surface

- Header `GlobalIssueCounter`.
- `WarningBadge` integrated on every entity card/row.
- `/issues` route → `IssuesPanel`.

## Tests

- **Constraint engine** is THE most heavily-tested module: one test file per kind, table-driven with hand-built `EventState` fixtures and expected warning sets.
- **Determinism**: running `Compute` twice on the same state returns identical IDs in identical order.
- **Idempotency**: a no-op mutation produces `added=[], removed=[]`.
- **Server middleware**: an integration test where assigning a double-booked volunteer returns a `double_booking` warning in the mutation response.
- **Frontend**: `useWarnings` cache update on mutation response is testable via msw fixtures.
- Playwright e2e: "Double-assign a volunteer → see the badge appear → unassign → badge disappears."

## Risks

- **Performance under realistic load.** Spec targets <100 ms per recompute on 100 vols / 200 missions / 50 trips. Measure early with a fixture-generator script; if naïve full-recompute exceeds budget, profile before optimizing. Common wins: avoid loading photos/notes; precompute a volunteer→assignments index once per call.
- **Warning ID stability across schema changes.** If we rename a `WarningKind` enum value later, IDs change → frontend animations look wrong. Treat the enum strings as part of the public contract; never rename in place, only deprecate + add.
- **Localized messages.** Messages are FR for v1 (per locked decision). The engine produces the message; if i18n is added later, refactor to emit a message *key* + args instead.

## Acceptance criteria

- [ ] Assigning a volunteer to two overlapping missions surfaces a `double_booking` warning in the mutation response and in `GET /api/warnings`.
- [ ] Per-volunteer badge shows count; clicking it navigates to the volunteer's page; the violating assignments are highlighted.
- [ ] Removing one of the overlapping assignments removes the warning (`removed: [<id>]` in the response).
- [ ] Running `Compute` against a 100-volunteer / 200-mission fixture completes in <100 ms locally (script in `scripts/bench_constraints.go`).
- [ ] Frontend cache stays in sync with `GET /api/warnings` after any series of mutations.
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green.

## References

- [`../02-spec.md`](../02-spec.md) §3.
- [`../04-design.md`](../04-design.md) §1 (constraint engine).
- [`../05-data-model.md`](../05-data-model.md) "Warnings cache".
- [`../07-open-questions.md`](../07-open-questions.md) §1 (visual-only — confirmed in grilling).
