import { expect, test } from "@playwright/test";
import { ensureEventInitialized, resetState, waitForMap } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("click-empty-map opens VS create panel; submit persists; drag updates DB", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await waitForMap(page);

  // Click roughly in the middle of the map canvas.
  const canvas = page.locator("canvas.maplibregl-canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas bounding box");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);

  // The PB create panel appears with the clicked coords pre-filled.
  await expect(page.getByLabel("Créer un PB")).toBeVisible();
  await page.getByLabel("Name").fill("Refuge");
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByLabel("Créer un PB")).toBeHidden();

  // The new VS round-trips in the API.
  const xs = await (await request.get("/api/vs")).json();
  expect(xs).toHaveLength(1);
  const created = xs[0];
  expect(created.name).toBe("Refuge");

  // A MapLibre Marker DOM element has appeared. Drag it diagonally and confirm
  // the PATCH lands. We can't target by aria-label because MapLibre rewrites
  // it on every marker; use the data-vs-name attribute the MapView sets.
  const markerSelector = `[data-vs-name="Refuge"]`;
  await expect(page.locator(markerSelector)).toBeVisible({ timeout: 10_000 });
  const m = await page.locator(markerSelector).boundingBox();
  if (!m) throw new Error("no marker bounding box");
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
  await page.mouse.down();
  await page.mouse.move(m.x + m.width / 2 + 80, m.y + m.height / 2 - 60, { steps: 8 });
  await page.mouse.up();

  // Poll the API until lat/lon differ from the original — the optimistic PATCH
  // is fired on dragend and races the assertion, so we await it.
  await expect
    .poll(async () => {
      const res = await request.get(`/api/vs/${created.id}`);
      if (!res.ok()) return null;
      const v = await res.json();
      return v.lat !== created.lat || v.lon !== created.lon;
    }, { timeout: 5_000 })
    .toBe(true);
});
