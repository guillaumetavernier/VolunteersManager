# 03 — Architecture

## High-level shape

A **single-binary application** that runs locally on the coordinator's laptop (or on a small VPS for the self-hosting-inclined). The binary serves a web UI on `localhost` and stores all data in a SQLite file next to itself.

```
┌────────────────────────────────────────────────────────┐
│             Coordinator's browser (any modern)         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ React + TypeScript SPA                           │  │
│  │  - MapLibre GL (vector tiles via Protomaps)      │  │
│  │  - Timeline / scrubber (hand-rolled)             │  │
│  │  - dnd-kit (assignment drag-drop)                │  │
│  │  - TanStack Query + Router                       │  │
│  │  - Tailwind + shadcn/ui                          │  │
│  └──────────────────────────────────────────────────┘  │
│                          ▲                             │
│            HTTP (localhost) + JSON REST                │
│                          ▼                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Go binary (one file per OS/arch)                 │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │ HTTP server (chi or stdlib)              │    │  │
│  │  │ Embedded frontend assets (embed.FS)      │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │ Business logic                           │    │  │
│  │  │  - Assignment / constraint engine        │    │  │
│  │  │  - Trip validation                       │    │  │
│  │  │  - GPX parsing + projection              │    │  │
│  │  │  - Routing matrix (cache + API + override)│   │  │
│  │  │  - Roadbook generation (HTML → PDF)      │    │  │
│  │  │  - CSV import / export                   │    │  │
│  │  │  - Event archive zip                     │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │ Persistence (modernc.org/sqlite, WAL)    │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  │  ┌──────────────────────────────────────────┐    │  │
│  │  │ Subprocess: chromedp (headless Chrome)   │    │  │
│  │  │ for HTML → PDF rendering                 │    │  │
│  │  └──────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                             │
│                          ▼                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Filesystem next to binary:                       │  │
│  │  - event.db (SQLite, WAL mode)                   │  │
│  │  - tiles/ (Protomaps .pmtiles files)             │  │
│  │  - assets/ (uploaded logos, photos, GPX files)   │  │
│  │  - exports/ (generated PDFs, zip archives)       │  │
│  └──────────────────────────────────────────────────┘  │
│                          │                             │
│                          ▼  (optional, network)        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ External: OpenRouteService or self-hosted OSRM   │  │
│  │  - Travel-time matrix queries                    │  │
│  │  - Graceful fallback if unreachable              │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

## Tech stack

### Backend
- **Language:** Go (1.22+).
- **HTTP:** `net/http` with `chi` router (lightweight, idiomatic).
- **SQLite driver:** `modernc.org/sqlite` (pure Go, no CGO — single binary cross-compile works trivially).
- **Frontend embedding:** Go's `embed.FS` includes the built frontend assets in the binary.
- **GPX parsing:** `github.com/tkrajina/gpxgo`.
- **Geometry:** `github.com/paulmach/orb` (haversine, nearest-point-on-line for VS-to-GPX projection).
- **PDF generation:** `github.com/chromedp/chromedp` — controls a headless Chrome subprocess. (Chrome itself must be installed on the host. Document this as a dependency.)
- **CSV:** Go stdlib `encoding/csv` + custom upsert logic.
- **Logging:** `log/slog` (stdlib structured logging).
- **Testing:** stdlib `testing` + `testify` for assertions.

### Frontend
- **Build tool:** Vite.
- **Language:** TypeScript.
- **Framework:** React 18+.
- **Routing:** TanStack Router (type-safe) or React Router.
- **Server state:** TanStack Query (mandatory — handles caching, mutations, optimistic updates).
- **Local state:** React `useState` + `useContext`, escalating to **Zustand** for assignment / timeline state.
- **Forms:** React Hook Form + Zod for validation.
- **Map:** MapLibre GL JS — used directly, no React wrapper.
- **Drag-and-drop:** `@dnd-kit/core`.
- **Styling:** Tailwind CSS.
- **Components:** shadcn/ui (copy-pasted into the repo, owned, no NPM dependency).
- **Icons:** `lucide-react`.
- **Testing:** Vitest (unit) + Playwright (e2e on critical flows).

### Map tiles
- **Protomaps `.pmtiles`** served by the Go binary from disk.
- A regional `.pmtiles` file (a few hundred MB for Europe) is downloaded on first run, or shipped with the binary for offline-first deployments.
- Fully offline-capable — no tile servers, no API keys.

### Routing API
- **Primary:** OpenRouteService (free tier, 2000 requests/day) or self-hosted OSRM.
- The app caches the full N×N travel-time matrix per event in SQLite. Cache is invalidated when a VS moves or is added.
- **Fallback:** if the API is unreachable or rate-limited, the app uses haversine distance × configured average speed. The UI clearly indicates which travel times are auto-routed vs. fallback vs. manually overridden.
- **Manual override** on any pair is sticky and takes precedence over both auto-routed and fallback.

### PDF generation
- **HTML/CSS templates** rendered server-side with Go's `html/template`.
- Templates feed into a headless Chrome subprocess via `chromedp`.
- Same templates power the in-app preview (rendered as HTML in an iframe).
- Output is byte-deterministic: no timestamps in PDFs, no random IDs, fonts embedded.

## Repository layout

```
/
├── README.md
├── docs/                       # This directory.
├── cmd/
│   └── volunteers/
│       └── main.go             # Entry point: parse flags, start server, open browser.
├── internal/
│   ├── api/                    # HTTP handlers (one file per resource).
│   ├── domain/                 # Entities + business logic.
│   │   ├── event.go
│   │   ├── race.go
│   │   ├── vs.go
│   │   ├── mission.go
│   │   ├── volunteer.go
│   │   ├── car.go
│   │   ├── assignment.go
│   │   ├── trip.go
│   │   └── constraints.go      # The constraint engine.
│   ├── store/                  # SQLite persistence.
│   │   ├── migrations/         # SQL migration files (golang-migrate format).
│   │   └── *.go                # One file per entity's queries.
│   ├── gpx/                    # GPX parsing + VS projection.
│   ├── routing/                # ORS/OSRM client + cache + fallback.
│   ├── roadbook/               # Template rendering + chromedp PDF.
│   │   └── templates/          # HTML templates.
│   ├── csv/                    # Import / export.
│   ├── archive/                # Event zip export / import.
│   └── server/                 # HTTP server setup, embed.FS mount.
├── web/                        # Frontend source (separate workspace).
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── routes/             # One file per page.
│   │   ├── components/         # Shared UI components.
│   │   ├── features/           # Feature-bound code.
│   │   │   ├── map/
│   │   │   ├── timeline/
│   │   │   ├── assignments/
│   │   │   ├── trips/
│   │   │   ├── volunteers/
│   │   │   └── roadbook/
│   │   ├── api/                # TanStack Query hooks for each endpoint.
│   │   ├── stores/             # Zustand stores.
│   │   └── lib/                # Utilities.
│   └── dist/                   # Build output, embedded by Go.
├── tiles/                      # Protomaps .pmtiles files (gitignored, downloaded).
└── scripts/
    └── build.sh                # Builds frontend, then Go binary for each target.
