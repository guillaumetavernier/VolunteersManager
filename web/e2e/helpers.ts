import { expect, type APIRequestContext, type Page } from "@playwright/test";

// Reset DB between tests by deleting races and VS through the API. The event
// row stays put because it's load-bearing (the wizard would re-appear without it).
export async function resetState(api: APIRequestContext) {
  const races = await api.get("/api/races");
  if (races.ok()) {
    const list = await races.json();
    for (const r of list) await api.delete(`/api/races/${r.id}`);
  }
  const vsList = await api.get("/api/vs");
  if (vsList.ok()) {
    const list = await vsList.json();
    for (const v of list) await api.delete(`/api/vs/${v.id}`);
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
