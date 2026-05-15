# Milestone 03 — Volunteers + Cars + CSV

## Goal

The coordinator can populate the volunteer roster (form-by-form or via CSV import) and the car fleet, and export the roster back to CSV. Phone numbers are normalized to E.164; CSV import handles French/Google-Sheets exports out of the box; ambiguous matches surface in a preview screen before commit.

## Prerequisites

- M01 complete (VS exist; `default_vs_id` references them).

## Scope (in)

- Volunteer CRUD with every spec'd field: first/last name, phone (E.164), email, emergency contact, general info, customizable message, role_types[], availability windows[], default_vs_id, can_drive, license_type, notes, archived flag.
- Car CRUD with name, seats, default_driver_id, notes.
- CSV import: upload → parse (UTF-8/BOM/comma/semicolon) → column-mapping UI → validation → preview (new / updated / ambiguous) → atomic commit.
- CSV export: same canonical schema; downloads as `volunteers.csv`.
- CSV template download (header row + one example row).
- Phone normalization using `nyaruka/phonenumbers` with the event's `country_code` as fallback.
- Soft-delete (archived flag) with "show archived" toggle on the list page.

## Scope (out)

- Drag-drop assignment to missions (M04).
- Excel (XLSX) import (out of v1 per [`../06-out-of-scope.md`](../06-out-of-scope.md)).
- Google Sheets API integration (out of v1).
- A separate "roles" table — `role_types` stays a free-text JSON list in v1; canonicalization happens at the UI level via autocomplete on previously-seen values.

## Implementation steps

1. **Migration `0004_volunteers_cars.sql`** — per [`../05-data-model.md`](../05-data-model.md) with `event_id` removed:
   ```sql
   CREATE TABLE volunteers (
       id                       INTEGER PRIMARY KEY AUTOINCREMENT,
       first_name               TEXT NOT NULL,
       last_name                TEXT NOT NULL,
       phone                    TEXT NOT NULL,
       email                    TEXT,
       emergency_contact_name   TEXT,
       emergency_contact_phone  TEXT,
       general_info             TEXT,
       customizable_message     TEXT,
       role_types               TEXT NOT NULL DEFAULT '[]',
       availability             TEXT NOT NULL DEFAULT '[]',
       default_vs_id            INTEGER REFERENCES vs(id) ON DELETE SET NULL,
       can_drive                INTEGER NOT NULL DEFAULT 0,
       license_type             TEXT,
       notes                    TEXT,
       archived                 INTEGER NOT NULL DEFAULT 0,
       created_at               TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
   );

   CREATE TABLE cars (
       id                INTEGER PRIMARY KEY AUTOINCREMENT,
       name              TEXT NOT NULL UNIQUE,
       seats             INTEGER NOT NULL,
       default_driver_id INTEGER REFERENCES volunteers(id) ON DELETE SET NULL,
       notes             TEXT,
       created_at        TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
   );

   -- Transient CSV-import sessions (cleaned on commit or after 1h TTL).
   CREATE TABLE csv_imports (
       id          TEXT PRIMARY KEY,            -- random session ID
       state       TEXT NOT NULL,               -- JSON: parsed rows, mapping, classifications, resolutions
       created_at  TEXT NOT NULL DEFAULT (datetime('now')),
       expires_at  TEXT NOT NULL                -- created_at + 1h; checked on every access
   );
   ```
2. **`internal/features/volunteer/`** — model + store + handlers + tests. CRUD endpoints plus a `?archived=true|false|all` query parameter on list.
3. **`internal/features/car/`** — same layout.
4. **`internal/csv/`**:
   - `parser.go` — detect BOM, detect delimiter (count commas vs semicolons in first 10 lines), parse rows.
   - `mapping.go` — heuristic column-name auto-mapping (`Téléphone`, `Telephone`, `Phone`, `Tel` → `phone`; matches normalize accent + lowercase).
   - `validator.go` — per-row validation (required fields, phone normalization via `phonenumbers`, optional fields normalized).
   - `upsert.go` — given a list of validated rows + an upsert key (`(first_name, last_name)` or `email`), classify each row as `new | update | ambiguous` against existing volunteers.
   - `commit.go` — transactional insert/update; all-or-nothing.
   - Heavy table-driven tests for every step.
