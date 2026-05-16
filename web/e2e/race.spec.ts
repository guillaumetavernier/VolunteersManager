import { expect, test } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureEventInitialized, expectLineLayer, resetState, unwrap, waitForMap } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("create race, upload GPX, add VS in order, override one time, see polyline on map", async ({
  page,
  request,
}) => {
  // Seed a VS the race will use.
  const vsRes = await request.post("/api/vs", {
    data: { name: "Midpoint", lat: 48.8584, lon: 2.296 },
  });
  expect(vsRes.ok()).toBe(true);
  const vs = await unwrap<{ id: number }>(vsRes);

  // Go to the Courses tool and create a race in the sidebar.
  await page.goto("/#/courses");
  await waitForMap(page);
  await page.getByPlaceholder("Nom de la nouvelle course").fill("42km");
  await page.getByRole("button", { name: /^ajouter$/i }).click();
  await expect(page).toHaveURL(/#\/courses\/\d+/);

  // We navigate to /courses/{id}; the form is visible.
  await expect(page.getByRole("heading", { name: /paramètres de la course/i })).toBeVisible();

  // Set a recognisable color, paces, start time.
  await page.getByLabel("Couleur").fill("#ff0000");
  await page.getByLabel("Allure tête (km/h)").fill("15");
  await page.getByLabel("Allure queue (km/h)").fill("6");
  // The Enregistrer button persists everything.
  await page.getByRole("button", { name: /^enregistrer$/i }).click();

  // Persist start time via the API directly — datetime-local in headless is
  // browser/locale-flaky and isn't the point of this test.
  const races = await (await request.get("/api/races")).json();
  const race = races[0];
  expect(race).toBeTruthy();
  await request.patch(`/api/races/${race.id}`, {
    data: { start_time: "2026-06-01T05:00:00Z" },
  });

  // Upload the fixture GPX through the file input on the page.
  const gpxPath = path.resolve(__dirname, "fixtures/sample.gpx");
  await fs.access(gpxPath);
  await page.locator('input[type="file"]').setInputFiles(gpxPath);
  await page.getByRole("button", { name: /^téléverser$/i }).click();

  // Wait for the file to land in the list — the stored filename is its sha256,
  // so match on the km-distance suffix instead.
  await expect(page.locator("li", { hasText: ".gpx" }).first()).toBeVisible();

  // Add the VS to the race's ordered list via the picker.
  await page.locator("select").last().selectOption({ label: "Midpoint" });

  // auto first-in / last-in populate. The exact strings depend on projection;
  // assert they're set, not their content.
  await expect.poll(async () => {
    const xs = await (await request.get(`/api/races/${race.id}/vs`)).json();
    return xs?.[0]?.auto_first_in;
  }, { timeout: 5_000 }).not.toBeNull();

  // Override the manual first-in via the UI: the row shows two datetime-local
  // inputs (one per first-in / last-in editor). Set first-in.
  const firstInInput = page
    .locator("li", { hasText: "Midpoint" })
    .locator('input[type="datetime-local"]')
    .first();
  await firstInInput.fill("2026-06-01T07:00");
  await firstInInput.blur();

  // The override sticks across a recompute. Trigger by patching the front pace.
  await expect.poll(async () => {
    const xs = await (await request.get(`/api/races/${race.id}/vs`)).json();
    return xs?.[0]?.manual_first_in;
  }, { timeout: 5_000 }).not.toBeNull();

  await request.patch(`/api/races/${race.id}`, { data: { front_pace: 14 } });
  await expect.poll(async () => {
    const xs = await (await request.get(`/api/races/${race.id}/vs`)).json();
    const m = xs?.[0]?.manual_first_in as string | null;
    return !!m;
  }, { timeout: 5_000 }).toBe(true);

  // Move a VS → projection + auto times recompute. We change lat/lon, then
  // confirm projected_dist_m changes.
  const before = (await (await request.get(`/api/races/${race.id}/vs`)).json())[0];
  await request.patch(`/api/vs/${vs.id}`, {
    data: { lat: 48.8584, lon: 2.2965 },
  });
  await expect.poll(async () => {
    const xs = await (await request.get(`/api/races/${race.id}/vs`)).json();
    return xs?.[0]?.projected_dist_m;
  }, { timeout: 5_000 }).not.toBe(before.projected_dist_m);

  // Map shows the GPX polyline in race color. Visit the map shell, wait for
  // the map to load, and inspect the MapLibre layer state.
  await page.goto("/#/courses");
  await waitForMap(page);
  await expect.poll(async () => {
    return await page.evaluate((id) => {
      const map = (
        window as unknown as {
          __map?: {
            getLayer: (id: string) => unknown;
            isStyleLoaded: () => boolean;
            getStyle: () => { layers: Array<{ id: string }>; sources: Record<string, unknown> };
          };
        }
      ).__map;
      if (!map) return "no-map";
      const layer = map.getLayer(id);
      if (layer) return "ok";
      return JSON.stringify({
        styleLoaded: map.isStyleLoaded(),
        layers: map.getStyle().layers.map((l) => l.id).slice(-5),
        sources: Object.keys(map.getStyle().sources),
      });
    }, `race-line-${race.id}`);
  }, { timeout: 10_000 }).toBe("ok");
  await expectLineLayer(page, `race-line-${race.id}`, "#ff0000");
});
