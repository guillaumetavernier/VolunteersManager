import { expect, test } from "@playwright/test";
import { ensureEventInitialized, resetState } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("toolbar visible on map routes, hidden on header pages", async ({ page }) => {
  await page.goto("/#/courses");
  await expect(page.locator('[data-testid="map-toolbar"]')).toBeVisible();
  await expect(page.locator('[data-testid="app-header"]')).toHaveAttribute(
    "data-route-kind",
    "map",
  );

  await page.goto("/#/affectations");
  await expect(page.locator('[data-testid="map-toolbar"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="app-header"]')).toHaveAttribute(
    "data-route-kind",
    "header",
  );

  await page.goto("/#/ressources/benevoles");
  await expect(page.locator('[data-testid="map-toolbar"]')).toHaveCount(0);

  await page.goto("/#/parametres");
  await expect(page.locator('[data-testid="map-toolbar"]')).toHaveCount(0);

  await page.goto("/#/roadbooks");
  await expect(page.locator('[data-testid="map-toolbar"]')).toHaveCount(0);
});

test("toolbar walks VS / Trajets / Chronologie / Courses tools", async ({ page }) => {
  await page.goto("/#/courses");
  await expect(page.locator('[data-tool="courses"]')).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-testid="sidebar-courses-list"]')).toBeVisible();

  await page.locator('[data-tool="vs"]').click();
  await expect(page).toHaveURL(/#\/vs$/);
  await expect(page.locator('[data-testid="sidebar-vs-list"]')).toBeVisible();

  await page.locator('[data-tool="trajets"]').click();
  await expect(page).toHaveURL(/#\/trajets$/);
  await expect(page.locator('[data-testid="sidebar-trajets-list"]')).toBeVisible();

  await page.locator('[data-tool="chronologie"]').click();
  await expect(page).toHaveURL(/#\/chronologie$/);
  await expect(page.locator('[data-testid="sidebar-chronologie"]')).toBeVisible();

  await page.locator('[data-tool="courses"]').click();
  await expect(page).toHaveURL(/#\/courses$/);
});

test("header pages reachable", async ({ page }) => {
  await page.goto("/#/courses");
  await page.getByTestId("header-affectations").click();
  await expect(page).toHaveURL(/#\/affectations$/);
  await expect(page.getByTestId("affectations-page")).toBeVisible();

  await page.getByTestId("header-ressources").click();
  await page.getByRole("menuitem", { name: "Bénévoles" }).click();
  await expect(page).toHaveURL(/#\/ressources\/benevoles$/);

  await page.getByTestId("header-ressources").click();
  await page.getByRole("menuitem", { name: "Véhicules" }).click();
  await expect(page).toHaveURL(/#\/ressources\/vehicules$/);

  await page.getByTestId("header-roadbooks").click();
  await expect(page).toHaveURL(/#\/roadbooks$/);

  await page.getByTestId("header-parametres").click();
  await expect(page).toHaveURL(/#\/parametres$/);
  await expect(page.getByTestId("settings-page")).toBeVisible();
});

test("warnings slide-over opens and closes", async ({ page }) => {
  await page.goto("/#/courses");
  const counter = page.getByTestId("global-issue-counter");
  await expect(counter).toBeVisible();
  await counter.click();
  await expect(page.getByTestId("warnings-slide-over")).toBeVisible();
  await page.getByTestId("warnings-close").click();
  await expect(page.getByTestId("warnings-slide-over")).toHaveCount(0);
});

test("layers control popover toggles", async ({ page }) => {
  await page.goto("/#/courses");
  const layers = page.getByTestId("layers-control-toggle");
  await expect(layers).toBeVisible();
  await layers.click();
  await expect(page.getByTestId("layers-control-popover")).toBeVisible();
  await layers.click();
  await expect(page.getByTestId("layers-control-popover")).toHaveCount(0);
});

test("/#/parametres has Roadbook and Données tabs with merged content", async ({ page }) => {
  await page.goto("/#/parametres");
  await expect(page.getByTestId("settings-tab-roadbook")).toBeVisible();
  await expect(page.getByTestId("settings-tab-donnees")).toBeVisible();
  await page.getByTestId("settings-tab-donnees").click();
  await expect(page.getByTestId("backup-settings")).toBeVisible();
  await expect(page.getByTestId("archive-page")).toBeVisible();
});
