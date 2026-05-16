# VolunteersManager

A self-hosted single-user web app (Go + SQLite + React) for race coordinators
planning volunteer logistics for multi-day trail races.

> v1 is single-tenant, single-event, FR-only, bound to `127.0.0.1`. There is
> no authentication, no telemetry, and no cloud dependency.

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
with `--offline-tiles=<path>` or the in-app downloader after import.

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
