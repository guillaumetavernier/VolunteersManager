import { expect, test } from "@playwright/test";
import { ensureEventInitialized, resetState, unwrap, waitForMap } from "./helpers";

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
  await expect(page).toHaveURL(/#\/ressources\/benevoles$/);
  await page.getByTestId("ressources-tab-vehicules").click();
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

test("layers control popover toggles and flips race-line visibility", async ({
  page,
  request,
}) => {
  const race = await unwrap<{ id: number }>(
    await request.post("/api/races", { data: { name: "Trail" } }),
  );

  await page.goto("/#/courses");
  await waitForMap(page);
  const layers = page.getByTestId("layers-control-toggle");
  await expect(layers).toBeVisible();
  await layers.click();
  await expect(page.getByTestId("layers-control-popover")).toBeVisible();

  await expect
    .poll(async () =>
      page.evaluate((id) => {
        const m = (window as unknown as { __map?: { getLayer: (id: string) => unknown } }).__map;
        return m ? !!m.getLayer(`race-line-${id}`) : false;
      }, race.id),
    )
    .toBe(true);

  await page.locator(`[data-race-toggle="${race.id}"]`).uncheck();
  await expect
    .poll(async () =>
      page.evaluate((id) => {
        const m = (window as unknown as {
          __map?: { getLayoutProperty: (id: string, p: string) => string };
        }).__map;
        return m ? m.getLayoutProperty(`race-line-${id}`, "visibility") : null;
      }, race.id),
    )
    .toBe("none");

  await page.locator(`[data-race-toggle="${race.id}"]`).check();
  await expect
    .poll(async () =>
      page.evaluate((id) => {
        const m = (window as unknown as {
          __map?: { getLayoutProperty: (id: string, p: string) => string };
        }).__map;
        return m ? m.getLayoutProperty(`race-line-${id}`, "visibility") : null;
      }, race.id),
    )
    .toBe("visible");

  await layers.click();
  await expect(page.getByTestId("layers-control-popover")).toHaveCount(0);
});

test("/#/parametres exposes Événement, Roadbook and Données tabs", async ({ page }) => {
  await page.goto("/#/parametres");
  await expect(page.getByTestId("settings-tab-evenement")).toBeVisible();
  await expect(page.getByTestId("settings-tab-roadbook")).toBeVisible();
  await expect(page.getByTestId("settings-tab-donnees")).toBeVisible();
  // Default tab is Événement.
  await expect(page.getByTestId("settings-tab-evenement")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("event-settings")).toBeVisible();

  await page.getByTestId("settings-tab-donnees").click();
  await expect(page).toHaveURL(/#\/parametres\?tab=donnees$/);
  await expect(page.getByTestId("backup-settings")).toBeVisible();
  await expect(page.getByTestId("archive-page")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("settings-tab-donnees")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("backup-settings")).toBeVisible();
});

test("push-stack: VS row click pushes detail; browser back returns to list", async ({
  page,
  request,
}) => {
  const vs = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "PB-Push", lat: 48.0, lon: 2.0 } }),
  );

  await page.goto("/#/vs");
  await expect(page.getByTestId("sidebar-vs-list")).toBeVisible();
  await page.locator(`[data-vs-row="${vs.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/vs/${vs.id}$`));
  await expect(page.getByTestId("sidebar-vs-detail")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/vs$/);
  await expect(page.getByTestId("sidebar-vs-list")).toBeVisible();
});

test("push-stack: Courses row click pushes race detail; browser back returns", async ({
  page,
  request,
}) => {
  const race = await unwrap<{ id: number }>(
    await request.post("/api/races", { data: { name: "Course-X" } }),
  );

  await page.goto("/#/courses");
  await expect(page.getByTestId("sidebar-courses-list")).toBeVisible();
  await page.locator(`[data-race-row="${race.id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#/courses/${race.id}$`));
  await expect(page.getByTestId("sidebar-courses-detail")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/courses$/);
  await expect(page.getByTestId("sidebar-courses-list")).toBeVisible();
});

test("warnings slide-over: Escape, outside click, and row click close it", async ({
  page,
  request,
}) => {
  const vs = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "PB-Issue", lat: 48.0, lon: 2.0 } }),
  );
  const vol = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: {
        first_name: "Léa",
        last_name: "Issue",
        phone: "+33611111199",
        role_types: ["Ravitaillement"],
        availability: [{ day: 1, start: "06:00", end: "23:00" }],
      },
    }),
  );
  const m1 = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vs.id}/missions`, {
      data: {
        day: 1,
        start_time: "08:00",
        end_time: "10:00",
        role_type: "Ravitaillement",
        headcount: 1,
      },
    }),
  );
  const m2 = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vs.id}/missions`, {
      data: {
        day: 1,
        start_time: "09:00",
        end_time: "11:00",
        role_type: "Ravitaillement",
        headcount: 1,
      },
    }),
  );
  await request.post("/api/assignments", {
    data: { mission_id: m1.id, volunteer_id: vol.id },
  });
  await request.post("/api/assignments", {
    data: { mission_id: m2.id, volunteer_id: vol.id },
  });
  await expect
    .poll(async () => {
      const ws = await (await request.get("/api/warnings")).json();
      return ws.some((w: { kind: string }) => w.kind === "double_booking");
    })
    .toBe(true);

  await page.goto("/#/courses");
  const counter = page.getByTestId("global-issue-counter");
  await expect(counter).toBeVisible();

  await counter.click();
  await expect(page.getByTestId("warnings-slide-over")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("warnings-slide-over")).toHaveCount(0);

  await counter.click();
  await expect(page.getByTestId("warnings-slide-over")).toBeVisible();
  await page.getByTestId("warnings-overlay").click({ position: { x: 20, y: 200 } });
  await expect(page.getByTestId("warnings-slide-over")).toHaveCount(0);

  await counter.click();
  await expect(page.getByTestId("warnings-slide-over")).toBeVisible();
  const row = page
    .getByTestId("warnings-slide-over")
    .locator('[data-kind="double_booking"]')
    .first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`#/ressources/benevoles/${vol.id}$`));
  await expect(page.getByTestId("warnings-slide-over")).toHaveCount(0);
});

test("direct deep-link to /ressources/benevoles/:id renders detail", async ({
  page,
  request,
}) => {
  const vol = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: { first_name: "Direct", last_name: "Deep", phone: "+33611111122" },
    }),
  );
  await page.goto(`/#/ressources/benevoles/${vol.id}`);
  await expect(page.getByText("Direct Deep")).toBeVisible({ timeout: 5_000 });
});
