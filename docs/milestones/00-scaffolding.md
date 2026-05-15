# Milestone 00 — Scaffolding

## Goal

A single repo where `make dev` brings up a working dev loop (Go backend + Vite frontend), `make build` produces a single static binary with the frontend embedded, CI runs Go + TS tests on every push, and the first SQLite migration applies cleanly on startup. **No business logic yet.**

## Prerequisites

- Go 1.22+ installed.
- Node 20+ and pnpm (or npm) installed.
- A GitHub repository for CI.

## Scope (in)

- Go module + top-level layout.
- Vite + React + TS + the full frontend stack stub.
- `chi` HTTP server, `modernc.org/sqlite` driver, WAL mode.
- Migration runner (hand-rolled, ordered `.sql` files).
- Embedded frontend assets via `embed.FS`.
- `make dev`, `make build`, `make test` targets.
- GitHub Actions CI: Go build + test + vet + `staticcheck` + `golangci-lint`; Vite build + Vitest.
- An empty `t()` translation function on both sides.
- `.gitignore` for `node_modules/`, `web/dist/`, `*.db`, `tiles/`, `assets/`, `.DS_Store`, `.claude/worktrees/`.

## Scope (out)

- Any feature endpoints beyond `/healthz`.
- Tile serving (M01).
- Real i18n strings (the function exists, the dictionary is empty).

## Directory layout to create

```
.
├── Makefile
├── README.md                                   # one-page: what is this, how to run, link to docs/
├── go.mod / go.sum
├── cmd/volunteers/main.go                      # flag parsing, server boot, browser-open
├── internal/
│   ├── server/
│   │   ├── server.go                           # chi router, middleware, lifecycle
│   │   ├── embed.go                            # embed.FS for web/dist + serve handler
│   │   ├── middleware.go                       # request logging, panic recovery
│   │   └── server_test.go
│   ├── store/
│   │   ├── store.go                            # *sql.DB wrapper, WAL pragma
│   │   ├── migrate.go                          # ordered .sql file runner + .bak before apply
│   │   ├── migrate_test.go
│   │   └── migrations/
│   │       └── 0001_init.sql                   # empty events table (singleton row)
│   ├── domain/
│   │   └── types.go                            # ID type aliases used everywhere
│   ├── i18n/
│   │   ├── i18n.go                             # t(key, args...) lookup; fallback to key
│   │   ├── fr.json                             # empty {} for now
│   │   └── i18n_test.go
│   └── features/                               # empty for now; layers add subdirs
├── web/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── routes/
│       │   └── index.tsx                       # placeholder "It works" page
│       ├── components/ui/                      # shadcn/ui copies as they are added
│       ├── lib/
│       │   ├── api.ts                          # fetch wrapper + base URL
│       │   ├── i18n.ts                         # t() lookup; same key dict
│       │   └── queryClient.ts                  # TanStack Query client
│       ├── stores/                             # empty
│       └── styles/index.css                    # tailwind base
├── scripts/build.sh                            # vite build → go build with embed
└── .github/workflows/
    ├── ci.yml                                  # Go + TS tests on push/PR
    └── release.yml                             # cross-compile on tag (stub; activated in M09)
```

## Implementation steps

1. **Initialize Go module.** `go mod init github.com/<you>/volunteersmanager`. Add deps incrementally:
   ```
   github.com/go-chi/chi/v5
   modernc.org/sqlite
   ```
2. **Write `internal/store/store.go`.** Open the SQLite file, set `journal_mode=WAL`, `foreign_keys=ON`, `synchronous=NORMAL`. Expose `*sql.DB`.
3. **Write `internal/store/migrate.go`.** Read `migrations/*.sql` (embedded with `//go:embed`), apply in numeric order, write a `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)` table. Before applying any pending migration, copy the DB file to `<path>.bak`. Idempotent on re-run.
4. **Migration `0001_init.sql`.** Create a singleton `events` table:
   ```sql
   CREATE TABLE events (
       id            INTEGER PRIMARY KEY CHECK (id = 1),
       name          TEXT NOT NULL DEFAULT '',
       start_date    TEXT NOT NULL DEFAULT '',
       end_date      TEXT NOT NULL DEFAULT '',
       timezone      TEXT NOT NULL DEFAULT 'Europe/Paris',
       country_code  TEXT NOT NULL DEFAULT 'FR',
       settings      TEXT NOT NULL DEFAULT '{}',
       created_at    TEXT NOT NULL DEFAULT (datetime('now')),
       updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
   );
   ```
   Don't insert the row here; M01 does that via a first-run wizard.
