# Milestone 10 — Navigation rework

## Goal

Replace the current header-driven navigation (Carte / Chronologie / Roadbooks / Logistique ▾ / Paramètres / Sauvegarde, plus an opt-in `MapDrawer` and three stacked overlays) with the **map-is-home toolbar model** locked in [`../ui/navigation.md`](../ui/navigation.md). When this milestone is done, the map is the working surface, four tools (VS / Trajets / Chronologie / Courses) drive both map behavior and a persistent right sidebar, and everything non-spatial lives behind a clean header (Affectations / Ressources / Roadbooks / ⚙). No dead code, no orphan routes, all tests green.

## Prerequisites

- Milestones 00–09 complete.
- [`../ui/navigation.md`](../ui/navigation.md) read end-to-end. It is the single source of truth for this milestone's *shape*; this file is the *plan*.

## Scope (in)

- New `AppShell` with two-row header on map routes (header + toolbar), one-row on non-map routes.
- New `MapWorkspace` component: map canvas + persistent right `Sidebar` + a small top-left `LayersControl` (race visibility, future-proof for trip/volunteer layers).
- Four tools wired through the toolbar: **VS**, **Trajets**, **Chronologie**, **Courses**. Each tool owns its sidebar push-stack and its map-click handler.
  - **VS** absorbs `PbEditPanel` and `MissionsPanel` content into sidebar frames. `VolunteerPicker` stays as a modal.
  - **Trajets** sidebar has a Trajets / Besoins workspace toggle; "Voir matrice" opens `MatrixView` as a modal.
  - **Chronologie** rehouses `TimelinePage` content as a map tool (sidebar = day picker + scrubber + filter + warnings).
  - **Courses** rehouses `RaceList` / `RaceDetail` and absorbs the legacy "Manage" link on the map.
- New header pages: `/affectations` (rehoused `MissionsGrid`), `/ressources/benevoles`, `/ressources/vehicules`, `/ressources/benevoles/import`, entity detail sub-routes. `/parametres` consolidates Roadbook + Données (= Sauvegarde + Archive) into one page with two tabs.
- New `WarningsSlideOver` triggered by the ⚠ counter; replaces the `/issues` full-page navigation.
- New `LayersControl` (small top-left icon on the map) replaces the always-on floating race-filter box.
- Full deep-link URL space per [`../ui/navigation.md`](../ui/navigation.md) "URL space". Hash routing in `web/src/lib/router.ts` stays.
- All `e2e/*.spec.ts` updated to the new routes and DOM. No `data-testid="map-drawer-*"`. No `Logistique` dropdown. Specs that were exercising surface details of the old shell get rewritten against the new shell.
- Dead-code sweep: deletions enumerated under "Deletions" below.

## Scope (out)

- Sidebar resize / drag-handle UI (fixed width OK in v1 of the rework — see Risks).
- Keyboard shortcuts for tool switching (post-MVP).
- Visual polish beyond what the current Tailwind tokens allow (no new design tokens).
- Any new feature: this milestone is structural only. Behavior of every existing feature must match the pre-rework behavior bit-for-bit, modulo where it's rendered.

## Deletions (must be gone at milestone close)

Code:

- `web/src/features/map/MapDrawer.tsx` and its tests.
- `web/src/features/vs/PbEditPanel.tsx` (content absorbed into the VS-tool sidebar frame).
- `web/src/features/mission/MissionsPanel.tsx` (content absorbed into the VS-tool sidebar frame).
- The "Ouvrir le panneau" button and `stack`/`setStack` state in `MapShell` (`web/src/App.tsx`).
- The floating top-left race-filter box in `web/src/features/map/MapView.tsx`. Its "Manage" link is gone; race visibility lives in `LayersControl`.
- The `Logistique` header dropdown in `App.tsx`.
- Cross-page `navigate(...)` "shortcut" links between `MatrixView`, `TripList`, `TransportNeedsList` (the new Trajets workspace makes them redundant).

Routes (removed from `Routes` in `App.tsx`):

`/races`, `/races/:id`, `/volunteers`, `/volunteers/:id`, `/volunteers/import`, `/cars`, `/cars/:id`, `/missions/grid`, `/transport-needs`, `/transport-needs/:day`, `/travel-times`, `/timeline`, `/settings/roadbook`, `/settings/archive`, `/settings/backup`.

