# Frontend navigation — target model

> Settled during pre-implementation UI grilling. This document is the **single source of truth for the frontend navigation shape**. When it conflicts with code in `web/src/App.tsx` or with `docs/04-design.md`, this document wins. Code is expected to migrate toward this model; until it does, the existing navigation in `App.tsx` is the legacy state being replaced.

## Mental model

**The map is the home.** The map view is the primary working surface; everything spatial is reached from it. Things that don't fit on a map (resource lists, generated artefacts, configuration) live as separate header pages. There is no dashboard, no landing screen — once the event exists, `/` is the map.

Two parallel navigation axes:

- **Toolbar (map-only)** — selects the *tool*, which simultaneously changes (a) what clicking the map does and (b) what the right sidebar contains. The toolbar is to this app what tool selection is to Figma or QGIS.
- **Header (always visible)** — links to non-map pages: tabular planning, resource management, generated outputs, configuration, warnings.

These are different *kinds* of navigation. The toolbar changes mode within the map; the header leaves the map.

## Layout

Two header rows. The toolbar row is only rendered on map routes.

```
Map routes (/, /vs/*, /trajets/*, /chronologie, /courses/*):
┌─────────────────────────────────────────────────────────────────┐
│ Logo · Affectations · Ressources ▾ · Roadbooks · ⚙ · ⚠         │
├─────────────────────────────────────────────────────────────────┤
│              ◉ VS    ○ Trajets    ○ Chronologie    ○ Courses    │
├──────────────────────────────────────────────┬──────────────────┤
│                                              │                  │
│  [⊕ layers]   MAP                            │   SIDEBAR        │
│                                              │   (push/pop)     │
└──────────────────────────────────────────────┴──────────────────┘

Header pages (/affectations, /ressources/*, /roadbooks, /parametres):
┌─────────────────────────────────────────────────────────────────┐
│ Logo · Affectations · Ressources ▾ · Roadbooks · ⚙ · ⚠         │
├─────────────────────────────────────────────────────────────────┤
│                       (page content)                            │
└─────────────────────────────────────────────────────────────────┘
```

- Clicking the **Logo** returns to the map with the last-used tool restored.
- The **⚠ warnings counter** opens a right-anchored slide-over (not a full page). Row clicks navigate (e.g., to `/ressources/benevoles/:id`); clicking outside or on a target closes it.
- The **⊕ layers icon** is a small map-overlay button (top-left of the canvas) that pops a layer-toggle panel — currently race visibility; future-proof for volunteer/trip layer toggles.

## Tools (map-side)

Four tools. Each owns its sidebar root and its map-click behavior.

| Tool         | Route(s)                          | Map behavior                                                        | Sidebar root                                                                                  |
| ------------ | --------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| VS           | `/`, `/vs`, `/vs/:id`             | Click empty → create VS; click marker → select (URL → `/vs/:id`)    | VS list → VS detail (form + missions list) → mission detail. Modal: volunteer picker.         |
| Trajets      | `/trajets`, `/trajets/new`, `/trajets/:id` | Click VS markers to chain a route; click trip line → select | Trip list ⇄ Besoins workspace mode → trip editor. Modal: Matrice temps (reference table).     |
| Chronologie  | `/chronologie`                    | Runners + volunteers animate at scrubbed time                       | Day picker, time scrubber, race-active filter, point-in-time warnings.                        |
| Courses      | `/courses`, `/courses/:id`        | GPX traces visible (toggled via ⊕ layers); click race line → select | Race list → race detail (form, GPX upload, VS sequence).                                      |

### Tool rules