5. **CSV import endpoints**:
   - `POST /api/csv/upload` — multipart; returns a session ID + detected columns + first 5 rows preview.
   - `POST /api/csv/{session}/mapping` — body: `{column_to_field: {...}, upsert_key: "name"|"email"}`. Returns `{new: N, update: N, ambiguous: [{row: N, candidates: [vol_ids]}]}`.
   - `POST /api/csv/{session}/resolve` — body: `{row: N, choice: "new"|"update_id_X"|"skip"}` for each ambiguous row.
   - `POST /api/csv/{session}/commit` — applies all upserts atomically.
   - Session state stored in `csv_imports` table (TTL 1 hour, cleaned on commit or expiry).
6. **CSV export endpoint**: `GET /api/volunteers/export.csv` — streams CSV with the canonical schema, one row per non-archived volunteer.
7. **Template endpoint**: `GET /api/volunteers/template.csv` — header row + one example row.
8. **Frontend `web/src/features/volunteer/`**:
   - `VolunteerList` page — table with search, filters (role, archived), bulk actions.
   - `VolunteerForm` — RHF + Zod; phone input with country picker; availability windows editor (repeatable day + start + end); role_types via tag input with autocomplete suggestions from existing values.
   - `CsvImportWizard` — multi-step (upload → map → preview → commit). Each step is its own component.
9. **Frontend `web/src/features/car/`** — list + form. Simpler.
10. **Phone input** — small reusable component: country code picker (defaults to event's country_code) + national number; submits as E.164.

## Data model deltas

- `volunteers`, `cars`, and a transient `csv_imports` table (sessions).

## API surface

- Volunteer CRUD: `GET /api/volunteers`, `POST`, `GET /api/volunteers/{id}`, `PATCH`, `DELETE` (archives by default — soft delete via `archived = 1`). `DELETE /api/volunteers/{id}?hard=true` performs a hard delete; if the volunteer has assignments, trips (as driver or passenger), or is a car's default driver, the endpoint returns **409 with a payload describing dependents** and the UI must show a cascade-confirmation dialog before retrying with `?hard=true&force=true`. This mirrors the VS-delete pattern set up in M01 and extended in M04/M06.
- Car CRUD: same shape on `/api/cars`.
- CSV: `POST /api/csv/upload`, `POST /api/csv/{session}/mapping`, `POST /api/csv/{session}/resolve`, `POST /api/csv/{session}/commit`, `GET /api/volunteers/export.csv`, `GET /api/volunteers/template.csv`.

## Frontend surface

- `/volunteers` list page.
- `/volunteers/import` wizard.
- `/volunteers/{id}` detail/edit.
- `/cars` list page.
- `/cars/{id}` detail/edit.

## Tests

- **CSV pipeline** is the heaviest-tested module: fixtures for Google Sheets exports (FR + EN headers, BOM, semicolon delimiter), malformed rows, edge-case phone numbers (Swiss visitors at a French race), ambiguous matches.
- Volunteer/Car handler + store tests.
- Frontend component tests on the multi-step wizard.
- Playwright e2e: "import a 50-row French CSV → see preview → resolve 2 ambiguities → commit → list shows 50 volunteers."

## Risks

- **Free-text role_types.** Without a canonical roles table, typos proliferate ("Ravitaillement" vs "ravitaillement" vs "Ravito"). Mitigation: case-insensitive autocomplete from the union of all existing role_types. **Downstream cost:** typos here cascade into false `role_mismatch` warnings in M05 (a volunteer with `["Ravito"]` won't match a mission with `role_type = "Ravitaillement"`). M05's risk section flags this; the cheapest mitigation is autocomplete here.
- **Phone normalization edge cases.** Numbers without country prefix get the event default. Numbers with `+` are accepted as-is. Numbers that fail parsing show a row error in the preview rather than silently failing.

## Acceptance criteria

- [ ] Form-create a volunteer with all fields; persists and re-renders correctly.
- [ ] Archive a volunteer; they disappear from the default list view, return with "show archived".
- [ ] Form-create a car; default driver dropdown filters to `can_drive` volunteers.
- [ ] Import a CSV with 50 rows including 5 duplicates by name; preview shows correct new/update/ambiguous counts.
- [ ] Resolve the ambiguities; commit; counts match what was promised.
- [ ] Export to CSV → re-import the same file → 0 new, 50 updates, 0 ambiguous.
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green.

## References

- [`../02-spec.md`](../02-spec.md) §1, §2.4, §6.
- [`../04-design.md`](../04-design.md) §6 (CSV import).
- [`../05-data-model.md`](../05-data-model.md) "Volunteers", "Cars".
- [`../07-open-questions.md`](../07-open-questions.md) §6 (phone normalization edge cases), §11 (ambiguous upsert).
