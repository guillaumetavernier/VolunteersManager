# Online tile fallback — feasibility study

> Status: shipped (commits 6df902e, cc79173, and the openfreemap follow-up). Locked decision #5 revised twice — once to add Protomaps online, once to add OpenFreeMap as the zero-config fallback. This doc retains the original feasibility study for context.

## Context

The current setup is **pmtiles-or-nothing**:

- Binary: 33 MB
- Frontend bundle: 1.3 MB JS + 94 KB CSS
- **`tiles/` on a working install: 8.7 GB** for a typical France-sized region

The pmtiles archive is 200× the entire codebase. For a single-event-per-file tool where the coordinator probably has internet during planning, that's a punishing onboarding tax: download 8.7 GB before the map renders, even if you only ever want to glance at it.

The `--offline-tiles` flag and the in-app downloader (`POST /api/tiles/download`) exist precisely *because* getting an archive on disk is the painful step. None of that goes away in offline-first deployments at the venue — but for planning on a laptop with internet, it's all overhead.

## Question

Can we serve external online vector tiles when no local archive is present, falling back to pmtiles when one is available, **without breaking the offline-first design**?

## What "online tiles" means in practice

MapLibre GL doesn't care where vector tiles come from — only that the URL template returns valid Protocol Buffer encoded MVT and the style references compatible source/layer names. Options:

| Provider | Schema | Fits our style? | Free tier | Attribution |
|---|---|---|---|---|
| **Protomaps API** (`api.protomaps.com`) | Protomaps' own | **Yes — same `protomaps-themes-base` style verbatim** | 100k tiles/month free, then pay-per-use | "Protomaps © OpenStreetMap" |
| MapTiler Cloud | OpenMapTiles | No — different layer names; would need a separate style | 100k tiles/month | "MapTiler © OpenStreetMap" |
| Stadia Maps | Stadia/Stamen | No — different layer names | Free with API key | "Stadia Maps © OpenStreetMap" |
| OSM raster | Raster (not vector) | No — would lose vector zoom/selection | Free but heavily rate-limited; explicitly discouraged for production | "© OpenStreetMap contributors" |

**Protomaps API is the clear winner.** Same schema, same style file, same fonts, same sprites. The frontend's `buildMapStyle` already references Protomaps fonts and sprites over HTTP. Switching the *source URL* between `pmtiles://...` (offline) and `https://api.protomaps.com/tiles/v4/{z}/{x}/{y}.mvt?key=...` (online) is a one-line change to the style.

## What it would look like

### Backend

Add one config flag:

```
--tile-mode=auto|pmtiles|online   (default: auto)
--protomaps-api-key=<key>          (required when online)
```

`auto` rule: if `AreTilesEmpty(tileDir)` → serve a marker so the frontend uses online; otherwise serve pmtiles.

Wire it into `GET /api/event` (or a tiny new `GET /api/tiles/source`) so the frontend can read the resolved source on boot:

```json
{ "source": "online", "key": "pk_...", "attribution": "..." }
{ "source": "pmtiles", "region": "europe-france" }
```

No new dependency on the Go side — it's just a config decision exposed over JSON.

### Frontend

`buildMapStyle` becomes a switch:

```ts
if (source.kind === "online") {
  return protomapsOnlineStyle(source.key);
}
return protomapsOfflineStyle(source.region);  // current
```

Both reuse `layers(...)` from `protomaps-themes-base` — only the `sources` block changes.

### EventInitWizard

Today the wizard insists on choosing a region and downloading. With online fallback, the wizard's region choice becomes **optional**: "Use online tiles for now (recommended on a laptop with internet) / Download an offline archive for venue use (8 GB+)." Defer the heavy download until the coordinator actually goes offline.

### Cost of doing nothing

Stays at status quo: 8.7 GB minimum to render anything. The `--offline-tiles` flag is the only escape hatch and it requires pre-staging the archive.

## Trade-offs

**Pro:**
- 8.7 GB → 0 GB of disk for the most common path (laptop planning with internet).
- Faster onboarding: clone, `make build`, first run sees a map immediately.
- pmtiles stays a first-class option for venue/offline use — *opt-in*, not mandatory.
- Same Protomaps style → no visual regression.
- No new deps (frontend already pulls fonts/sprites from Protomaps' CDN).

**Con / risk:**
- **Breaks locked decision #5.** "Map tiles: Protomaps `.pmtiles` always, dev and prod" is currently binding. The decision was made when v1 framing was "works in a parking lot with no internet." That framing assumes the coordinator is *always* at the venue; in practice planning happens at home with internet.
- **Requires an API key.** Protomaps' free tier is generous (100k tiles/month is several hundred sessions for a single user) but it is a key you have to provision and ship. CLAUDE.md's "no telemetry, no phone-home, ever" applies to telemetry the *app* sends about its own behavior — fetching tiles from a CDN at the user's explicit request is different in kind (it's how every map app works), but the user-visible "this app talks to the internet by default" surface needs to be acknowledged in the UI and in the README.
- **Rate-limit failure mode.** If the free tier is exhausted, the map degrades to a blank canvas. The pmtiles fallback path mitigates this for users who care.
- **CORS / network errors.** Currently the map "just works" once the archive is there. Online introduces transient network failures the user has to interpret.
- **Self-hosted-fully-air-gapped setups.** Some users picked this project precisely because pmtiles means zero outbound traffic. They need a switch to disable the online path entirely (`--tile-mode=pmtiles`).

## Surface change estimate

- **Backend**: ~80 lines. Flag plumbing, tile-source resolution endpoint, no schema change.
- **Frontend**: ~60 lines. Conditional style + a tiny `useTileSource` hook to read the resolved config on boot.
- **EventInitWizard**: ~40 lines. Make region optional, default the new event to online mode.
- **Tests**: Go test for the resolution endpoint (3 cases: pmtiles available, no pmtiles + key, no pmtiles + no key); Playwright spec that asserts the map renders with no local archive.
- **Docs**: README quickstart needs an "online tiles by default; offline opt-in" paragraph; `docs/milestones/README.md` "Locked decisions" entry #5 needs revision.

Total: maybe a single afternoon. The architecture cleanly supports it because `buildMapStyle` is already centralized.

## Recommendation

**Worth doing**, with these guardrails:

1. **Three modes, default `auto`**: `auto | pmtiles | online`. Air-gapped users set `--tile-mode=pmtiles` and never hit the network for tiles. Strict online-only users set `--tile-mode=online` and skip the pmtiles handler entirely.
2. **API key is BYO**: don't bundle one with the binary. README documents how to get a free Protomaps key. CI / open-source users can substitute MapTiler's similar free tier with a different style.
3. **Visible attribution always**: the Protomaps + OSM credit must appear on the map regardless of source.
4. **Revise locked decision #5** to: *"Map tiles default to Protomaps online (free tier, BYO key); pmtiles is the offline fallback. Both code paths must keep working."*
5. **Keep `--offline-tiles` and the in-app downloader** — they're still right for users who deploy to a venue.

The locked decision is overdue for revision: it reflected a design moment when "works offline at the venue" was the primary use case, but actual usage is heavily skewed toward "planning at home." Online-by-default with offline opt-in inverts the priority correctly.

## Out of scope for this study

- Custom tile-server hosting (running our own Protomaps `tileserver-gl`). Possible later; doesn't change the frontend.
- Raster fallback for `<canvas>`-based PDF mini-maps (M08 risk). The roadbook mini-map is a different problem already documented as force-off in v1.
- Caching online tiles to a local mbtiles for partial-offline scenarios. Nice-to-have; out of scope here.
