# Milestone 04 — Missions + Assignments

## Goal

The coordinator can define missions at each VS (day, time window, role, headcount, optional race tags), assign volunteers to those missions via drag-and-drop or click, and see which missions are staffed vs. understaffed at a glance. Volunteers are filtered to role-compatible and non-overlapping candidates as a usability aid — but the coordinator can override.

## Prerequisites

- M03 complete (volunteers exist with role_types and availability).
- M02 complete (missions can be tagged with races).
- M01 complete (missions hang off a VS).

## Scope (in)

- Mission CRUD per VS, per day.
- Optional `tagged_race_ids` (filter-only; no scheduling impact).
- Assignment CRUD: `(volunteer_id, mission_id)` unique.
- Per-VS missions panel (opens from map marker click).
- Drag-and-drop assignment (dnd-kit) from a "needing assignment" pool to a mission slot.
- Click-to-assign as an alternative path.
- Role-match + non-overlap filter on the volunteer picker (visual filter; can be bypassed).
- Per-day grid view: VS × time, showing all missions.

## Scope (out)

- Warning badges and constraint engine (M05).
- Trip-aware "transport need" indicators (M06).
- Timeline visualization (M07).

## Implementation steps

1. **Migration `0005_missions_assignments.sql`** — `event_id` dropped:
   ```sql
   CREATE TABLE missions (
       id              INTEGER PRIMARY KEY AUTOINCREMENT,
       vs_id           INTEGER NOT NULL REFERENCES vs(id) ON DELETE CASCADE,
       day             INTEGER NOT NULL,
       start_time      TEXT NOT NULL,
       end_time        TEXT NOT NULL,
       role_type       TEXT NOT NULL,
       headcount       INTEGER NOT NULL DEFAULT 1,
       title           TEXT,
       description     TEXT,
       tagged_race_ids TEXT NOT NULL DEFAULT '[]',
       created_at      TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
   );
   CREATE INDEX idx_missions_vs  ON missions(vs_id);
   CREATE INDEX idx_missions_day ON missions(day);

   CREATE TABLE assignments (
       id           INTEGER PRIMARY KEY AUTOINCREMENT,
       mission_id   INTEGER NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
       volunteer_id INTEGER NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
       created_at   TEXT NOT NULL DEFAULT (datetime('now')),
       UNIQUE(mission_id, volunteer_id)
   );
   CREATE INDEX idx_assignments_volunteer ON assignments(volunteer_id);
   ```
2. **`internal/features/mission/`** — CRUD per VS:
   - `GET /api/vs/{vsId}/missions` — list for a VS (optional `?day=N`).
   - `POST /api/vs/{vsId}/missions` — create.
   - `GET /api/missions/{id}` — detail including assignment list and computed staffing status.
   - `PATCH /api/missions/{id}` — partial update.
   - `DELETE /api/missions/{id}`.
   - Optional global list: `GET /api/missions?day=N&role=X&race=Y`.
3. **`internal/features/assignment/`**:
   - `POST /api/assignments` — body: `{volunteer_id, mission_id}`. 409 on duplicate. Returns the created row.
   - `DELETE /api/assignments/{id}` or `DELETE /api/assignments?volunteer={vid}&mission={mid}`.
   - `GET /api/assignments?volunteer={vid}` — volunteer's schedule.
4. **Staffing computation** — derived, not stored: `len(assignments) vs headcount`. Surface in the mission API response as `{assigned: N, needed: N, status: under|exact|over}`. This is *not* the constraint engine yet; it's just a count.
5. **"Volunteer picker" filter logic** — implemented client-side for responsiveness; the server provides the raw `GET /api/volunteers` and the client filters by:
   - `volunteer.role_types ∩ mission.role_type ≠ ∅` (role match).
   - No existing assignment overlaps `[mission.start_time, mission.end_time]`.
   - Availability windows overlap the mission's time window.
   The UI shows compatible volunteers above a "show all" toggle.
6. **Frontend `web/src/features/mission/`**:
   - `MissionsPanel` — opens from a VS marker click. Tabbed by day. List of mission cards, "Add mission" button.
   - `MissionForm` — RHF + Zod. Time pickers, headcount stepper, role autocomplete, race tag multi-select.
   - `MissionCard` — shows time window, role, "X / Y staffed" badge, assignment chips.
7. **Frontend `web/src/features/assignment/`**:
   - `useAssignments(missionId)` hook.
   - `<AssignmentDropTarget>` and `<VolunteerDragItem>` components built on dnd-kit.
   - `VolunteerPicker` modal — search + filter pills (role, availability), click-to-assign.
8. **Grid view** — `/missions/grid` — wide table, rows = VS, columns = 30-min time buckets per day, cell content = mission chips. Used as the coordinator's command paper precursor.

## Data model deltas

- `missions`, `assignments` tables.

## API surface

- Missions: `GET/POST /api/vs/{vsId}/missions`, `GET/PATCH/DELETE /api/missions/{id}`, `GET /api/missions?day=&role=&race=`.
- Assignments: `POST /api/assignments`, `DELETE /api/assignments/{id}`, `GET /api/assignments?volunteer=&mission=`.

## Frontend surface

- VS marker click → `MissionsPanel` (side drawer).
- `/missions/grid` per-day grid.
- `/volunteers/{id}` detail page now shows the volunteer's assignment list.

## Tests

- Handler + store tests on mission CRUD and assignment CRUD (including UNIQUE conflict).
- Component tests on `MissionForm`, `VolunteerPicker`, drag-drop interaction (Vitest + Testing Library).
- Playwright e2e: "open VS → add mission for day 1 → drag a volunteer onto it → assignment persists → reload → still there."

## Risks

- **Time pickers across days.** Missions are bounded to a day, but for a multi-day event, the UI must show the right day's date. Store `start_time` and `end_time` as full ISO datetimes in event-local time.
- **Volunteer picker performance.** With 200 volunteers + 200 missions, client-side filtering must stay snappy. Use a memoized index; if it gets slow, push the filter server-side (`GET /api/volunteers?role=X&available_at=T`).
- **Drag-and-drop on touch devices.** dnd-kit supports it but the experience differs. Document that the coordinator app is laptop-first.

## Acceptance criteria

- [ ] Create 3 missions at a VS on day 1.
- [ ] Drag a volunteer onto a mission → assignment created; staffing badge updates from `0/1` to `1/1`.
- [ ] Try to assign the same volunteer twice → friendly error (409 surfaced as a toast).
- [ ] The volunteer picker filters compatible candidates by default; "show all" reveals the rest.
- [ ] Reload → assignments persist; grid view shows them in the right cells.
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green.

## References

- [`../02-spec.md`](../02-spec.md) §1, §2.5, §2.6.
- [`../05-data-model.md`](../05-data-model.md) "Missions", "Assignments".