- **Toolbar drives both map and sidebar.** Switching tools always reshapes both. There are no per-tool sub-toolbars; mode within a tool (e.g., Trajets' Besoins workspace) is a sidebar control.
- **Sidebar uses push/pop navigation** (the model already implemented in the legacy `MapDrawer`). One frame at a time, "← Retour" pops. List → detail → sub-detail nests in the URL too.
- **Modals are reserved for pick-and-confirm flows.** The rule: *if the user makes one decision and the flow ends, it's a modal; if the user is navigating or editing in place, it's the sidebar.* Concretely: `VolunteerPicker` and Matrice are modals; everything else lives in the sidebar.
- **Default tool on first load: Courses.** Without races and GPX the map has nothing to anchor against, so Courses is the natural starting point. Subsequent loads restore the last-used tool from `localStorage`.

## Header pages (non-map)

| Page              | Route(s)                                                                                              | Notes                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Affectations      | `/affectations`                                                                                       | Cross-VS mission-planning table (rehoused `MissionsGrid`). Tabular by design; the map adds nothing in this view.   |
| Ressources        | `/ressources/benevoles`, `/ressources/benevoles/:id`, `/ressources/benevoles/import`, `/ressources/vehicules`, `/ressources/vehicules/:id` | One page, two tabs (Bénévoles / Véhicules). CSV import is a button on the Bénévoles tab. |
| Roadbooks         | `/roadbooks`, `/roadbooks/parametres`                                                                 | Generation flow. Roadbook-specific settings are a sub-page reached from here.                                      |
| ⚙ Paramètres      | `/parametres`                                                                                         | Two tabs: **Roadbook** (current `RoadbookSettingsPage` content) and **Données** (backup + archive actions merged). |
| ⚠ Warnings        | (slide-over, no route)                                                                                | Anchored to the ⚠ button in the header. Rows navigate into volunteer / mission detail.                            |

## URL space (deep-linkable)

```
/                              → map, default/last tool
/vs                            → map, VS tool, list
/vs/:id                        → map, VS tool, detail
/trajets                       → map, Trajets tool, list
/trajets/new                   → map, Trajets tool, new
/trajets/:id                   → map, Trajets tool, detail
/trajets?mode=besoins          → map, Trajets tool, Besoins workspace
/chronologie                   → map, Chronologie tool
/courses                       → map, Courses tool, list
/courses/:id                   → map, Courses tool, detail
/affectations                  → header page (MissionsGrid)
/ressources/benevoles          → header page, Bénévoles tab
/ressources/benevoles/:id      → volunteer detail
/ressources/benevoles/import   → CSV import wizard
/ressources/vehicules          → header page, Véhicules tab
/ressources/vehicules/:id      → vehicle detail
/roadbooks                     → header page, generate
/roadbooks/parametres          → roadbook settings (sub-page of /roadbooks)
/parametres                    → header page, Roadbook | Données tabs
/issues                        → reserved (the slide-over has no public route; kept as a fallback for tests/deep-links if needed)
```

The router stays hash-based (`web/src/lib/router.ts`); only the route table changes.

## What gets deleted in the cleanup

- The `Ouvrir le panneau` button on the map.
- The `MapDrawer` toggle and its four-tab shell. The tabs themselves are absorbed into tools and header pages; the entity-list components survive untouched.
- The `PbEditPanel` overlay (content → VS-tool sidebar detail).
- The `MissionsPanel` overlay (content → VS-tool sidebar push frame).
- The floating top-left race-filter box on the map (→ ⊕ layers icon popover).
- The `Logistique` header dropdown (→ Trajets tool absorbs Trajets, Besoins, Matrice; Archive moves under ⚙).
- The separate `Paramètres` and `Sauvegarde` header buttons (→ both fold into `/parametres`).
- The "Manage" link on the map's race panel (→ Courses tool).
- The cross-page `navigate(...)` link soup between `MatrixView` / `TripList` / `TransportNeedsList` (→ single Trajets workspace makes them unnecessary).
- Legacy routes: `/races`, `/volunteers`, `/cars`, `/missions/grid`, `/transport-needs`, `/travel-times`, `/settings/roadbook`, `/settings/backup`, `/settings/archive`, `/timeline`.

## What survives (logic-wise, just relocated)

- `EventInitWizard` — unchanged, full-screen pre-event.
- `VolunteerPicker` — unchanged, modal triggered from the VS tool's mission detail.
- All entity forms (`RaceForm`, `VolunteerForm`, `CarForm`, `MissionForm`, `TripEditor`) — content untouched; render inside the sidebar push-stack.
- `IssuesPanel` content — rehoused in the warnings slide-over.
- `MissionsGrid` content — rehoused at `/affectations`.
- `MatrixView` content — rehoused as a modal opened from the Trajets tool.
- Existing Playwright specs that target URLs (most of `e2e/*.spec.ts`) continue to work. Specs that target `[data-testid="map-drawer-open-races"]` or the Logistique dropdown need updates — the drawer button is gone and the dropdown is gone.

## Open implementation details

Punted to build time, not part of this decision:

- Sidebar width (likely ~380px) and whether the user can collapse / resize it.
- Whether the toolbar persists the *selection* across refreshes (URL handles this for `/vs/:id` etc.; in-memory for tool switches without a selection).
- Exact Chronologie sidebar layout (day picker / scrubber / filter ordering).
- Visual treatment for "selected VS" — marker pulse vs. tether line vs. sidebar highlight only.
- Keyboard shortcuts for tool switching (1=VS, 2=Trajets, …) — nice-to-have, post-MVP.

## Notes for the implementing agent

- This redesign touches `web/src/App.tsx` (route table + shell), every feature's page-level component that currently uses `navigate(...)` for cross-links, and the `MapDrawer` / `PbEditPanel` / `MissionsPanel` / floating-race-filter components (delete or absorb).
- The migration is large enough to warrant its own milestone. It is **not** an emergency: nothing in the current code is broken, just spaghetti. Sequence it after the current milestone (`09-archive-polish`) completes; do not interleave with feature work.
- The harness link checker (`scripts/harness/lint_docs.py`) does not currently scan `docs/ui/` — if you add more files here, decide whether to extend `check_links` to cover them.
