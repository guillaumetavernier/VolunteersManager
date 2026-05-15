# 02 — Functional Specification

> ⚠️ **Partially superseded.** Several decisions in this document were revised during pre-implementation grilling. See [`milestones/README.md`](./milestones/README.md) ("Locked decisions" section) for the authoritative current call on: single event per SQLite file (replaces "multiple events in the app, but each self-contained" in §1), and the implementation-shape choices that shape §7 (roadbook). Treat the locked-decisions list as binding when it conflicts with anything below.

This document describes *what* the app does, from the coordinator's perspective. Implementation details are in [`03-architecture.md`](./03-architecture.md) and [`04-design.md`](./04-design.md).

## 1. Top-level concepts

### Event
The top-level container. An Event has a name, a date range, and contains everything else: volunteers, cars, VS, races, missions, assignments, trips, and roadbook settings. The coordinator can have multiple events in the app (a list), but each is self-contained — **no data is shared across events**.

### Race
A Race lives inside an Event. An Event has 1..N races (e.g., "100k", "50k", "25k"). Each race has its own GPX file(s) (one per day if multi-day) and an ordered list of VS that lie along its route.

### Sub-race
A *derived* segment between two consecutive VS in a race's ordered route. Not stored. Used for:
- Visualization (highlighting a leg of the race on the map).
- Per-segment runner-passage timing (first-in / last-in at each VS along the route).

### Volunteer Spot (VS)
A named, geographically-fixed point. Has a name, GPS coordinates, optional notes, optional photo, optional what3words code. **Uniform type** — no distinction between "aid station," "junction," "parking," etc. A VS may or may not lie on a race's route; that's a property of the race, not the VS.

### Mission
A unit of work to be staffed. Attached to a VS. Defined as `(VS, day, start_time, end_time, role_type, headcount_needed)`. Optionally tagged with one or more races (filter only — does not affect scheduling).

### Volunteer
A person, scoped to one Event. Fields: first name, last name, phone (mandatory), email, optional emergency contact (name + phone), optional general info, optional customizable message, role-type(s) they can fill, availability windows, default VS (their "home base"), `can_drive` flag + optional license type, optional notes.

### Car
A vehicle, scoped to one Event. Fields: name, seat count, optional default driver.

### Assignment
A link: `(volunteer, mission)`. Created manually by the coordinator. Constraint warnings (see §4) are visual only — never block.

### Trip
A vehicle journey: `(driver, car, day, ordered list of stops)`. Each stop is `(VS, time, board_list, alight_list)`. Trips ferry volunteers between VS when their missions require travel. **Multi-stop drop-off from a single origin is supported** (Shape A): one trip can drop different volunteers at different VS along an ordered route. Mode: drive or walk.

## 2. Coordinator workflow

The expected flow through the app, in roughly this order. The app does not enforce order — the coordinator can jump around freely.

### 2.1 Set up the event
- Create an Event (name, start date, end date, number of days).
- Configure roadbook settings (logo, primary color, header text, footer text, section toggles, section order, sponsor strip). Settings can be edited anytime.

### 2.2 Define the geography
- Add VS by clicking on the map or entering coordinates. Each VS gets a name and optional metadata.
- The app shows VS as markers on a map (MapLibre + Protomaps tiles).

### 2.3 Define the races
- For each race in the Event, upload one or more GPX files (one per day for multi-day races).
- Specify each race's ordered list of VS along its route by selecting from existing VS.
- For each (race, VS-in-route) pair, the app auto-computes first-in and last-in times from GPX-projected distance + a default pace. The coordinator can override any value individually.
- Front-runner pace and last-runner pace are configurable per race (used to seed the auto-computed times).

### 2.4 Populate volunteers and cars
- Import volunteers via CSV (template provided; see §6).
- Or add individually via a form.
- Add cars individually.

### 2.5 Define missions
- For each VS, create missions: pick a day, a time window, a role-type, and a headcount.
- The map and the timeline both show mission demand.

### 2.6 Assign volunteers to missions
- Drag-and-drop, or click-to-assign. The volunteer dropdown is filtered to those whose role-type matches the mission and who are not already booked at that time.
- The app surfaces constraint warnings (see §4).

