import { expect, test } from "@playwright/test";

import { ensureEventInitialized, resetState, unwrap } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("configure roadbook → generate → download a per-volunteer PDF", async ({ page, request }) => {
  // Seed: one VS + one volunteer + one mission (so the volunteer has timeline content).
  const vs = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "VS-Alpha", lat: 48.0, lon: 2.0 } }),
  );
  const vol = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: {
        first_name: "Alice",
        last_name: "Test",
        phone: "+33611111111",
        default_vs_id: vs.id,
      },
    }),
  );
  const mission = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vs.id}/missions`, {
      data: {
        day: 1,
        start_time: "2026-06-02T08:00:00Z",
        end_time: "2026-06-02T12:00:00Z",
        role_type: "Ravito",
        headcount: 1,
      },
    }),
  );
  await request.post("/api/assignments", {
    data: { mission_id: mission.id, volunteer_id: vol.id },
  });

  // Tweak settings on the page and toggle sponsor off.
  await page.goto("/#/roadbooks/parametres");
  await expect(page.getByTestId("roadbook-settings")).toBeVisible();
  await page.getByTestId("primary-color").fill("#10b981");
  // Sponsor row visibility toggle.
  const sponsorRow = page.locator('[data-section-key="sponsor"]');
  const sponsorCheckbox = sponsorRow.locator("input[type=checkbox]");
  if (await sponsorCheckbox.isChecked()) {
    await sponsorCheckbox.uncheck();
  }
  await page.getByTestId("save-settings").click();

  // Generate roadbooks.
  await page.goto("/#/roadbooks");
  await expect(page.getByTestId("roadbook-generate")).toBeVisible();
  await page.getByTestId("generate-button").click();
  await expect(page.getByTestId("generate-result")).toBeVisible({ timeout: 20_000 });
  const rows = page.getByTestId("volunteer-pdf-row");
  await expect(rows.first()).toBeVisible();

  // The first volunteer's filename should match the convention.
  const firstText = (await rows.first().innerText()).trim();
  expect(firstText.toLowerCase()).toContain("roadbook_test_alice");

  // Fetch the PDF via the download link and assert it starts with the PDF magic header.
  const link = rows.first().locator("a");
  const href = await link.getAttribute("href");
  expect(href).toBeTruthy();
  const fileRes = await request.get(href!);
  expect(fileRes.status()).toBe(200);
  const body = await fileRes.body();
  expect(body.length).toBeGreaterThan(1000);
  const head = body.subarray(0, 5).toString();
  expect(head.startsWith("%PDF-")).toBe(true);
});
