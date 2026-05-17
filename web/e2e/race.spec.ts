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

test("create race, add trial with GPX, add VS, see polyline on map", async ({
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

  // Set a recognisable color.
  await page.getByLabel("Couleur").fill("#ff0000");
  await page.getByRole("button", { name: /^enregistrer$/i }).click();

  const races = await (await request.get("/api/races")).json();
  const race = races[0];
  expect(race).toBeTruthy();

  // Add a trial via API with start_time and paces.
  const trialRes = await request.post(`/api/races/${race.id}/trials`, {
    data: {
      name: "Épreuve principale",
      sequence: 0,
      start_time: "2026-06-01T05:00:00Z",
      front_pace: 15.0,
      tail_pace: 6.0,
    },
  });
  expect(trialRes.ok()).toBe(true);
  const trial = await unwrap<{ id: number }>(trialRes);

  // Upload the fixture GPX through the API for the trial.
  const gpxPath = path.resolve(__dirname, "fixtures/sample.gpx");
  await fs.access(gpxPath);
  const gpxContent = await fs.readFile(gpxPath);
  const gpxBlob = new Blob([gpxContent], { type: "application/gpx+xml" });
  const form = new FormData();
  form.append("gpx", gpxBlob, "sample.gpx");
  const gpxRes = await request.post(`/api/trials/${trial.id}/gpx`, {
    multipart: { gpx: { name: "sample.gpx", mimeType: "application/gpx+xml", buffer: gpxContent } },
  });
  expect(gpxRes.ok()).toBe(true);

  // Add the VS to the race's ordered list.
  await request.put(`/api/races/${race.id}/vs`, {
    data: [{ vs_id: vs.id, sequence: 0 }],
  });

  // Aggregated timing populates via recompute.
  await expect.poll(async () => {
    const xs = await (await request.get(`/api/races/${race.id}/vs`)).json();
    return xs?.[0]?.earliest_first_in;
  }, { timeout: 8_000 }).not.toBeNull();

  // Move a VS → projection + auto times recompute.
  const before = (await (await request.get(`/api/races/${race.id}/vs`)).json())[0];
  await request.patch(`/api/vs/${vs.id}`, {
    data: { lat: 48.8584, lon: 2.2965 },
  });
  await expect.poll(async () => {
    const xs = await (await request.get(`/api/races/${race.id}/vs`)).json();
    return xs?.[0]?.projected_dist_m;
  }, { timeout: 5_000 }).not.toBe(before.projected_dist_m);

  // Map shows the GPX polyline in race color.
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
