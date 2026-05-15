# Milestone 08 — Roadbook

## Goal

The coordinator clicks "Generate roadbooks" and the app produces one byte-deterministic PDF per volunteer plus a master PDF for themselves, using pure-Go rendering (maroto v2) and a pre-rendered mini-map (go-staticmaps). Same data → same bytes. The roadbook layout is driven by event-level settings: logo, primary color, section toggles, section order, header/footer text, sponsor strip.

## Prerequisites

- M07 complete (timeline confirms the data is coherent; not strictly required but the user typically validates before printing).
- M06 complete (trips drive trip blocks in the roadbook).
- M04 complete (assignments drive mission blocks).

## Scope (in)

- maroto v2 templates: header, per-day timeline (mission / trip / idle blocks), co-staff and co-passenger lists, footer with full VS reference, optional sponsor strip.
- Mini-map snippet per day via go-staticmaps, embedded as PNG.
- Per-volunteer PDF: `roadbook_<last>_<first>.pdf`.
- Master PDF: `master_<event_name>.pdf` with per-volunteer sections + a VS × time grid sheet.
- Section visibility toggles + section order per event settings.
- Co-staff/co-passenger disclosure: name + role + phone only (no email/address/emergency contact).
- Driver's own roadbook lists their trips as "Drive: pick up X at VS-A at HH:MM..." plus their missions.
- Determinism harness: golden-file tests.
- In-app preview: render the **real PDF** for a single volunteer via the maroto pipeline, return its URL, embed it in the settings page via a browser-native `<iframe src="<pdf-url>">`. No HTML mirror — the PDF *is* the preview, which avoids maintaining a parallel renderer (the trade-off vs. the old chromedp design, where HTML and PDF were the same artifact).
- Settings UI for all roadbook customization fields.

## Scope (out)

- Editable HTML/CSS templates (out of v1).
- Per-volunteer template customization beyond `customizable_message` (out of v1).
- Mid-race delta export (out of v1).
- Email delivery (out of v1).

## Implementation steps

1. **Migration `0008_roadbook_fields.sql`** — adds four event-level columns that the roadbook needs but didn't fit cleanly in the `settings` JSON blob (they're either large binaries referenced by path, or frequently-read fields):
   ```sql
   ALTER TABLE events ADD COLUMN logo_path         TEXT;          -- assets/logo/<sha>.<ext>
   ALTER TABLE events ADD COLUMN sponsor_path      TEXT;          -- assets/sponsor/<sha>.<ext>
   ALTER TABLE events ADD COLUMN coordinator_name  TEXT;          -- prints in roadbook header
   ALTER TABLE events ADD COLUMN coordinator_phone TEXT;          -- E.164; prints in roadbook header
   ```
   Everything else (colors, toggles, section order, header/footer text) lives in `events.settings` JSON under a `roadbook` key — no DDL for those.
2. **Settings shape** in `internal/features/event/settings.go`:
   ```go
   type RoadbookSettings struct {
       PrimaryColor   string            // hex; lives in events.settings.roadbook
       HeaderText     string            // multi-line
       FooterText     string            // multi-line
       SectionOrder   []SectionKind     // explicit ordering
       SectionVisible map[SectionKind]bool
       MiniMap        bool              // see "Risks" — may force-off in v1 if vector→PNG can't be solved
   }
   type SectionKind string  // header, day, footer, sponsor, emergency_contact, customizable_message, general_info, vs_reference

   // Coordinator name/phone and logo/sponsor paths live on the events row (see migration 0008),
   // accessed via Event.LogoPath, Event.CoordinatorPhone, etc. — not in RoadbookSettings.
   ```
3. **`internal/roadbook/` package**:
   - `gather.go` — `BuildVolunteerData(state, volunteerID) (VolunteerRoadbook, error)`. Pulls assignments, trips (as driver or passenger), default VS, settings; builds an ordered day-by-day list of `Mission | Trip | Idle` blocks with all required fields (co-staff phone numbers etc.).
   - `render_volunteer.go` — `RenderVolunteer(data VolunteerRoadbook, settings RoadbookSettings, out io.Writer) error`. Uses maroto v2 to assemble the PDF. Each section is its own helper function.
   - `render_master.go` — `RenderMaster(state EventState, settings RoadbookSettings, out io.Writer) error`. Loops the per-volunteer renderer, then appends a grid section.
   - `grid.go` — generates the VS × time wide table (per day, then concatenated).
   - `minimap.go` — `RenderMiniMap(day, race, vsList) ([]byte, error)`. Uses `go-staticmaps` to draw the bounding box, GPX polyline, VS markers; returns a deterministic PNG (no antialiasing variability — seed fixed; tile provider configured to local pmtiles via custom tile fetcher).
   - `determinism.go` — wrap maroto calls to suppress timestamps/random IDs; embed fonts; content-hash any image path.