5. **`internal/server/server.go`.** chi router. Mount `/healthz` returning `{"ok": true}`. Slog request logger. Panic recovery middleware. Read flags: `--port`, `--data-dir`, `--log-level`, `--bind` (default `127.0.0.1`).
6. **`internal/server/embed.go`.** `//go:embed web/dist` is mounted; not-found falls back to `index.html` for SPA routing.
7. **`cmd/volunteers/main.go`.** Parse flags, init store, run migrations, build server, listen, and `open` the default browser (a small helper that runs `open` / `xdg-open` / `start` based on OS).
8. **Vite frontend scaffold.** `pnpm create vite web --template react-ts`. Install: `react-router` is unused — install `@tanstack/react-router`, `@tanstack/react-query`, `zustand`, `tailwindcss`, `@dnd-kit/core`, `react-hook-form`, `zod`, `@hookform/resolvers`, `maplibre-gl`, `lucide-react`. Configure Tailwind. Add the placeholder route.
9. **shadcn/ui setup.** Initialize per their docs in `web/src/components/ui/`, but only generate components as features need them (start with none).
10. **`web/src/lib/api.ts`** — `apiFetch<T>(path, opts)` wrapper using the same base URL as the page (works behind a reverse proxy).
11. **`web/src/lib/i18n.ts`** — `t(key, args)` returns key for now; will load `fr.json` once any string exists.
12. **`scripts/build.sh`** — `pnpm --filter web build && go build -o ./dist/volunteers ./cmd/volunteers`.
13. **`Makefile`**:
    - `make dev` — runs `vite dev` and `go run ./cmd/volunteers --frontend-proxy=http://localhost:5173` in parallel (the server proxies `/` to vite during dev).
    - `make build`, `make test`, `make lint`, `make tidy`.
14. **GitHub Actions `ci.yml`**:
    - matrix: ubuntu-latest, macos-latest.
    - steps: setup-go, setup-node + pnpm, `go test ./...`, `go vet ./...`, `staticcheck`, `golangci-lint run`, `pnpm test`, `pnpm build`.
15. **CLAUDE.md at repo root** — short conventions file pointing at `docs/` and `docs/milestones/`.

## Data model deltas

- `events` table (singleton, row enforced by `CHECK (id = 1)`).
- `schema_migrations` table.

## API surface

- `GET /healthz` → `{"ok": true}`.
- Static file handler for `/` and embedded SPA assets.

## Frontend surface

- One placeholder route. Imports the full stack so deps don't drift, but renders only `<h1>VolunteersManager</h1>`.

## Tests

- `migrate_test.go` — applies all migrations against an in-memory SQLite, idempotent re-run, version-skip is rejected.
- `server_test.go` — `/healthz` returns 200.
- `i18n_test.go` — `t("missing.key")` returns `"missing.key"`; with FR dict it returns the value.
- Vitest smoke test on `lib/api.ts`.
- Playwright is set up but no specs yet.

## Acceptance criteria

- [ ] `make dev` opens the browser to a placeholder page served at `http://localhost:8080` proxied to Vite.
- [ ] `make build` produces a single static binary; running it from a fresh directory creates `event.db`, applies migrations, serves the SPA.
- [ ] `go test ./...` green; `pnpm test` green.
- [ ] CI green on a clean push.
- [ ] Migration runner backs up `event.db` to `event.db.bak` before applying anything pending.

## References

- [`../03-architecture.md`](../03-architecture.md) §"Repository layout", §"Tech stack".
- [`../README.md`](../README.md) §"Conventions".
