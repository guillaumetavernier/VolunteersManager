# VolunteersManager

A planned self-hosted single-user web app (Go + SQLite + React) for race
coordinators planning volunteer logistics for multi-day trail races.

> v1 is single-tenant, single-event, FR-only, bound to `127.0.0.1`. There is
> no authentication, no telemetry, and no cloud dependency.

## Run

Prerequisites: Go ≥ 1.25, Node 20, pnpm.

```sh
# install web deps once
pnpm --filter ./web install

# dev loop — backend on :8080, Vite on :5173 (proxied through the backend)
make dev

# single static binary with frontend embedded
make build
./dist/volunteers
```

`./dist/volunteers` creates `event.db` in the current directory on first
boot, applies migrations, copies the prior file to `event.db.bak` before
applying anything pending, and serves the SPA.

## Tests

```sh
make test       # go test ./... + vitest
make typecheck  # tsc --noEmit
make check      # full harness: lint_docs + go test + pnpm test
```

## Repository layout

See [`docs/`](./docs/) for the full specification and the per-milestone
implementation plan. The session conventions live in
[`CLAUDE.md`](./CLAUDE.md).
