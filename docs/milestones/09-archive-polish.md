# Milestone 09 — Archive + Polish

## Goal

The coordinator can export the current event as a portable zip archive (DB dump + assets + GPX + manifest) and import a zip into a new SQLite file. Daily auto-backup is optional. A performance pass measures the constraint engine, roadbook generation, and timeline frame rate against the spec's targets, fixing only what's actually missed. The release pipeline ships cross-compiled binaries to GitHub Releases on tag push.

## Prerequisites

- All prior milestones (00–08) complete.

## Scope (in)

- **Export event** → `event_<slug>_<YYYYMMDD>.zip` with `manifest.json`, `event.sql`, `assets/`, `gpx/`. **`tiles/` is excluded** (a regional `.pmtiles` is 100s of MB to GBs; archives stay portable). On import on a new machine without internet, the importer logs a clear warning that map tiles must be supplied separately (via `--offline-tiles=<path>` or the in-app downloader); all non-map functionality works without them.
- **Import event** → creates a *new SQLite file* (because v1 is single-event-per-file), restores schema + rows + assets + gpx into the new file's directory layout.
- **Daily auto-backup** option in event settings → copies `event.db` to `backups/event.db.YYYY-MM-DD` if last backup is >24h old.
- **Performance pass**: scripts to bench constraint engine, roadbook generation, timeline frame budget against the targets in [`../03-architecture.md`](../03-architecture.md) §Performance.
- **Release pipeline**: GitHub Actions cross-compile to 5 targets on tag push; attach binaries to a GitHub Release.
- **Docker image** (optional): `ghcr.io/<repo>/volunteers:<tag>` for VPS self-hosters.
- **README pass**: install instructions, quickstart, link to docs.

## Scope (out)

- In-app version-upgrade UI (manual replace-and-restart is fine).
- Telemetry / phone-home (explicitly forbidden by spec).
- An auto-updater (out of v1).
- Migration tooling for *across-event-archive* schema upgrades — when importing an old archive, the manifest's schema version is checked and any pending migrations run in-place on the new DB file.

## Implementation steps

1. **`internal/archive/`**:
   - `export.go` — `Export(db *sql.DB, settings Settings, out io.Writer) error`. Writes a zip with:
     - `manifest.json`: `{schema_version, exported_at: null, event_name, ...}`. **No timestamps** (determinism).
     - `event.sql`: a SQL dump of every table (excluding `schema_migrations`), in canonical row order (`ORDER BY id`).
     - `assets/`: every file referenced by a row's `*_path` column.
     - `gpx/`: GPX source files for every race.
   - `import.go` — `Import(zip io.Reader, targetDBPath string) error`. Creates a new empty SQLite at `targetDBPath`, runs migrations to current schema version, then replays the dumped SQL **preserving original IDs** (since the target DB starts empty, original IDs are free to take; replay = wrapped `INSERT` statements verbatim, then `UPDATE sqlite_sequence SET seq = (SELECT MAX(id) FROM <table>)` for each AUTOINCREMENT table). This is much simpler than rewriting FKs with an old-id→new-id map. The one wrinkle: the `events` row has `CHECK (id = 1)`; if the archive's `events` row is `id = 1` (always true in single-event-per-file mode, by definition), this works directly with no renumbering.
   - `manifest.go` — the JSON shape; refuses imports with `schema_version > current`.
   - Heavy tests: round-trip a fixture event, hash both DBs (canonical dump), assert equality.
2. **Auto-backup** — `internal/server/backup.go`:
   - On startup, if `backup.daily = true` in event settings and `backups/event.db.<today>` doesn't exist, copy the file before running migrations.
   - Setting is event-scoped; UI is a single toggle.
   - **Coexists with M00's migration `.bak`**: the migration runner already writes `event.db.bak` immediately before applying any pending migration. The daily backup writes `backups/event.db.<YYYY-MM-DD>` once per calendar day. Different purposes — `.bak` is rollback-on-migration-failure (overwritten each migration), the daily file is point-in-time history (one per day, kept forever). Document both in the README so the coordinator knows what each is for.
3. **Bench scripts** under `scripts/`:
   - `bench_constraints.go` — generates a 100-vol / 200-mission / 50-trip fixture in a temp DB, runs `Compute` 1000× from a warm cache, reports mean / p95 / p99. Fails CI if p95 > 100 ms.
   - `bench_roadbook.go` — generates 100 PDFs against the same fixture; reports total wall-clock. Fails CI if > 60 s.
   - `bench_timeline.ts` — runs `positions.ts` in a tight loop simulating one minute of 300x playback at 30 fps; reports mean frame budget. (Run in Node, not the browser; close-enough proxy.)
