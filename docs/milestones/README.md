# Implementation Milestones

This directory breaks the v1 build into ten sequential milestones. Each milestone is a self-contained chunk: goal, scope, prerequisites, deliverables, ordered tasks, data-model deltas, API surface, frontend surface, tests, risks, and acceptance criteria.

The ordering reflects the layer-cake decision (foundation first, then geometry, then planning, then output). Each milestone is roughly 1–2 weeks of focused effort at hobby pace; no fixed calendar.

## Read in order

| # | Milestone | What lands |
|---|---|---|
| [00](./00-scaffolding.md) | **Scaffolding** | Go module, Vite frontend, embed.FS mount, migrations runner, CI, `make dev` / `make build` |
| [01](./01-event-vs-map.md) | **Event + VS + Map** | Single-event init, VS CRUD, MapLibre + Protomaps tile serving, click-to-add VS |
| [02](./02-races-gpx.md) | **Races + GPX** | Race CRUD, GPX upload + simplification, VS projection, ordered race-VS list, auto first-in/last-in |
| [03](./03-volunteers-cars-csv.md) | **Volunteers + Cars + CSV** | Volunteer & Car CRUD, CSV import pipeline, phone normalization, CSV export |
| [04](./04-missions-assignments.md) | **Missions + Assignments** | Missions at a VS, drag-drop assignment UI, role-filtered volunteer picker |
| [05](./05-constraints.md) | **Constraint engine** | Pure-function warning engine, full recompute on every mutation, badges + issues panel |
| [06](./06-trips-travel-matrix.md) | **Trips + Travel matrix** | Haversine travel-time matrix, trip editor, board/alight per stop, transport warnings |
| [07](./07-timeline.md) | **Timeline** | Hand-rolled scrubber, front/tail runner animation along GPX, volunteer & car position sync |
| [08](./08-roadbook.md) | **Roadbook** | maroto v2 PDFs, master document, golden-file determinism (mini-map is conditional — see M08 risks) |
| [09](./09-archive-polish.md) | **Archive + polish** | Event zip export/import, daily auto-backup, performance pass, release pipeline |
| [10](./10-navigation-rework.md) | **Navigation rework** | Map-is-home toolbar (VS / Trajets / Chronologie / Courses) + clean header pages; deletes `MapDrawer` / `PbEditPanel` / `MissionsPanel` and 10+ legacy routes |

## Conventions

- **Acceptance criteria** end each milestone. Don't move on until they pass.
- **Deliverables** are concrete artifacts: files, endpoints, screens, tests.
- **Out of scope** sections are explicit per milestone — features that belong later go in a later milestone, not this one.
- **References** link back to the relevant section of the spec docs (`docs/01-vision.md` through `docs/07-open-questions.md`). ⚠️ **Those original docs are partially superseded** by the locked decisions below and by these per-milestone files. Each of `docs/01-07` carries a banner at the top flagging this. When a reference cites them, treat the cited content as conceptual context unless it's reaffirmed in the milestone itself.

## Locked decisions that apply across milestones

These were settled during pre-implementation grilling (see [`../README.md`](../README.md) for the full spec set):

1. **Single event per SQLite file.** No `event_id` everywhere. Switching events = picking a different file.
2. **Backend layout is feature-oriented**: `internal/features/<resource>/` for CRUD; `internal/domain/constraints` cross-cutting; `internal/{gpx,routing,roadbook,csv,archive,store,server}` for subsystems.
3. **PDF: maroto v2 + go-staticmaps.** No chromedp; pure Go.
4. **Frontend stack is full from day one**: React 18 + Vite + TS + TanStack Router + TanStack Query + Zustand + Tailwind + shadcn/ui (vendored) + dnd-kit + RHF + Zod + MapLibre GL JS + lucide-react.
5. **Map tiles**: Protomaps schema, two transport modes. `--tile-mode=auto` (default) prefers a local `.pmtiles` archive when present, falls back to the Protomaps online API when `--protomaps-api-key=` is set, and otherwise reports `kind=missing` so the user can drop one in. Both code paths must keep working. Detail + rationale in [`../research/online-tile-fallback.md`](../research/online-tile-fallback.md). *(Pre-2026-05-17 wording was "Protomaps `.pmtiles` always, dev and prod" — revised when the 8.7 GB archive turned out to be a punishing onboarding tax for the much-more-common planning-with-internet path.)*
6. **Routing**: haversine-only in v1; schema has `source` column for later ORS/OSRM.
7. **Auth**: none; bind to `127.0.0.1`.
8. **Constraint engine**: pure function, server-side full recompute, lives at `internal/domain/constraints`.
9. **i18n**: FR only in v1; `t()` API in place for later EN.
10. **Tests**: comprehensive — every handler, every store query, every component; table-driven constraints; golden-file PDFs; Playwright e2e on critical flows.
11. **Frontend navigation shape**: map-is-home with a toolbar driving both map behavior and the right sidebar (4 tools: VS / Trajets / Chronologie / Courses); non-map flows live as header pages (Affectations / Ressources / Roadbooks / ⚙ Paramètres); warnings are a slide-over, not a page. Full target model — including the routes deleted and the components absorbed — is in [`../ui/navigation.md`](../ui/navigation.md). This is the authoritative shape; the current `web/src/App.tsx` is the legacy state to be migrated.

If any future doc revision or PR contradicts the above, the decisions here take precedence unless explicitly overridden.

## How to use these docs

- Start a milestone by reading its file end-to-end.
- Work top-to-bottom through the **Implementation steps**.
- Tick the **Acceptance criteria** before opening the next milestone.
- When you discover a gap, add it to the milestone file (or push it forward into a later one if it doesn't belong here).
