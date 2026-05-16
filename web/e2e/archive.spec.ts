import { expect, test } from "@playwright/test";

import { ensureEventInitialized, resetState, unwrap } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("export an archive zip via the settings page", async ({ page, request }) => {
  await unwrap(
    await request.post("/api/vs", { data: { name: "VS-Archive", lat: 48.0, lon: 2.0 } }),
  );

  await page.goto("/#/parametres");
  await page.getByTestId("settings-tab-donnees").click();
  await expect(page.getByTestId("archive-page")).toBeVisible();

  const link = page.getByTestId("export-archive");
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/api/archive/export");

  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  expect(suggested).toContain(".zip");
  expect(suggested).toContain("archive");
});

test("import an archive .zip and surface the new DB path", async ({ page, request }) => {
  await unwrap(
    await request.post("/api/vs", { data: { name: "VS-RoundTrip", lat: 47.5, lon: 1.5 } }),
  );

  // Hit the export endpoint directly to capture a real archive.
  const exportRes = await request.get("/api/archive/export");
  expect(exportRes.ok()).toBeTruthy();
  const zipBytes = await exportRes.body();
  expect(zipBytes.length).toBeGreaterThan(64);

  await page.goto("/#/parametres");
  await page.getByTestId("settings-tab-donnees").click();
  await expect(page.getByTestId("archive-page")).toBeVisible();

  const upload = page.getByTestId("import-archive");
  await upload.setInputFiles({
    name: "archive.zip",
    mimeType: "application/zip",
    buffer: zipBytes,
  });

  const importedPath = page.getByTestId("imported-path");
  await expect(importedPath).toBeVisible({ timeout: 15_000 });
  const text = await importedPath.textContent();
  expect(text).toContain("event_imported_");
});

test("toggle the daily backup setting and persist", async ({ page }) => {
  await page.goto("/#/parametres");
  await page.getByTestId("settings-tab-donnees").click();
  await expect(page.getByTestId("backup-settings")).toBeVisible();
  const toggle = page.getByTestId("daily-backup-toggle").locator("input[type=checkbox]");
  if (!(await toggle.isChecked())) {
    await toggle.check();
  }
  await page.getByTestId("save-backup").click();

  await page.reload();
  await page.getByTestId("settings-tab-donnees").click();
  await expect(page.getByTestId("backup-settings")).toBeVisible();
  await expect(page.getByTestId("daily-backup-toggle").locator("input[type=checkbox]")).toBeChecked();
});
