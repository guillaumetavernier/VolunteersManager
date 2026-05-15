# 06 — Out of Scope for v1

> ℹ️ **Mostly still authoritative**, but cross-check [`milestones/README.md`](./milestones/README.md) ("Locked decisions") — a handful of items here (auth, routing API, PDF stack, multi-event) have been narrowed further in v1 than this document originally implied.

A list of things this app **does not do**, with explicit rationale. The purpose of this document is to resist scope creep during build and to give a future contributor (or future-you) a clear understanding of *why* each line was drawn.

## Operational features

### No live GPS tracking
Tracking real-time positions of volunteers, cars, or runners would require a mobile app on every volunteer's phone, server-side ingestion of location streams, and network reliability the venue often lacks. This is a different product. Coordinator nicknamed this "v42."

### No mobile app for volunteers
The roadbook is the volunteer's interface. PDF, printed or emailed. Adding a volunteer-facing app means authentication, push notifications, real-time sync, and a separate UI codebase. Multiplies engineering by ~3x for marginal benefit at small/medium race scale.

### No mid-race roadbook re-issue / versioning
If a volunteer cancels at 06:00 on day 2 and reassignments happen, the coordinator calls the affected people. Building a "v2 roadbook delivered automatically" feature requires real-time sync, a delivery channel (SMS / email / push), and conflict resolution. Out.

### No real-time / multi-user editing
The app is single-user. Two coordinators editing simultaneously is not supported. This avoids the entire concurrent-edit problem: no CRDTs, no operational transforms, no last-write-wins drama, no presence indicators.

### No authentication beyond local trust
The app binds to `127.0.0.1` by default. Coordinator's filesystem security is the boundary. VPS deployments are expected to put basic-auth at the reverse proxy. Building proper auth in v1 is wasted effort.

## Scheduling intelligence

### No auto-assignment / solver
We do not run an optimizer to assign volunteers to missions. Two reasons:
1. The data needed to score assignments well (volunteer preferences, soft skills, social dynamics, "Marie is good at the tricky junction") is not in the system and never will be.
2. The first time the solver makes a "wrong" decision, coordinator trust evaporates and they revert to spreadsheets.

We provide assisted filtering (the volunteer dropdown for a mission is filtered to compatible candidates) but no automatic assignment.

### No auto-derived mission demand from GPX
The app does not say "you need 3 staff at VS-3 from 09:40 to 11:20 because that's when runners pass." The coordinator defines missions manually. The timeline helps them visually verify their definitions cover the runner-passage windows.

### No per-runner pace profiles
Only front-runner and last-runner pace per race. No middle-of-pack modeling, no per-bib pacing, no live pace updates. Too much complexity for unclear gain.

### No wave starts or staggered cutoffs
A race has one start time. If your race uses wave starts (e.g., every 5 minutes), model it as multiple race entities or use the first wave's start. Proper wave-start modeling is a v2 conversation.

## Data and integration

### No cross-event volunteer roster
A volunteer in "Trail des Aravis 2026" is a different record from "the same person" in "Trail des Aravis 2027." Coordinator must re-import via CSV.

Rationale: keeps the data model simple and the per-event blast radius contained. The CSV import-export pair mitigates the re-entry cost.

### No event cloning
No "clone 2026 as 2027" feature. Re-import VS via CSV (we'll add a VS-CSV format in v1) or re-create. v2 if there's clear demand.

### No Google Sheets API integration
CSV import only. Google Sheets exports to CSV trivially; we don't need OAuth and a Sheets-API maintenance burden.

### No email delivery of roadbooks
The app produces PDF files. Coordinator distributes them however they want (email, drive share, print). No SMTP, no SendGrid, no mail queue.

### No calendar export (.ics)
Each volunteer could in principle want a calendar feed of their assignments. v2.

## Trip / transport features

### No milk-run trips with multiple pickup points
A single trip can drop different volunteers at different VS (multi-drop-off from one origin = Shape A). It cannot do "pick up at VS-A, drop at VS-B, pick up at VS-C, drop at VS-D" mixed pickups along a route (Shape B).

Rationale: Shape B is rare in practice; if needed, model it as two consecutive trips.

The data model (ordered stops with `board` + `alight` lists per stop) is *capable* of representing Shape B if a future v2 decides to allow it — we just don't expose it in the UI.

### No trip scheduling optimization
No "auto-build optimal trips from current transport needs." The coordinator builds trips by hand. The app provides the transport-needs list and validates per-leg capacity.

### No multi-driver swaps within a trip
One driver per trip. If the driver needs to change, that's two trips.

## Roadbook features

### No editable HTML template
Coordinator customizes via toggles, colors, and a logo. They cannot edit the underlying HTML/CSS. Templates are owned by the app. v2 can add a "advanced" template editor for power users.

### No per-volunteer roadbook customization
The same template renders all roadbooks. The only per-volunteer custom field is the "customizable message" string. v2 may add more.

### No mid-race delta export
Once distributed, the roadbook is the volunteer's snapshot. Re-printing a single volunteer's PDF after a change is supported; producing a "diff document" highlighting what changed is not.

## UI / UX

### No undo / redo system
Mutations are persisted immediately. No client-side action history. Mistakes are corrected by re-editing; deletions are confirmed.

Rationale: undo is non-trivial across a relational data model, and the cost of mistakes here is low (data is local, exports are easy, backups are file copies).

### No keyboard shortcuts (initially)
v1.5 territory. Build the core flows first.

### No dark mode
v1.5 territory. Tailwind makes this trivial to add later.

### No accessibility audit
We don't actively work against accessibility (semantic HTML, ARIA where shadcn/ui provides it, keyboard navigation where possible). But we are not WCAG-AA-certified and we don't claim to be. v2.

### No multi-language UI beyond FR and EN
French + English shipped. Other languages welcome via translation files but not roadmapped.

## Tech and infrastructure

### No Postgres
SQLite is the database. Period. The moment we need Postgres-only features (true concurrent writes, sophisticated queries, replication) we've outgrown the single-user model and need to rethink the product, not just the DB.

### No background job queue
Roadbook generation is synchronous: the coordinator clicks, the app generates, the coordinator waits 30-60 seconds. No queues, no workers, no Redis.

### No telemetry / analytics
The app never phones home. Coordinators are not tracked. There is no usage data collected. Errors are logged locally only.

### No automatic updates
Coordinator downloads new binaries from GitHub Releases manually. We don't ship an auto-updater (code-signing cost, security surface).

### No plugin system
Not extensible. Features come from the codebase. Forks are encouraged for unusual needs.

## What this list means for the build

When in doubt during implementation: **if the proposed feature is on this list, don't build it.** If it's not on this list but feels speculative, add it to [`07-open-questions.md`](./07-open-questions.md) for deliberate consideration rather than silently expanding scope.
