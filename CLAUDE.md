# CLAUDE.md — Conventions for Claude sessions on this repository

This file is loaded into every Claude Code session that opens this repo. Read it before any other action.

## What this project is

VolunteersManager is a planned self-hosted single-user web app (Go + SQLite + React) for race coordinators planning volunteer logistics for multi-day trail races. **There is no code yet** — the repo currently contains documentation and a small harness. The next agent to touch this repo is expected to start implementation at Milestone 00.

## Read order, every session

1. **[`docs/milestones/README.md`](./docs/milestones/README.md)** — milestone index and the **Locked decisions** list. These decisions override `docs/01-07` where they conflict.
2. **[`.harness/STATE.md`](./.harness/STATE.md)** — current milestone, status of each acceptance criterion, known open questions deferred from earlier passes.
3. **The active milestone file** — e.g., `docs/milestones/00-scaffolding.md`. Read it end-to-end before any code edit.

The original spec docs (`docs/01-vision.md` through `docs/07-open-questions.md`) are partially superseded; each carries a banner. Use them for conceptual context, not for column-level DDL or stack decisions.

## How to work on a milestone

1. **Confirm the milestone.** Open `.harness/STATE.md`; verify which milestone is `in_progress`. If none is, ask the user before starting.
2. **Read the milestone file end-to-end.** Pay particular attention to:
   - **Scope (in)** and **Scope (out)** — the latter exists to prevent scope creep.
   - **Prerequisites** — if an earlier milestone is incomplete, stop and surface it.
   - **Acceptance criteria** — the only definition of "done."
3. **Work top-to-bottom through Implementation steps.** Don't reorder unless you can articulate why.
4. **Run the harness frequently.** `./scripts/harness/check.sh` is fast and catches doc/code drift early.
5. **Tick acceptance criteria as they pass.** Edit `.harness/STATE.md` (the source of truth for milestone status); don't rely on memory.
6. **Open a PR when all acceptance criteria pass.** Use the PR template; cite the milestone; link the criteria.

## Hard rules

These are non-negotiable. If you find yourself wanting to break one, stop and surface it to the user before acting.

- **No `event_id` columns anywhere.** Single event per SQLite file is locked.
- **No `chromedp` / headless Chrome.** PDF stack is maroto v2 + go-staticmaps. The roadbook mini-map has a known rasterization risk (see M08 risks) — if it bites, the recommendation is to ship v1 with the mini-map disabled, not to reintroduce Chrome.
- **No ORS / OSRM in v1.** Travel-time matrix is haversine-only; the `source` column reserves space for a later integration.
- **No authentication in v1.** Bind to `127.0.0.1`. Reverse-proxy basic-auth is the answer for VPS deployments.
- **No telemetry, no phone-home, ever.** Explicitly forbidden by `docs/06-out-of-scope.md`.
- **Backend layout is feature-oriented**: `internal/features/<resource>/` for CRUD; `internal/domain/constraints` cross-cutting; `internal/{gpx,routing,roadbook,csv,archive,store,server,i18n}` for subsystems. The horizontal layout sketched in `docs/03-architecture.md` is not the one we use.
- **Frontend stack is full from day one** (per M00): React + Vite + TS + TanStack Router/Query + Zustand + Tailwind + shadcn/ui (vendored) + dnd-kit + RHF + Zod + MapLibre GL JS + lucide-react.
- **i18n is FR-only in v1.** The `t()` API exists so EN is a later mechanical pass — don't author EN strings now.
- **Comprehensive tests** — every handler, every store query, every component covered. Table-driven constraints. Golden-file PDFs. Playwright e2e on critical flows.
- **Determinism in PDFs.** Same input data → byte-identical bytes. No `time.Now()`, no random IDs, fonts embedded.

If a rule seems wrong for the situation, the answer is to surface it, not to bypass it.

## How the harness works

`scripts/harness/check.sh` is the single entry point. It runs (in order):

1. **`lint_docs.py`** — doc invariants (link integrity, forbidden-pattern leakage, migration sequence, milestone index, supersession banners, acceptance-criteria presence, STATE.md alignment).
2. **`go vet` + `go test`** — once `go.mod` exists.
3. **`pnpm typecheck` + `pnpm test`** — once `web/package.json` exists.

The same script runs:
- locally before commit (recommended; not yet a git hook),
- in CI via `.github/workflows/docs.yml`,
- in the Claude Code Stop hook (`.claude/settings.json`), so the agent is told before it declares done.

When you add a new invariant the harness should enforce, add a `check_*` function to `scripts/harness/lint_docs.py` and register it in `CHECKS`. The script's contract: fast, deterministic, no network, no clocks, one failure mode per stage.

## Working style for this repo

- **Boring + correct + uncompromisingly simple over clever.** The product values this; the code should too.
- **Default to writing no comments.** Names earn their keep. Add comments only when the *why* is non-obvious.
- **Default to keeping it small.** Don't add abstractions, fallbacks, or feature flags for hypothetical futures.
- **When tests fail, fix the root cause.** Don't skip with `--no-verify`. Don't relax assertions to make tests pass.
- **Worktrees for non-trivial work.** This repo's history is small; isolating in `.claude/worktrees/<name>` keeps `main` clean.
- **Reference the milestone in commits.** `feat(m04): drag-drop assignment UI` or `fix(m05): role_mismatch case sensitivity`.

## When in doubt

Open `docs/milestones/README.md` → "Locked decisions". If your situation isn't covered, raise it to the user before guessing.
