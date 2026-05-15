<!--
Use this template for every PR. The harness CI run is required; failing
checks block merge. Cite the milestone you're working on so the reviewer
can map the change against its acceptance criteria.
-->

## Milestone

<!-- Which milestone does this PR move forward? -->
- [ ] M00 scaffolding
- [ ] M01 event + VS + map
- [ ] M02 races + GPX
- [ ] M03 volunteers + cars + CSV
- [ ] M04 missions + assignments
- [ ] M05 constraint engine
- [ ] M06 trips + travel matrix
- [ ] M07 timeline
- [ ] M08 roadbook
- [ ] M09 archive + polish
- [ ] Cross-cutting / harness / docs

Link the milestone file: [docs/milestones/`XX-name.md`](../docs/milestones/)

## What changed

<!-- Two or three bullets. WHAT and WHY, not HOW (the diff has HOW). -->
-
-

## Acceptance criteria touched

<!-- Copy the relevant items from the milestone's "Acceptance criteria" block. Tick the ones this PR satisfies. Leave unchecked ones for follow-up PRs. -->
- [ ]
- [ ]

## Locked-decision check

<!-- Confirm the change does not violate any locked decision. If it does, surface that explicitly. -->
- [ ] No `event_id` columns introduced (single-event-per-file).
- [ ] No `chromedp` / headless Chrome (pure-Go PDF).
- [ ] No ORS / OSRM client wired (haversine-only in v1).
- [ ] No authentication added (localhost-only in v1).
- [ ] No telemetry / external network calls.
- [ ] Feature-oriented backend layout preserved.
- [ ] FR-only strings (no English-language UI strings yet).

## Tests

<!-- Which tests did you add or change? Run `scripts/harness/check.sh` locally and confirm green. -->
- [ ] `scripts/harness/check.sh` passes locally
- [ ] Added tests for the new behavior
- [ ] Existing tests still pass

## STATE.md update

- [ ] `.harness/STATE.md` updated (status, ticked criteria, blockers, deferred questions)