4. **maroto v2 wiring** — start with a small subset of components (text, image, signature, divider, page-break). Section composition is a `func(m core.Maroto, data VolunteerRoadbook, settings RoadbookSettings)` pattern; sections register themselves in an ordered list keyed by `SectionKind`.
5. **Mini-map tile source for go-staticmaps** — **see "Risks" below; this step is the largest unknown in the milestone.** `go-staticmaps` expects raster PNG tiles; the M01 `.pmtiles` archive is vector. Rendering vector pmtiles to a deterministic PNG inside pure Go has no off-the-shelf library. Three possible paths:
   - **(a)** Ship a small raster pmtiles archive (e.g., `tiles/<region>.raster.pmtiles`) just for mini-map use; download alongside the vector one. Easiest, but adds another asset.
   - **(b)** Rasterize regions of interest offline (one PNG per day's bounding box) at event-setup time using an external tool (`tippecanoe`, `maputnik`, headless MapLibre); cache in `assets/minimaps/<sha>.png`. Adds offline tooling.
   - **(c)** Force-off the mini-map in v1. `RoadbookSettings.MiniMap = false`, no rendering. Defer the geographic visual to v1.x. **Recommended if (a) and (b) are both painful.**
   Pick (c) for the initial v1 ship unless one of (a)/(b) lands easily during implementation. The settings UI keeps the toggle; if disabled at the binary level (no rasterizer), it's grayed out with a tooltip.
6. **Driver roadbook variant** — when rendering for a driver, prepend a "Drive" block to each day's timeline summarizing the trip's stops with timing.
7. **Master grid sheet** — wide table (landscape page or scaled), rows = VS, columns = 30-min slots per day, cells = mission titles + assignee initials.
8. **Endpoints** in `internal/features/roadbook/`:
   - `POST /api/roadbooks/generate` — synchronous (per [`../06-out-of-scope.md`](../06-out-of-scope.md) "No background job queue"). Returns `{volunteer_pdfs: [{volunteer_id, filename}], master_pdf: filename}`. Each filename is the safe form `roadbook_<last>_<first>.pdf` (or `master_<slug>.pdf`); the file lives at `exports/<eventSlug>/<filename>`.
   - `GET /api/roadbooks/files/{filename}` — download by filename (whitelist enforced; only files under `exports/<eventSlug>/` are servable, path traversal blocked).
   - `POST /api/roadbooks/preview` — body: `{volunteer_id, settings_override?}`. Renders a real PDF via the maroto pipeline for that one volunteer (with the optional settings override applied) and returns `{filename}`; the frontend embeds it via `<iframe src="/api/roadbooks/files/<filename>">`. Preview PDFs go in `exports/<eventSlug>/preview/` and are not part of the deterministic golden-test set.
9. **Frontend `web/src/features/roadbook/`**:
   - `RoadbookSettingsPage` — every customization knob, with a live preview iframe embedding a real PDF.
   - `RoadbookSectionOrderEditor` — dnd-kit drag-reorder of section keys, toggles for visibility.
   - `GenerateRoadbooksButton` — POSTs to the endpoint, polls progress (long sync calls show a progress modal), then surfaces download links.
   - `PreviewIframe` — sandboxed iframe loading `/api/roadbooks/files/<filename>` returned by `POST /api/roadbooks/preview`. Browser-native PDF viewer; no PDF.js dependency.
10. **i18n note** — all FR strings used in the templates live in `internal/i18n/fr.json` (or alongside the templates) so a later EN pass can swap them mechanically.

## Data model deltas

- `events` table gains four columns: `logo_path`, `sponsor_path`, `coordinator_name`, `coordinator_phone` (migration `0008_roadbook_fields.sql`).
- `events.settings` JSON gains a `roadbook` key for everything else.
- Filesystem: `exports/<eventSlug>/roadbook_<last>_<first>.pdf`, `exports/<eventSlug>/master_<slug>.pdf`, `exports/<eventSlug>/preview/<filename>`.
- `assets/logo/<sha>.<ext>`, `assets/sponsor/<sha>.<ext>`.

## API surface

- `POST /api/roadbooks/generate`.
- `GET /api/roadbooks/files/{filename}`.
- `POST /api/roadbooks/preview`.
- Settings managed through the existing `PUT /api/event` (the JSON blob includes the roadbook subsection); coordinator name/phone are top-level event fields, set via the same endpoint.
- `POST /api/event/logo`, `POST /api/event/sponsor` for asset uploads (write `events.logo_path` / `events.sponsor_path`; max 5 MB; PNG/JPEG only; content-hashed filenames).

## Frontend surface

- `/settings/roadbook` page.
- `/roadbooks` page with generate button + downloads list.

## Tests

- **Golden-file PDF tests** are the centerpiece: a fixture event (5 volunteers, 10 missions, 2 trips, 1 race, 2 days) renders to deterministic bytes; the test compares against committed `testdata/expected_<volunteer>.pdf`. CI fails on byte diff.
- **`gather.go`** — table-driven on edge cases: volunteer with no assignments, volunteer-as-driver, idle block insertion, mid-day cross-VS transitions.
- **Mini-map** — golden PNG tests.
- **Determinism stress** — render same data 10× concurrently; verify identical bytes.
- Playwright e2e: "Configure roadbook (logo, color, toggle off sponsor strip, reorder sections) → generate → download per-volunteer PDF → spot-check it opens and contains the expected name."

## Risks

- **🟥 Vector pmtiles → PNG for the mini-map** is the single largest unknown in the milestone. `go-staticmaps` expects raster PNG tiles; the M01 `.pmtiles` is vector. No off-the-shelf pure-Go library rasterizes vector pmtiles deterministically. Mitigations are listed in step 5 (raster pmtiles archive, offline pre-rasterization, or drop the mini-map in v1). **The plan ships with mini-maps disabled by default in v1 unless one of the rasterization paths lands easily.** This is *the* item to spike on before committing to a roadbook ship date.
- **maroto v2 layout limits.** Complex multi-page layouts with custom headers/footers can hit corners. If a feature genuinely can't be expressed (e.g., per-section reordering across page breaks), fall back to `typst` CLI subprocess (still pure-binary, no Chrome) before reconsidering.
- **Deterministic mini-map rendering** (only relevant if mini-map ships). `go-staticmaps` must be driven without any per-run randomness; tile fetcher must return identical bytes for identical inputs. Pin a tile snapshot in the test if needed.
- **Font embedding.** maroto needs fonts embedded for determinism + offline. Choose a permissively-licensed font (e.g., Inter, DejaVu) and ship the .ttf in the binary via `//go:embed`.
- **Generation time on large events.** Target: 100 PDFs + master in <60 s. If we miss, parallelize per-volunteer renders inside the generate endpoint (still synchronous overall).
- **Preview-PDF cache hygiene.** The preview endpoint writes PDFs to `exports/<eventSlug>/preview/`. Without cleanup, this directory accumulates over time. Run a sweep on startup deleting preview PDFs older than 1 hour.

## Acceptance criteria

- [ ] Generate roadbooks for the fixture event; per-volunteer PDFs and the master appear on disk.
- [ ] Open one PDF; verify header (logo + event name), per-day timeline blocks, co-staff phone numbers, footer with full VS reference.
- [ ] Re-generate without data changes; PDF bytes are identical (golden test green).
- [ ] Driver volunteer's PDF includes their trip itinerary.
- [ ] Master PDF includes per-volunteer sections + a grid sheet.
- [ ] Settings page: change primary color → preview iframe reflects it → generate → PDF reflects it.
- [ ] Toggle off `sponsor` and `general_info` sections → re-generated PDF omits them.
- [ ] `go test ./...` and `pnpm test` green; Playwright e2e green.

## References

- [`../02-spec.md`](../02-spec.md) §7 (roadbook generation).
- [`../04-design.md`](../04-design.md) §5 (roadbook generation).
- [`../06-out-of-scope.md`](../06-out-of-scope.md) Roadbook section.
- [`../07-open-questions.md`](../07-open-questions.md) §10 (PDF generation), §14 (driver roadbook), §15 (i18n).