(The route table's final shape is the URL map in [`../ui/navigation.md`](../ui/navigation.md).)

Components / pages survive untouched as *content* (rehoused, not rewritten): `EventInitWizard`, `VolunteerPicker`, `MissionsGrid`, `MatrixView`, `IssuesPanel`, all forms (`RaceForm`, `VolunteerForm`, `CarForm`, `MissionForm`, `TripEditor`), `BackupSettingsPage` body, `ArchivePage` body, `RoadbookSettingsPage` body.

## Implementation steps

1. **Scaffolding (sequential, must land first).**
   - New components under `web/src/components/shell/`: `AppShell`, `Header`, `Toolbar`, `Sidebar`, `LayersControl`, `WarningsSlideOver`.
   - New components under `web/src/components/sidebar/`: `SidebarFrame` (push-stack root) and a tiny `usePushStack` hook (replaces the inlined stack in current `MapShell`).
   - New page shells under `web/src/features/`:
     - `ressources/RessourcesPage.tsx` (tabbed Bénévoles + Véhicules).
     - `affectations/AffectationsPage.tsx` (wraps `MissionsGrid`).
     - `settings/SettingsPage.tsx` (tabbed Roadbook + Données).
   - Rewrite `web/src/App.tsx`:
     - Route table per the URL map.
     - On map routes: render `AppShell` with the two-row header + `MapWorkspace`.
     - On header pages: render `AppShell` with the one-row header + the page.
   - At this point the app must build and existing tools must still work — wire them into their tool sidebars in step 2.
2. **VS tool wiring.**
   - VS-tool sidebar root: VS list (the existing list logic from `MapDrawer` "Courses" tab is *races*, not VS; the VS list comes from `useVS()` — there is no VS list in the legacy UI; the legacy "list" was the marker layer. The sidebar VS list is therefore *new* in the rework: a flat list of VS pulled from `useVS`, grouped by associated race, click-to-select).
   - Map-click on a marker: select that VS (push `vs/:id` to the URL); sidebar shows VS detail (form, GPX projection info, missions list).
   - Click a mission in that detail: push mission detail; "Affecter" opens `VolunteerPicker` modal (unchanged).
   - Delete `PbEditPanel` and `MissionsPanel` once the sidebar frames render the same fields.
3. **Trajets tool wiring.**
   - Sidebar root: trip list (existing `TripList` body) with a `Trajets / Besoins` toggle at the top.
   - In "Besoins" mode: render `TransportNeedsList` body in the sidebar; "Créer un trajet pour ce besoin" pushes the trip editor with the same query-string flow.
   - "Voir matrice" button opens `MatrixView` as a `Dialog`.
   - Click a VS marker: append it to the active trip's stops (only when a trip is being edited).
   - Delete the cross-page link soup; `TripList`, `TransportNeedsList`, `MatrixView` stop calling `navigate("/...")` to each other.
4. **Chronologie tool wiring.**
   - Move `TimelinePage`'s rendering split: the canvas/scrubber/day-picker/filter UI moves into the Chronologie sidebar; the runner / volunteer / car markers continue to render on the main MapView (already the case via `tl-*` sources).
   - Delete `/timeline` route; the same content lives at `/chronologie`.
5. **Courses tool wiring.**
   - Sidebar root: race list (existing `RaceList` body); click pushes race detail (existing `RaceDetail` body).
   - Map shows race GPX lines; visibility toggled by `LayersControl`.
   - Drop the floating top-left race-filter box in `MapView`. Its checkboxes move into `LayersControl`'s popover.
6. **Header pages.**
   - `/affectations` renders the `MissionsGrid` body in a max-width container.
   - `/ressources/benevoles[/:id|/import]` and `/ressources/vehicules[/:id]` render `RessourcesPage` with the right tab active.
   - `/parametres` renders `SettingsPage` (Roadbook | Données). The Données tab stacks `BackupSettingsPage` content above `ArchivePage` content (no nested tabs).
   - `/roadbooks` and `/roadbooks/parametres` keep their content; only the path of the settings sub-page changes.
7. **Warnings slide-over.**
   - The ⚠ counter in the header opens a right-anchored slide-over (Radix `Sheet` or equivalent shadcn primitive vendored).
   - Slide-over body = existing `IssuesPanel` content; row clicks navigate to `/ressources/benevoles/:id` (rewriting the old `/volunteers/:id`) or `/affectations` (rewriting the old `/missions/grid`).
   - The `/issues` route survives as a fallback (referenced by tests/deep-links) and renders the same content in a full page.
8. **e2e + Vitest sweep.**
   - Rewrite every `e2e/*.spec.ts` selector that targets the legacy shell (`map-drawer-*`, Logistique dropdown, header buttons that no longer exist).
   - Update URL navigations to the new paths.
   - Add at minimum one new spec: `e2e/navigation.spec.ts` that walks all four tools and all header pages, asserting the toolbar shows on map routes and hides on header pages.
9. **Dead-code sweep.**
   - Grep for the deleted route strings, the deleted component names, and unused `navigate(...)` callsites; remove anything orphaned.
   - Run `pnpm tsc -b --noEmit` and resolve unused-export warnings (the `noUnusedLocals` / `noUnusedParameters` flags should catch most).
   - Confirm no `aria-label="Open panel"` / "Ouvrir le panneau" / `map-drawer-` strings remain.

## Data model deltas

None. Pure frontend.

## API surface

None. Pure frontend.

## Frontend surface

The full target URL space is enumerated in [`../ui/navigation.md`](../ui/navigation.md) "URL space". This milestone produces exactly that surface.

## Tests

- All current Vitest tests stay green (forms, hooks, api adapters are unchanged).
- All Playwright specs migrate to the new shell; the count of passing specs is `≥` the current count (12 listed in `e2e/`).
- New `e2e/navigation.spec.ts` proves the shell behaves per [`../ui/navigation.md`](../ui/navigation.md).
- `scripts/harness/check.sh` green.

## Risks

- **Trajets sidebar density.** Trip editor + Besoins toggle + Matrice modal in a 380-px sidebar might be cramped. Mitigation: TripEditor was already a full-page form; pushing it into the sidebar may force horizontal scroll on some fields. If it does, accept it for v1 of the rework and file a follow-up rather than expanding the sidebar.
- **Chronologie rehouse.** Timeline's canvas may not behave well in a narrow sidebar. If the canvas truly needs more horizontal room, the fallback is to keep it at the bottom of the map (a third row below the map) instead of inside the sidebar. Decide during implementation.
- **e2e churn.** Most specs key off `data-testid`s in the legacy shell. Expect to rewrite many. Don't loosen assertions to make them pass — fix the test to assert the new flow.
- **Visual regression invisible to tests.** Type and lint won't catch "the sidebar is empty when it shouldn't be" or "the toolbar flashes on header pages." Run the dev server, click every route manually before declaring done.

## Acceptance criteria

- [ ] On `/`, the AppShell shows the two-row header (header + toolbar) and a persistent right sidebar. No "Ouvrir le panneau" button. No floating race-filter box.
- [ ] Toolbar switches between VS / Trajets / Chronologie / Courses; each tool changes both the map-click behavior and the sidebar root.
- [ ] Clicking a VS marker selects it (URL → `/vs/:id`); sidebar shows the VS detail and its missions. No `PbEditPanel` or `MissionsPanel` overlays render.
- [ ] In Trajets tool: trip list ⇄ Besoins workspace toggle works; "Voir matrice" opens `MatrixView` in a modal; clicking VS markers while editing a trip appends to its stops.
- [ ] In Chronologie tool: day picker + scrubber render in the sidebar; runner / volunteer / car markers animate on the map; the legacy `/timeline` route returns 404 or redirects to `/chronologie`.
- [ ] In Courses tool: race list → race detail flow renders in the sidebar (GPX upload + VS sequence editor included). Race visibility toggles via the layers icon, not the legacy floating box.
- [ ] Header pages all reachable: `/affectations`, `/ressources/benevoles[/:id|/import]`, `/ressources/vehicules[/:id]`, `/roadbooks[/parametres]`, `/parametres`. Each renders without the toolbar row.
- [ ] `/parametres` has two tabs (Roadbook, Données); the Données tab contains both backup and archive content.
- [ ] ⚠ counter opens a right-anchored slide-over with the IssuesPanel content; row clicks navigate to the right new routes.
- [ ] All legacy routes listed under "Deletions / Routes" return 404 or redirect (the spec doesn't care which, as long as nothing in the app links to them).
- [ ] `web/src/features/map/MapDrawer.tsx`, `web/src/features/vs/PbEditPanel.tsx`, `web/src/features/mission/MissionsPanel.tsx` are deleted from the repo.
- [ ] `grep -r "map-drawer\|Ouvrir le panneau\|PbEditPanel\|MissionsPanel" web/src` returns no matches.
- [ ] `pnpm tsc -b --noEmit` clean; no unused-export TS warnings introduced.
- [ ] All Playwright specs green; the new `e2e/navigation.spec.ts` passes.
- [ ] `./scripts/harness/check.sh` green.

## References

- [`../ui/navigation.md`](../ui/navigation.md) — locked target model (this milestone delivers it).
- [`./README.md`](./README.md) "Locked decisions" #11 — the meta-decision pointing at this work.
- `web/src/App.tsx` — current spaghetti, to be replaced.
