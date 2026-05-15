# 04 — Detailed Design

> ⚠️ **Substantially superseded.** Several subsystem designs in this document were revised during pre-implementation grilling. See [`milestones/README.md`](./milestones/README.md) ("Locked decisions") and the relevant milestone file before treating any detail here as binding. Specifically:
>
> - **§5 Roadbook generation**: rendered with pure-Go maroto v2, not HTML templates fed to chromedp. Mini-maps via go-staticmaps (with the caveat documented in [`milestones/08-roadbook.md`](./milestones/08-roadbook.md) "Risks" — vector pmtiles → PNG is non-trivial). The "HTML → chromedp → PDF" pipeline described here is the old plan; see [`milestones/08-roadbook.md`](./milestones/08-roadbook.md) for the current one.
> - **§10 Internationalization**: v1 ships **FR only**, with a `t()` API in place so EN is a later mechanical pass.
> - **§3 Travel-time matrix**: the ORS/OSRM `auto` path is forward-looking; v1 only writes `fallback` (haversine) and `manual` rows.
>
> Treat the locked-decisions list and the milestone schemas as authoritative.

This document goes deeper on the subsystems that have non-obvious design decisions. Read [`02-spec.md`](./02-spec.md) and [`03-architecture.md`](./03-architecture.md) first.

## 1. The constraint engine

### Role
A pure function: given the current state of an event, produce a set of warnings, each warning attached to one or more entities. Re-run after every mutation that could affect warnings.

### Shape

```go
type Warning struct {
    ID         string         // Stable hash of (kind + entity IDs). Same situation → same ID.
    Kind       WarningKind    // Enum: double_booking, role_mismatch, ...
    Severity   Severity       // info | warn | error
    Message    string         // Human-readable, localized.
    Entities   []EntityRef    // Affected entities (volunteer, mission, trip, etc.).
    SuggestedFix *Fix         // Optional: a structured action the UI can offer ("unassign," "add trip leg").
}
```

### Design choices

- **Pure, side-effect free.** The engine reads state and returns warnings. It never mutates. This makes it trivially testable.
- **Idempotent.** Running it twice on the same state gives identical warnings (same IDs). The frontend uses warning IDs to diff and animate badge changes.
- **Per-mutation, not per-keystroke.** The frontend doesn't re-run constraints client-side; it relies on the server's recomputation on every mutation. The server returns affected warnings in the mutation response.
- **Incremental optional, full-recompute first.** v1 recomputes everything on every mutation. Optimize only if measurement shows >100ms latency.
- **Severity is informational, not enforced.** Even `error`-severity warnings don't block. The UI styles them more prominently.

### Categories of check (see [`02-spec.md`](./02-spec.md) §3 for the full list)
- **Time conflicts:** double-booking, overlap with availability, excessive duty hours.
- **Role compatibility:** mission's required role not in volunteer's role set.
- **Transport feasibility:** consecutive missions at different VS, travel time vs. gap.
- **Trip integrity:** capacity per leg, boarding before alighting, driver availability, passenger double-booking.
- **Staffing:** under/overstaffing per mission.

### Why not block?
Repeating the design principle: every "violation" has a context in which it's actually fine. ("Marie is doing 12 hours but it's her own choice." "Paul gets out of the car halfway and walks the last 200m.") The engine surfaces; the human decides.

## 2. Trip editor

The trip is an ordered route. Editing one is the most complex single-screen interaction in the app.

### Data shape

```go
type Trip struct {
    ID      ID
    Day     int
    DriverID VolunteerID
    CarID   CarID
    Mode    Mode  // drive | walk
    Stops   []Stop
    Notes   string
}

type Stop struct {
    VSID    VSID
    Time    Time          // Departure time from this stop (= arrival time at this stop for the first stop)
    Board   []VolunteerID // Volunteers boarding at this stop.
    Alight  []VolunteerID // Volunteers alighting at this stop.
}
```

### UX flow

