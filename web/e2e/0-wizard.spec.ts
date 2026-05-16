import { expect, test } from "@playwright/test";

// Each suite runs against a freshly booted binary (see playwright.config webServer).
// The wizard suite assumes an UN-initialized event row. To guarantee that, this
// test runs FIRST in the worker, before any other spec creates the row.

test.describe.configure({ mode: "serial" });

test("first run shows the wizard, submitting it creates the event row", async ({ page, request }) => {
  // Sanity: GET /api/event is 404 on a fresh DB.
  const fresh = await request.get("/api/event");
  expect(fresh.status()).toBe(404);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /initialize event/i })).toBeVisible();

  await page.getByLabel("Event name").fill("Test Trail");
  await page.getByLabel("Start date").fill("2026-06-01");
  await page.getByLabel("End date").fill("2026-06-03");
  // Region default is europe-france; the binary's tile-base-url points to a
  // non-existent /_no_tiles_/ path so the download will error, but that's ok
  // for the wizard-completed criterion — we only check the event row lands.
  await page.getByRole("button", { name: /create event/i }).click();

  // The app swaps to MapShell after the mutation resolves; the wizard heading
  // should disappear.
  await expect(page.getByRole("heading", { name: /initialize event/i })).toBeHidden({ timeout: 10_000 });

  const ev = await request.get("/api/event");
  expect(ev.status()).toBe(200);
  const body = await ev.json();
  expect(body.name).toBe("Test Trail");
  expect(body.start_date).toBe("2026-06-01");

  // Tile download was dispatched. Status endpoint should report a non-idle state
  // (downloading → error since the upstream is bogus). idle would mean we forgot
  // to POST /api/tiles/download.
  const st = await request.get("/api/tiles/download/status");
  expect(st.ok()).toBe(true);
  const stBody = await st.json();
  expect(["downloading", "done", "error"]).toContain(stBody.state);
});
