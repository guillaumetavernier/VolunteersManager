import { expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";

// unwrap reads a response body and strips the M05 `{data, warnings}` envelope
// when the server wraps a mutation response.
export async function unwrap<T = unknown>(res: APIResponse): Promise<T> {
  const body = await res.json();
  if (body && typeof body === "object" && !Array.isArray(body) && "data" in body && "warnings" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

// Reset DB between tests by deleting every dependent row before VS. The event
// row stays put because it's load-bearing (the wizard would re-appear without
// it). Every DELETE must succeed (2xx) or already be gone (404); anything else
// (FK constraints, stale rows surviving silently) is bubbled up as a
// descriptive error so the next test doesn't see leaked state.
export async function resetState(api: APIRequestContext) {
  // Order matters: trips reference cars + volunteers + VS via RESTRICT, so
  // they go first. Trip stops + stop passengers cascade from trips. Then races
  // (race_vs cascades), then cars (force-cascades trips, but they're already
  // gone), then volunteers (hard delete), then VS (force-cascades trips, also
  // already gone).
  await deleteAll(api, "/api/trips", "id");
  await deleteAll(api, "/api/races", "id");
  await deleteAll(api, "/api/cars", "id", "?force=true");
  await deleteAll(api, "/api/volunteers?archived=all", "id", "?hard=true&force=true");
  await deleteAll(api, "/api/vs", "id", "?force=true");
}

async function deleteAll(
  api: APIRequestContext,
  listPath: string,
  idKey: string,
  query: string = "",
) {
  const res = await api.get(listPath);
  if (!res.ok()) {
    if (res.status() === 404) return;
    const body = await res.text();
    throw new Error(`resetState: GET ${listPath} -> ${res.status()} ${body}`);
  }
  const list = (await res.json()) as Array<Record<string, unknown>>;
  // Strip query from list path to get the base resource path.
  const base = listPath.split("?")[0];
  for (const item of list) {
    const id = item[idKey];
    const del = await api.delete(`${base}/${id}${query}`);
    if (!del.ok() && del.status() !== 404) {
      const body = await del.text();
      throw new Error(
        `resetState: DELETE ${base}/${id}${query} -> ${del.status()} ${body}`,
      );
    }
  }
}

export async function ensureEventInitialized(api: APIRequestContext) {
  const r = await api.get("/api/event");
  if (r.ok()) return;
  await api.put("/api/event", {
    data: {
      name: "Test Trail",
      start_date: "2026-06-01",
      end_date: "2026-06-03",
      timezone: "Europe/Paris",
      country_code: "FR",
      settings: JSON.stringify({ region: "europe-france" }),
    },
  });
}

// waitForMap returns once MapLibre is mounted. We deliberately don't wait for
// the full 'load' event: when the pmtiles archive 404s in e2e (we have no real
// tile data) map.loaded() stays false forever. Click handlers, markers, and
// layer add/remove all work as soon as the map instance exists.
export async function waitForMap(page: Page) {
  await page.locator("canvas.maplibregl-canvas").waitFor({ state: "visible", timeout: 15_000 });
  await page.waitForFunction(
    () => !!(window as unknown as { __map?: { isStyleLoaded: () => boolean } }).__map,
    { timeout: 15_000 },
  );
}

// Asserts a MapLibre layer with the given id exists and has the given paint property.
export async function expectLineLayer(page: Page, layerID: string, color: string) {
  const got = await page.evaluate(
    ([id, expected]) => {
      const map = (window as unknown as {
        __map?: {
          getLayer: (id: string) => unknown;
          getPaintProperty: (id: string, p: string) => unknown;
        };
      }).__map;
      if (!map) return { exists: false };
      const exists = !!map.getLayer(id);
      const c = exists ? (map.getPaintProperty(id, "line-color") as string) : null;
      return { exists, color: c, expected };
    },
    [layerID, color] as const,
  );
  expect(got.exists, `layer ${layerID} not found`).toBe(true);
  expect(String(got.color).toLowerCase()).toBe(color.toLowerCase());
}