1. Coordinator opens the trip editor (new trip or existing).
2. Pick a day.
3. Pick a driver (filtered to volunteers with `can_drive`).
4. Pick a car (filtered to cars not in use during the trip's time window, but the warning is visual only).
5. Add the first stop: pick a VS, set departure time. The board list is initially empty; the coordinator picks volunteers from a list filtered to "people who need transport around this time from this VS." Alight list is empty for the first stop.
6. Add subsequent stops: pick a VS, app auto-fills arrival/departure time from `previous_stop.time + routing_matrix(prev_VS, this_VS, mode)`. Coordinator can override the time. Pick who alights (filtered to people currently on the vehicle). Pick who boards (filtered to people needing transport from this VS now).
7. Continue until all relevant passengers have alighted.
8. Save.

### Validation displayed inline (warnings, not blocks)
- Capacity-per-leg: shown next to each leg ("4/4 seats" or "5/4 — exceeded").
- Passenger consistency: a passenger who boards but never alights is flagged.
- Time consistency: a stop time earlier than the previous stop's is flagged red but not rejected.
- Travel-time mismatch: if the coordinator overrides a leg's time to something wildly inconsistent with the routing matrix, show a subtle warning.

### Per-leg time override
- Each leg has a "auto" / "manual" indicator. Auto = computed from routing matrix; Manual = coordinator-entered.
- Editing a leg time switches it to manual.
- An "auto-recompute" button per leg reverts to the matrix value.

## 3. Travel-time matrix

### Storage
- Per-event N×N×2 matrix (`N` = number of VS, `2` = drive + walk modes).
- Stored as a SQLite table: `travel_times(event_id, from_vs_id, to_vs_id, mode, seconds, source)`.
- `source` ∈ `auto | manual | fallback`.

### Auto-fill
- Triggered when a VS is added, moved, or deleted, or when the coordinator clicks "recompute matrix."
- Calls the routing API in batches (ORS supports matrix queries up to 50 points, OSRM has no limit).
- Writes results with `source = auto`.

### Manual override
- The coordinator can edit any cell from the matrix view or from within a trip leg.
- Sets `source = manual`. Survives auto-recomputes.
- The matrix view visually distinguishes the three sources (e.g., color-coded).

### Fallback
- When the API is unreachable, missing cells get filled with haversine × default speed (drive: 40 km/h, walk: 5 km/h, both configurable).
- Marked `source = fallback`. Replaced by `auto` when the API becomes available again.

### Refresh policy
- Matrix is invalidated for the affected row/column when a VS moves.
- Coordinator can "force refresh" the whole matrix manually.

## 4. GPX timeline

### Parsing
- On GPX upload: parse with `gpxgo`, simplify (Douglas-Peucker, tolerance ~5m) if > 5000 points to keep the rendered polyline fast.
- Store as a sequence of `(lat, lon, cumulative_distance_m)` points.

### VS projection
- For each VS in a race's ordered route, compute the **nearest point on the GPX polyline** (linear-segment-by-linear-segment) and its cumulative distance.
- The VS's "position along the race" is its projected cumulative distance.
- Auto-computed first-in / last-in at each VS = `(projected_distance / front_pace, projected_distance / tail_pace)`, offset by the race's start time.
- Manual override per VS is stored separately and takes precedence.

### Front/tail animation
- For each race, two virtual "runners" move along the GPX from start to finish.
- At any time `t`, their position is interpolated based on the cumulative-distance/time function (which is piecewise linear between VS waypoints).
- Rendered as two colored dots moving along the GPX line.

### Volunteer and car position calculation
- At time `t`, for each volunteer:
  - If they're in an active mission's time window, position = the mission's VS.
  - Else if they're between board and alight on an active trip, position = linear interpolation between the previous stop's VS and the next stop's VS, parameterized by time within that leg.
  - Else position = their default VS (idle).
- For each car: position = wherever the trip currently is, or "garage" (default VS of the driver, or unspecified) if not on a trip.

### Scrubber UI
- Horizontal time axis spanning the event's duration.
- A vertical cursor draggable along the axis.
- Auto-play button with speed control (1x, 5x, 30x, 300x real-time).
- Layered rows below the axis: one per race (front/tail bars), then mission rows per VS, then trip rows per car.
- Map updates in sync.

### Performance
- Position calculations done client-side from cached event data.
- Map markers update at ~30fps during auto-play. Throttle if needed.

## 5. Roadbook generation

### Template approach
- A root HTML template + partial templates for each section (header, day, mission block, trip block, footer, etc.).
- Section visibility and order driven by the event's roadbook settings.
- Tailwind CSS via a pre-built CSS file embedded in the binary.

### Per-volunteer rendering
1. Gather the volunteer's data: assignments, trips they're on, default VS, etc.
2. Build a day-by-day timeline: each day is an ordered list of `{Mission | Trip | Idle}` blocks.
3. For mission blocks, look up co-staff (other assignments to the same mission).
4. For trip blocks, look up co-passengers and the driver's contact info.
5. Render the HTML.
6. Pass HTML to chromedp, which loads it in headless Chrome and prints to PDF.
7. Write PDF to `exports/<event>/roadbook_<last>_<first>.pdf`.

### Mini-map snippet
- For each day, render a small (e.g., 400x300) PNG of the map showing that day's VS and GPX, centered on the bounding box.
- Generated by chromedp loading a minimal map HTML page, then screenshotted.
- Or alternatively: server-side rendering with a Go map library (`go-staticmaps`). Easier but lower fidelity. **Recommended: chromedp for consistency** since chromedp is already a dependency.

### Master document
- Same per-volunteer renderer, looped over all volunteers, concatenated.
- Plus a grid section: a wide HTML table with VS as rows, time slots as columns. Each cell shows the volunteers and missions at that VS at that time.
- Generated as a separate PDF.

### Determinism
- No `time.Now()` calls inside templates.
- All asset paths are content-hashed (so caching at the chromedp layer is also deterministic).
- Fonts embedded.
- Same data → same bytes.

### Preview
- In-app preview: the same HTML rendered in an iframe. Coordinator can see what each volunteer's PDF will look like before generating.

## 6. CSV import

### Pipeline

```
upload → parse → column-mapping UI → validation → preview → commit
```

1. **Parse:** read as UTF-8 (with BOM detection), allow comma or semicolon delimiter (Google Sheets exports use either).
2. **Column mapping:** the app attempts auto-mapping based on header names (e.g., "Téléphone" → `phone`). Coordinator confirms or remaps in a UI.
3. **Validation:** each row is validated. Errors (missing required fields, malformed phone) are collected with row numbers.
4. **Upsert key choice:** coordinator picks `(first_name, last_name)` or `email`. The app uses this to match incoming rows against existing volunteers.
5. **Preview:** shows counts of new, updated, ambiguous (e.g., two existing volunteers match the key). Coordinator resolves ambiguities row-by-row.
6. **Commit:** atomic transaction. All inserts/updates succeed together or none do.

### Phone normalization
- Use `github.com/nyaruka/phonenumbers` (Go port of libphonenumber).
- The event's default country code (`FR` by default for the target user) is the fallback.
- Numbers stored as E.164.

### Errors
- Per-row errors are non-fatal: the import preview shows them, coordinator can choose to import valid rows only or fix the CSV and re-upload.

## 7. Event archive (export/import)

### Export
- Produces `event_<name>_<YYYYMMDD>.zip` containing:
  - `manifest.json` (event metadata + version).
  - `event.sql` (SQL dump of all rows pertaining to this event, with stable IDs).
  - `assets/` (uploaded logos, photos).
  - `gpx/` (uploaded GPX files).

### Import
- Validates manifest version.
- Inserts rows under a new event ID (so importing the same archive twice creates two events; no merge).
- Restores assets and GPX files to the right paths.

### Why not just `cp event.db`?
- The SQLite file may contain multiple events (the coordinator's list). A targeted archive lets them share or back up one event without exposing others.

## 8. Sub-race derivation

- Sub-races are not stored.
- They are computed as: for each race, the consecutive pairs in its ordered VS list.
- Each sub-race carries its own first-in / last-in window, derived from the two endpoint VS's times.
- Used for: timeline highlighting (selecting a sub-race highlights its GPX segment and shows its window), and for the GPX position interpolation between VS.

## 9. Open file format decisions (locked but worth recording)

- **GPX:** standard `.gpx` XML.
- **Logo:** PNG, max 5MB, recommended 800x300 transparent.
- **Photos:** JPEG or PNG, max 10MB each.
- **Map tiles:** Protomaps `.pmtiles` v3+.

## 10. Internationalization (deferred)

- Strings are externalized in a single locale file from day one (i18n-ready).
- v1 ships with French and English.
- Date formats follow the event's locale setting.
- This is mentioned here because retrofitting i18n is expensive; doing it from the start is cheap.
