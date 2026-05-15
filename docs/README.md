# Volunteer Coordination App — Documentation

This directory contains the complete specification for a self-hosted application that helps a single race coordinator plan volunteer logistics for multi-day races (trail running, ultra, etc.).

## How to read these docs (for Claude Code or any contributor)

Read in this order. Each builds on the previous.

1. **[`01-vision.md`](./01-vision.md)** — What the product is, who it's for, the boundaries of v1. Read this first; it explains *why* every other decision was made.
2. **[`02-spec.md`](./02-spec.md)** — Functional specification. Entities, behaviors, user-facing features. The "what."
3. **[`03-architecture.md`](./03-architecture.md)** — System architecture and tech stack. How the code is organized, how data flows, deployment shape. The "how."
4. **[`04-design.md`](./04-design.md)** — Detailed design decisions for the harder subsystems: constraint engine, trip editor, timeline, routing, roadbook generation.
5. **[`05-data-model.md`](./05-data-model.md)** — Concrete data model: entities, relationships, SQLite schema sketch.
6. **[`06-out-of-scope.md`](./06-out-of-scope.md)** — Explicit list of things v1 does *not* do, with rationale. Important for resisting scope creep.
7. **[`07-open-questions.md`](./07-open-questions.md)** — Assumptions to validate with real organizers before deep build, and decisions deferred to v2+.

## Conventions

- "Coordinator" = the single human user of the app. Same person as "organizer."
- "VS" = Volunteer Spot — a named point on the map that can host missions.
- "Race" lives inside an "Event." An Event can have multiple Races (different distances).
- All times are stored in the event's local timezone. No multi-timezone support in v1.
- Currency: none. The app has no pricing/billing concepts.
