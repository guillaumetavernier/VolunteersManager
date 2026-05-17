# VolunteersManager

A self-hosted single-user web app (Go + SQLite + React) for race coordinators
planning volunteer logistics for multi-day trail races.

> v1 is single-tenant, single-event, FR-only, bound to `127.0.0.1`. There is
> no authentication, no telemetry, and no cloud dependency.

## Features

- **Map-is-home UI.** MapLibre GL JS with a toolbar driving four tools (VS,
  Trajets, Chronologie, Courses) and a persistent right sidebar.
- **Races with multiple trials (épreuves).** Each trial has its own GPX,
  start time, and front/tail paces; the engine propagates a dwell-at-PB
  envelope across the ordered sequence to compute per-VS earliest/latest
  times.
- **Volunteers, cars, missions, assignments.** Drag-drop assignment UI,
  role-filtered candidate picker, CSV import (with ambiguity resolution) and
  export, photo-attached VS markers.
- **Constraint engine.** Pure-function full recompute on every mutation —
  double-bookings, role mismatches, capacity overruns, stranded volunteers
  surface as warnings on badges and an issues slide-over.
- **Trips + travel-time matrix.** Haversine matrix with manual overrides;
  trip editor with board/alight per stop; transport-needs view derived from
  consecutive missions at different VS.
- **Timeline.** Canvas scrubber animating runner front/tail, volunteer, and
  car positions along their GPX, with per-trial badge strips and 30× playback.
- **Roadbook PDFs.** maroto v2 + go-staticmaps, byte-deterministic golden
  output, per-volunteer + master document, customizable primary color and
  toggleable sections.
- **Archive + backup.** One-file `event.db` plus zip export/import covering
  GPX and assets; daily auto-backup; pre-migration `event.db.bak`.
- **Offline-first.** Local `.pmtiles` when present, otherwise online tiles
  (Protomaps with a key, or zero-config OpenFreeMap) — see
  [Tile sources](#tile-sources).

## Quickstart

Prerequisites: Go ≥ 1.25, Node 20, pnpm.

```sh
# Run from source (dev loop — backend on :8080, Vite on :5173 proxied through backend)
make dev

# Or build a single static binary with the frontend embedded
make build
./dist/volunteers
```

`./dist/volunteers` creates `event.db` in the current directory on first boot,
applies migrations, opens the browser, and serves the SPA. The first screen is
the event-init wizard.

Releases also ship pre-built binaries for `linux-amd64`, `linux-arm64`,
`darwin-amd64`, `darwin-arm64` and `windows-amd64` — see the GitHub
[Releases](https://github.com/guillaumetavernier/VolunteersManager/releases)
page.

## Backup & archive

Two separate things, both on by default at file granularity:

- **`event.db.bak`** is overwritten before any pending migration runs. It is a
  rollback safety net, not a history.
- **`backups/event.db.YYYY-MM-DD`** is written once per calendar day on
  startup when `events.settings.backup.daily=true` (configured at
  `/settings/backup` in the UI). Each file is point-in-time history and is
  kept forever.

To produce a portable copy of the whole event (DB + assets + GPX), visit
`/settings/archive` and click "Télécharger l'archive". The resulting `.zip`
imports cleanly into a fresh DB via the same page or `POST
/api/archive/import`. **Map tiles are deliberately excluded** — re-supply them
via one of the three modes below after import.

## Tile sources

`--tile-mode` selects how the map is rendered. The default is `auto`, which
tries in order:

1. **Local `.pmtiles`** in `<data-dir>/tiles/` (or `--offline-tiles=<path>`).
   Fully offline once the archive is downloaded.
2. **Protomaps online** if `--protomaps-api-key` / `$PROTOMAPS_API_KEY` is
   set.
3. **OpenFreeMap** — zero-config hosted positron style, no key needed.

Force a specific mode with `--tile-mode=pmtiles|online|openfreemap`. The
in-app downloader at `/settings/tiles` fetches a regional `.pmtiles` extract;
once it lands, `auto` will prefer it on next boot.

## VPS deployment

The binary listens on `127.0.0.1:8080` by default. For internet exposure put
it behind a reverse proxy with basic-auth.

### systemd unit

```ini
# /etc/systemd/system/volunteers.service
[Unit]
Description=VolunteersManager
After=network.target

[Service]
User=volunteers
WorkingDirectory=/var/lib/volunteers
ExecStart=/usr/local/bin/volunteers --bind=127.0.0.1 --port=8080 --open=false --data-dir=/var/lib/volunteers
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

### Caddy with basic-auth

```caddy
volunteers.example.org {
    basicauth {
        coordinator JDJhJDEy... # caddy hash-password
    }
    reverse_proxy 127.0.0.1:8080
}
```

### nginx with basic-auth

```nginx
server {
    server_name volunteers.example.org;
    auth_basic           "Coordinator";
    auth_basic_user_file /etc/nginx/htpasswd;

    location / {
        proxy_pass         http://127.0.0.1:8080;
        proxy_set_header   Host $host;
    }
}
```

## Docker

```sh
docker run --rm -p 8080:8080 -v $(pwd)/data:/data \
    ghcr.io/guillaumetavernier/volunteersmanager:latest
```

The image is `distroless/static` — no shell, no package manager, just the
binary. Mount `/data` to persist `event.db`, `assets/`, `gpx/`, `tiles/`.

## Tests & benchmarks

```sh
make test       # go test ./... + vitest
make typecheck  # tsc --noEmit
make check      # full harness: lint_docs + go test + vitest
make bench      # constraints + roadbook + timeline budgets
```

## Repository layout

See [`docs/`](./docs/) for the full specification and the per-milestone
implementation plan ([`docs/milestones/`](./docs/milestones/)). Session
conventions live in [`CLAUDE.md`](./CLAUDE.md).

## License

MIT — see [`LICENSE`](./LICENSE).