4. **Release pipeline** — `.github/workflows/release.yml`:
   - Triggers on `v*` tag push.
   - Cross-compiles for linux-amd64, linux-arm64, darwin-amd64, darwin-arm64, windows-amd64.
   - Vite-builds frontend, embeds, builds Go binary.
   - Tars/zips per target with a `README.md` and a `LICENSE`.
   - Creates a GitHub Release with all artifacts.
5. **Docker image** — `Dockerfile`:
   - Build stage: build frontend + Go binary.
   - Runtime stage: scratch + binary + LICENSE. No system libs since `modernc.org/sqlite` is pure Go and we use no chromedp.
   - GitHub Action publishes to GHCR on tag.
6. **`internal/features/archive/`** — HTTP wrapper:
   - `GET /api/archive/export` — streams the zip.
   - `POST /api/archive/import` — multipart upload; writes to a new `<uploadDir>/event_<imported>.db`; returns the path. The user restarts the binary pointing at the new file (or the UI offers a "switch to this DB" action that restarts the server with `--db <path>`).
7. **README finalization** at repo root:
   - One-screen quickstart: download binary, run, browser opens, walk through wizard.
   - Link to `docs/` and `docs/milestones/`.
   - Install Chrome instruction *removed* (we no longer depend on it — pure Go PDF).
   - VPS section: systemd unit example, reverse-proxy basic-auth example.
   - Backup story: copy `event.db`, or use export.

## Data model deltas

- None new at SQL level. `events.settings.backup.daily` boolean added (handled in JSON).

## API surface

- `GET /api/archive/export`.
- `POST /api/archive/import`.

## Frontend surface

- `/settings/backup` toggle.
- `/settings/archive` — export button + import upload form.

## Tests

- **Round-trip integration**: build a fixture event, export → import to a new DB → re-export → byte-identical (after sorting rows). The whole pipeline is the test.
- **Migration on import**: archive from an older schema version → import → migrations run automatically → data accessible.
- **Bench scripts** are themselves tests (fail CI if exceeded).
- Playwright e2e: "Export → download zip → import on a new instance (test runner spawns a second server) → all volunteers present."
- Release pipeline tested via `act` (local GitHub Actions runner) before tagging.

## Risks

- **Asset path rewriting on import.** Old paths like `assets/vs/<hash>.jpg` are re-used as-is in the new file's directory — easy because content-hashes make the paths stable. If two events happen to share a hash, both point at the same byte content (fine, idempotent).
- **Schema version drift.** If we ship v1.0 and then add a column in v1.1, importing a v1.0 archive into v1.1 must auto-migrate. The migration runner already handles this — the import just runs it against the freshly-created target DB.
- **Performance budget on slower laptops.** The "modest laptop" target in the spec is aspirational. If a coordinator's old machine misses the 30 fps timeline target, document the minimum spec rather than chasing micro-optimizations.
- **Imports on machines without tiles.** Tiles are excluded from the archive; the imported event opens but the map shows a blank background until the coordinator provides tiles. This is intentional — surface it as a one-time toast on first-open of an imported event.

## Acceptance criteria

- [ ] Export the fixture event → zip file lands.
- [ ] Import the zip into a new DB → all data, GPX, photos, logos present.
- [ ] Double-export and double-import are byte-identical (round-trip determinism).
- [ ] Daily auto-backup creates `backups/event.db.YYYY-MM-DD` on first daily startup.
- [ ] `bench_constraints` p95 < 100 ms; `bench_roadbook` < 60 s on a typical laptop.
- [ ] Tag `v0.1.0` triggers the release pipeline; 5 binaries appear in the GitHub Release.
- [ ] Docker image runs and serves the SPA on port 8080.
- [ ] README quickstart walkthrough succeeds end-to-end.

## References

- [`../02-spec.md`](../02-spec.md) §8 (backup and sharing).
- [`../03-architecture.md`](../03-architecture.md) §Deployment, §Performance targets, §Backup strategy.
- [`../04-design.md`](../04-design.md) §7 (event archive).
- [`../06-out-of-scope.md`](../06-out-of-scope.md) (telemetry/auto-update boundaries).