```

## Data flow

### Read path (typical)
1. Browser fetches `localhost:8080/`, gets `index.html` from embedded assets.
2. SPA boots, fetches `/api/events/:id` and other resources via TanStack Query.
3. Go handlers query SQLite, return JSON.

### Write path (typical, e.g., assigning a volunteer to a mission)
1. User drags a volunteer onto a mission in the UI.
2. React calls `POST /api/assignments` with `(volunteer_id, mission_id)`.
3. Go handler validates input, inserts row in SQLite.
4. Handler re-runs the **constraint engine** for the affected entities (the volunteer, the mission, any trips they're on).
5. Handler returns the new assignment + the updated set of warnings for affected entities.
6. TanStack Query updates the cache; UI re-renders with new badges.

### Roadbook generation
1. User clicks "Generate roadbooks."
2. Frontend calls `POST /api/events/:id/roadbooks`.
3. Go server iterates volunteers, renders an HTML document per volunteer using `html/template`, feeds it to chromedp.
4. PDFs are written to `exports/<event>/roadbook_<last>_<first>.pdf`.
5. A combined master PDF is generated similarly.
6. Server returns a list of file paths; frontend offers download links.

## Deployment

### Distribution
- GitHub Releases with one binary per OS/arch:
  - `volunteers-linux-amd64`
  - `volunteers-linux-arm64`
  - `volunteers-darwin-amd64`
  - `volunteers-darwin-arm64`
  - `volunteers-windows-amd64.exe`
- Optional **Docker image** for the VPS-self-hosting path: `ghcr.io/<repo>/volunteers:latest`.

### Running locally (laptop)
```
./volunteers
```
- App opens the default browser to `http://localhost:8080`.
- SQLite file is created in the current working directory if absent.
- Configuration via CLI flags or `config.toml` (port, data directory, ORS API key, etc.).

### Running on a VPS
- Same binary, run under `systemd`.
- Optional reverse proxy (Caddy / nginx) for TLS.
- Optional basic-auth at the reverse-proxy level. The app itself does not implement authentication in v1 — local-network-only deployment is the assumption.

### Updates
- Manual: download new binary, replace old, restart.
- SQLite migrations run automatically on startup; old database is backed up to `event.db.bak` before any migration.

## Dependencies the user installs

- **Chrome or Chromium** must be installed on the host for PDF generation. The binary detects it on startup and prints a clear error if missing.
- That's the only external dependency. No Node.js, no Python, no Docker required for the binary path.

## Security posture (v1)

- **No authentication in the app.** Designed for `localhost` or trusted-network deployment.
- All ingress is local by default (binds to `127.0.0.1` unless `--bind 0.0.0.0` is passed).
- File uploads validated for size and MIME type; stored under `assets/` with content-hashed filenames.
- No external API calls except routing (ORS/OSRM) and optional tile downloads, both clearly documented.
- SQLite database is unencrypted. Coordinator is responsible for filesystem-level security. (v2 may add at-rest encryption.)

## Observability

- Structured logs to stderr via `log/slog`. Levels: `debug`, `info`, `warn`, `error`.
- `--log-level` flag and `LOG_LEVEL` env var.
- No telemetry, no phone-home. Period.

## Backup strategy

- The SQLite file is the source of truth. Coordinator backs it up by copying the file (or using the in-app "Export event" feature, which produces a complete portable archive).
- Daily auto-backup option: copies `event.db` to `event.db.YYYY-MM-DD` in a configurable directory.

## Performance targets

- Cold start: app available at `localhost` in < 2 seconds.
- Map renders 50 VS + 3 GPX routes (~10k points each) at 60fps on a modest laptop.
- Constraint engine re-runs after any edit in < 100ms for a typical event (100 volunteers, 200 missions, 50 trips).
- Full roadbook generation (100 PDFs + master): < 60 seconds.
- These are targets, not contracts — premature optimization is forbidden until they're measured and missed.
