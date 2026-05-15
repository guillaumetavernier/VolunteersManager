# 01 — Vision

> ⚠️ **Partially superseded.** Several decisions in this document were revised during pre-implementation grilling. See [`milestones/README.md`](./milestones/README.md) ("Locked decisions" section) for the authoritative current call on: single event per SQLite file (no `event_id` columns), pure-Go PDF via maroto v2 (not chromedp/headless Chrome), feature-oriented Go layout, haversine-only routing in v1, no auth, FR-only i18n in v1, and others. Treat the locked-decisions list as binding when it conflicts with anything below.

## Problem

Multi-day trail races (and similar multi-day, geographically-distributed events) rely on dozens to hundreds of volunteers staffing aid stations, junctions, dangerous descents, and logistics points across a mountainous course. Coordinators plan all of this in spreadsheets, group chats, and paper. The result is fragile: people get stranded between checkpoints, cars are double-booked, volunteers receive incomplete or contradictory instructions, and last-minute reorganizations cascade through Excel cells nobody can fully trust.

## Product in one sentence

A self-hostable desktop-style web application that lets a single race coordinator plan volunteer assignments, vehicle trips, and per-volunteer roadbooks for a multi-day race — with map-based editing, constraint-aware warnings, and a printable PDF output for every volunteer.

## Who the user is (v1)

**One person.** The race coordinator (sometimes called the volunteer coordinator, or the on-the-ground coordinator — they're the same role, on different days). They use the app on a laptop, sometimes online with internet, sometimes offline at the venue.

There is **no volunteer-facing app** in v1. Volunteers receive their roadbook as a PDF (printed or emailed). Mid-race changes are communicated by phone/SMS.

This decision is load-bearing. Going single-user lets us skip authentication, multi-tenant data isolation, real-time sync, conflict resolution, and most of the operational complexity that dominates SaaS development. Roughly 60% of the engineering budget is preserved for the actually-interesting problem: the planning model.

## What success looks like

A coordinator can:

1. Create an event ("Trail des Aravis 2026") with multiple days and multiple races (100k, 50k, 25k).
2. Import their volunteer list from a CSV exported from Google Sheets.
3. Place Volunteer Spots (VS) on the map: aid stations, junctions, dangerous points, parking, logistics.
4. Define missions at each VS for each day (who is needed, what role, when).
5. Assign volunteers to missions with drag-and-drop, seeing live warnings when constraints are violated (double-booked, no transport, excessive duty hours).
6. Build vehicle trips that ferry volunteers between VS, with multi-stop drop-off routes.
7. Visualize the race day on a timeline: scrub time, see runners moving along the GPX, see volunteers and cars in position.
8. Generate a personalized PDF roadbook for every volunteer, and a master schedule for themselves.

Throughout, the app **warns but never blocks**. The coordinator's judgment is always final.

## Design principles

1. **Visual constraints, never enforced.** The app surfaces every problem it can detect but never refuses an action. Real coordinators have context the app doesn't.
2. **Self-hostable, local-first.** One binary, one SQLite file. Works on a laptop in a parking lot with no internet.
3. **Snapshot, not stateful.** The roadbook is a printed artifact. The app is a planning tool. Race-day reality is handled by phone calls, not by sync.
4. **Optional everything.** Every roadbook field, every map feature, every fancy view can be turned off. Coordinators have wildly different needs.
5. **Boring tech.** Go + SQLite + React. Nothing on the dependency list will be deprecated by 2030.
6. **Resist auto-magic.** No auto-assignment, no derived mission demand, no GPS tracking. These are exactly the features that destroy coordinator trust the first time they're wrong.

## Hard scope boundaries

These are **out** of v1, deliberately:

- Multi-user editing, real-time sync, authentication beyond a local password.
- Live GPS tracking of volunteers or runners.
- A mobile app for volunteers.
- Auto-assignment / solver-based scheduling.
- Mid-race roadbook re-issue / versioning.
- Cross-event volunteer roster.
- Event cloning.
- Milk-run trips with multiple pickup points (multi-drop-off from one origin is supported).
- Per-runner pace profiles (only front + tail per race).
- Auto-derived mission demand from GPX passage times.

See [`06-out-of-scope.md`](./06-out-of-scope.md) for full rationale.

## Anti-goals

The app should never:

- Block the coordinator from saving "invalid" data.
- Pretend to know more about the race than the coordinator.
- Auto-assign volunteers based on opaque heuristics.
- Require internet to function for core workflows.
- Make any data unrecoverable without an explicit confirmation.
