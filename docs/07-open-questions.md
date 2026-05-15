# 07 — Open Questions and Deferred Decisions

These are questions that came up during scoping and either weren't fully nailed down, or deserve real-world validation before deep build. Sorted by urgency.

## Validate-before-coding (high priority)

These four assumptions were made during scoping; before committing significant engineering time, ideally get answers from one or two real race coordinators.

### 1. Are visual-only constraints (never blocking) actually what coordinators want?

We chose to **warn but never block**. Some coordinators may prefer hard guardrails — "the app should not let me save a double-booking by accident." Others want the freedom we've designed.

**Validation:** show a mockup of the warnings UI to a real coordinator. Ask: "would you want a button to also enforce these?"

**Fallback if wrong:** add a per-warning-kind "strict mode" toggle in event settings.

### 2. Is sub-race + first-in/last-in granular enough?

Our model handles:
- One race start time per race.
- Front-runner pace + tail-runner pace.
- Per-VS overrides of first-in / last-in.

It does NOT handle:
- Wave starts (multiple start times within one race).
- Relay handoffs (effectively splits the race into independent legs with different paces).
- Staggered cutoff times (different cutoffs at different checkpoints).

**Validation:** ask: "does your race have wave starts, relays, or per-checkpoint cutoffs?" If yes, we may need to support per-runner-group race entities.

**Fallback if wrong:** model wave starts as separate Race entities with shared GPX; or add a "wave" concept under Race.

### 3. CSV import vs. Google Sheets API

We bet that CSV import is sufficient because Google Sheets exports to CSV trivially.

**Validation:** ask: "would you prefer to paste a Google Sheets link, or download to CSV and upload?" Some coordinators may already prefer Excel files.

**Fallback if wrong:** add XLSX support (Go has good libraries). Sheets API integration remains out for v1 due to OAuth burden.

### 4. Snapshot-only roadbook (no mid-race re-issue)

When a volunteer cancels at 06:00 race-day morning, the coordinator calls affected people. Is this acceptable?

**Validation:** ask: "in practice, when do volunteers cancel? Day before, morning of, mid-event?" If "mid-event" is common, we may need a quick-print-one-volunteer flow that's faster than the regenerate-everything flow.

**Fallback if wrong:** add a "regenerate just this volunteer" button to the volunteer detail page. Already in scope as a minor feature.

## Decisions deferred (lower priority)

Things that aren't blockers for v1 but will need answering as we build.

### 5. Default driving / walking speeds for the fallback
- We've proposed 40 km/h driving, 5 km/h walking.
- For mountain races, 40 km/h driving is optimistic. Possibly 25-30 km/h is more honest.
- These are configurable in event settings; the defaults are not critical.

### 6. Phone number normalization edge cases
- French numbers without country prefix are normalized with `+33` as the default.
- What about Swiss volunteers at a French race? Belgian volunteers?
- **Decision:** event-level default country code. Per-volunteer override on the form (a country picker before the number field). At CSV import, numbers already prefixed with `+` are accepted as-is.

### 7. Soft delete granularity
- Currently: only volunteers can be soft-deleted (archived).
- Should missions, VS, races also be soft-deletable?
- **Tentative answer:** no. Hard-delete with cascade confirmation prompts. Add `archived` to other entities only if real users report unwanted destructions.

### 8. What happens to a roadbook for an archived volunteer?
- A volunteer is archived after their PDF was generated.
- Re-generating roadbooks should skip them entirely.
- The master document should not include them.
- **Decision:** archived = invisible everywhere except a "show archived" toggle on the volunteer list. Their historical assignments and trips remain visible attached to the relevant missions/trips (with a "(archived)" suffix on the name) so the coordinator can fix orphans.

### 9. Map tile delivery
- Shipping a regional `.pmtiles` file (~300 MB for France) in the binary is heavy.
- Downloading on first run requires internet.
- **Decision:** download on first run, store under `tiles/`. Provide a `--offline-tiles=path/to/tiles.pmtiles` flag for the offline-first path.

### 10. PDF generation in offline mode
- chromedp requires Chrome. Chrome is the only system dependency.
- On a laptop without Chrome, PDF generation fails.
- **Decision:** detect Chrome on startup, print a clear install instruction if absent. Optionally bundle Chromium in the install package per-platform (significantly increases install size).

### 11. CSV import: what's the upsert key for volunteers without email?
- Some volunteers don't have email. The fallback key is `(first_name, last_name)`.
- This breaks on duplicates ("Pierre Martin" exists twice).
- **Decision:** when ambiguity is detected during import preview, the coordinator resolves row-by-row in the UI. No silent merging.

### 12. Trip on day boundary
- Can a trip span midnight? (E.g., a night-race shuttle.)
- **Tentative answer:** yes. Day is an integer attached to the trip; stops have full datetimes. Stops can be on any date. The "day" attribute is a primary classification but doesn't constrain the stop times.
- **Open:** how does the timeline display a cross-midnight trip? Probably: clip it to the visible day, show a "continues to day N+1" indicator.

### 13. Volunteer working hours warning thresholds
- Default: warn at >10h per day, warn if no break >6h.
- These should be event-configurable.
- **Decision:** event settings hold defaults; no per-volunteer override.

### 14. Roadbook for the driver-also-volunteer
- A driver is a volunteer. Their roadbook should show their trips (not just trips they're a passenger on).
- **Decision:** driver's roadbook lists their trips as "Drive: pick up Marie at VS-A at 09:00, drop at VS-B at 09:20, pick up..." — full trip itinerary. Their own missions appear separately as usual.

### 15. Internationalization for French/English
- All UI strings should go through a translation function from day one.
- Date formats follow the locale.
- **Open:** is the roadbook itself bilingual (one PDF in both languages), or does it follow the event's language setting?
- **Tentative answer:** event-level language toggle. One language per event.

## v2 candidate features (not yet promised)

A list of "would be nice" things deliberately deferred:

- Auto-build trips from transport needs (with strong manual override).
- Per-volunteer .ics calendar export.
- A volunteer-facing read-only web view (no app, just a unique URL per volunteer).
- SMS distribution of roadbook links.
- Templates for common race setups (the "annual race clone" replacement).
- Light analytics dashboard (volunteer hours by role, etc.).
- Cross-event volunteer history view.
- Excel (XLSX) import / export.
- Dark mode.
- Keyboard shortcuts and command palette.
- Plugin / extension point for race-specific custom logic.
- Live tracking integration (the "v42" feature).
- Mobile app for coordinator on race day (read-only).

These are not promises. They are a parking lot.

## Notes for Claude Code / future contributors

- When implementing, if you find yourself building something on the **v2 list** or the **out-of-scope list** ([`06-out-of-scope.md`](./06-out-of-scope.md)), stop and reconsider.
- When you find a question this document doesn't answer, **add it here** rather than silently picking a direction. Future-you will thank present-you.
- The product values **boring + correct + uncompromisingly simple** over clever. When in doubt, choose the simpler option and document the choice.