### 2.7 Build trips
- For each detected transport need (a volunteer's consecutive missions are at different VS), the app shows a "transport need" item.
- The coordinator creates a trip: pick driver, car, day, then add ordered stops. At each stop, pick who boards and who alights from filtered lists.
- Per-leg travel times auto-fill from the routing matrix. Each leg's time is independently overridable.
- Mode (drive/walk) is set per trip.

### 2.8 Validate on the timeline
- Open the timeline view. Use slider or auto-play.
- See runners (per-race front + tail markers) animate along the GPX.
- See volunteer positions (at-mission or in-transit) and car positions.
- Visually verify that VS are staffed when runners are there.

### 2.9 Generate roadbooks
- Click "Generate roadbooks." The app produces one PDF per volunteer + a combined master PDF.
- Distribute PDFs by email or print.
- Regenerate at any time after data changes.

## 3. Constraint warnings

The app continuously checks for issues and surfaces them as warnings, never blocking actions. The coordinator sees:

- A **global issue count** in the header ("23 issues").
- A **per-entity badge** on the affected items (volunteer, mission, trip).
- A **dedicated "issues" panel** listing all current warnings with one-click navigation to the relevant entity.

### 3.1 Assignment-level warnings
- **Double-booking:** volunteer assigned to two overlapping missions.
- **Role mismatch:** volunteer's role-types don't include the mission's required role.
- **Availability violation:** mission falls outside the volunteer's stated availability.
- **Excessive duty:** total assigned hours per day exceed a configurable threshold (default 10h).
- **No-break:** no gap between assigned missions exceeds another threshold (default 0; warn if no break for >6h).

### 3.2 Transport warnings
- **Stranded volunteer:** consecutive missions at different VS with no trip carrying them.
- **Insufficient travel time:** gap between consecutive missions is less than the routing-matrix travel time + a buffer.
- **Car capacity exceeded:** at any leg of a trip, passenger count > car seats.
- **Driver double-booked:** driver is on a mission during their own trip.
- **Passenger double-booked:** a volunteer is in two trips or a trip + mission simultaneously.
- **Boarding logic error:** a volunteer alights before they board.

### 3.3 Mission-level warnings
- **Understaffed:** assignments at a mission < `headcount_needed`.
- **Overstaffed:** assignments > `headcount_needed` (informational).

### 3.4 Volunteer-level warnings
- **Unassigned:** volunteer has no assignments in the event (informational).
- **Missing critical info:** no phone number on a volunteer with assignments.

## 4. Map view

- MapLibre GL JS rendering Protomaps `.pmtiles` (offline-capable; see [`03-architecture.md`](./03-architecture.md)).
- Layers (each toggleable):
  - VS markers (clickable for details).
  - GPX polylines, one color per race.
  - Trip routes (when a trip is selected or hovered).
  - Volunteer / car positions (when timeline is active).
- Click on the map to add a VS.
- Click on a VS to see/edit its missions and assigned volunteers.

## 5. Timeline view

- Horizontal time axis spanning the event's days.
- Vertical layers:
  - Per-race front-runner and last-runner markers, animating along their respective GPX.
  - Mission bars (one row per VS, showing mission windows colored by staffing status).
  - Trip bars (showing departure → arrival across legs).
- Scrubber (slider) + auto-play button + play speed control.
- Race toggles, day toggles, sub-race highlighting.
- Volunteer and car positions on the map update in sync with the timeline cursor.

## 6. CSV import / export

### Import
- Coordinator uploads a CSV.
- App shows a column-mapping screen: detected columns → known fields. Custom column names supported.
- Coordinator picks the upsert key: `(first_name, last_name)` or `email`.
- App shows a preview: "23 new, 12 updated, 2 ambiguous matches needing review."
- Coordinator confirms; app commits.

### Canonical schema
Required: `first_name`, `last_name`, `phone`.
Optional: `email`, `emergency_contact_name`, `emergency_contact_phone`, `general_info`, `customizable_message`, `role_type` (comma-separated for multiple), `default_vs_name` (must match an existing VS name in the event, or empty), `availability_days` (comma-separated day numbers), `can_drive` (boolean), `license_type`, `notes`.

Unknown columns: ignored with a warning. Missing optional columns: left empty. Phone numbers normalized to E.164 (with the event's default country code as a fallback for unprefixed numbers).

### Export
- Same canonical schema, one row per volunteer.
- Downloadable as `volunteers.csv`.

### Template download
- Available from the import screen: a blank CSV with headers and one example row.

## 7. Roadbook generation

### Output
- **One PDF per volunteer.** Filename: `roadbook_<last>_<first>.pdf`. Contains only that volunteer's schedule and assignments.
- **One master PDF for the coordinator.** Filename: `master_<event_name>.pdf`. Contains all volunteers (one section per volunteer) plus a grid view (VS × time).

### Per-volunteer content (each block is optional, governed by event-level toggles)
- **Header:** volunteer's name, role-type(s), default VS, coordinator's race-day phone, event name + dates.
- **Per-day timeline (vertical):**
  - Mission blocks: time window, VS name, role, list of co-staff (name + role + phone for each).
  - Trip blocks: board time, board VS, driver name + phone, car name, alight time, alight VS, list of co-passengers (name + role + phone).
  - Idle blocks: explicit "free time at VS-X from HH:MM to HH:MM" to fill gaps.
  - Optional mini-map snippet for the day, showing that day's VS and GPX.
- **Footer:** full VS list (name + coordinates + what3words/plus-codes).
- **Coordinator-defined header text** (e.g., "Welcome to the race — emergency line 06 XX XX XX XX").
- **Coordinator-defined footer text** (e.g., safety/legal disclaimer).
- **Personalized message** (per-volunteer field, e.g., "Thanks for your 5th year, Pierre!").
- **Volunteer's emergency contact** (only printed on their own roadbook, never on others').
- **General info** (e.g., "vegetarian," "allergic to bees").

### Co-staff and co-passenger disclosure
- Only **name + role + phone**. No email, no address, no emergency contact.
- Applies on both mission co-staff lists and trip co-passenger lists.

### Master document content
- Per-volunteer sections (same as per-volunteer PDF).
- A **grid sheet**: VS × time, with cell contents showing assigned volunteers and missions. Used by the coordinator on race day as their command paper.

### Customization
Per-event settings:
- Logo upload (image).
- Primary color (hex).
- Per-section visibility toggles for every optional block above.
- Reorderable section list (drag-and-drop).
- Global header text (multi-line).
- Global footer text (multi-line).
- Optional sponsor strip (image).

### Determinism
Same data → same PDF, byte-for-byte. No timestamps in output, no random IDs. Coordinator can diff two regenerations.

## 8. Backup and sharing

- **Export event:** produces a `.zip` containing the event's SQLite tables, GPX files, uploaded images, and a manifest. Portable.
- **Import event:** loads a `.zip` into the current app instance.
- This is the only sharing mechanism. No cloud sync.

## 9. Settings (per-event)

- Default timezone (informational; everything is stored in event-local time).
- Default country code (for phone normalization).
- Default volunteer working-hour thresholds (for warnings).
- Default driving and walking speeds (for travel-time auto-fill).
- Roadbook settings (see §7).
