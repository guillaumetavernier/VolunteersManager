import { expect, test } from "@playwright/test";
import { ensureEventInitialized, resetState, unwrap, waitForMap } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("transport-need surfaces, trip covers it, stranded warning clears", async ({
  page,
  request,
}) => {
  // Seed: 2 VS, 1 driver + 1 passenger volunteer, 1 car, 2 missions on day 1
  // at different VS for the passenger.
  const vsARes = await request.post("/api/vs", {
    data: { name: "VS-A", lat: 48.0, lon: 2.0 },
  });
  const vsA = await unwrap<{ id: number }>(vsARes);
  const vsBRes = await request.post("/api/vs", {
    data: { name: "VS-B", lat: 48.1, lon: 2.1 },
  });
  const vsB = await unwrap<{ id: number }>(vsBRes);

  const driverRes = await request.post("/api/volunteers", {
    data: {
      first_name: "Dan",
      last_name: "Driver",
      phone: "+33611111111",
      role_types: ["Conducteur"],
      availability: [{ day: 1, start: "06:00", end: "20:00" }],
      can_drive: true,
    },
  });
  const driver = await unwrap<{ id: number }>(driverRes);
  const passRes = await request.post("/api/volunteers", {
    data: {
      first_name: "Pat",
      last_name: "Passenger",
      phone: "+33611111112",
      role_types: ["Signaleur"],
      availability: [{ day: 1, start: "06:00", end: "20:00" }],
    },
  });
  const pass = await unwrap<{ id: number }>(passRes);

  const carRes = await request.post("/api/cars", {
    data: { name: "Fiat", seats: 4, default_driver_id: driver.id },
  });
  const car = await unwrap<{ id: number }>(carRes);

  const m1Res = await request.post(`/api/vs/${vsA.id}/missions`, {
    data: { day: 1, start_time: "08:00", end_time: "10:00", role_type: "Signaleur", headcount: 1 },
  });
  const m1 = await unwrap<{ id: number }>(m1Res);
  const m2Res = await request.post(`/api/vs/${vsB.id}/missions`, {
    data: { day: 1, start_time: "11:00", end_time: "13:00", role_type: "Signaleur", headcount: 1 },
  });
  const m2 = await unwrap<{ id: number }>(m2Res);

  // Assign passenger to both missions.
  await request.post("/api/assignments", { data: { mission_id: m1.id, volunteer_id: pass.id } });
  await request.post("/api/assignments", { data: { mission_id: m2.id, volunteer_id: pass.id } });

  // Matrix must contain haversine-fallback cells.
  const matrix = await (await request.get("/api/travel-times")).json();
  expect(Array.isArray(matrix)).toBe(true);
  const driveCell = matrix.find(
    (c: { from_vs: number; to_vs: number; mode: string }) =>
      c.from_vs === vsA.id && c.to_vs === vsB.id && c.mode === "drive",
  );
  expect(driveCell, "expected a (A→B, drive) cell").toBeTruthy();
  expect(["fallback", "auto"]).toContain(driveCell.source);

  // /api/transport-needs lists the passenger.
  const needs = await (await request.get(`/api/transport-needs?day=1`)).json();
  expect(needs.length).toBeGreaterThan(0);
  expect(
    needs.some(
      (n: { volunteer_id: number; from_vs: number; to_vs: number }) =>
        n.volunteer_id === pass.id && n.from_vs === vsA.id && n.to_vs === vsB.id,
    ),
  ).toBe(true);

  // Warnings include "stranded".
  const w1 = await (await request.get("/api/warnings")).json();
  expect(w1.some((w: { kind: string }) => w.kind === "stranded")).toBe(true);

  // Build a 2-stop trip via the API (the editor UI is exercised separately by
  // vitest; here we focus on the warning loop).
  const tripRes = await request.post("/api/trips", {
    data: {
      day: 1,
      driver_id: driver.id,
      car_id: car.id,
      mode: "drive",
      notes: "",
      stops: [
        { vs_id: vsA.id, time: "10:10", board: [pass.id] },
        { vs_id: vsB.id, time: "10:40", alight: [pass.id] },
      ],
    },
  });
  expect(tripRes.ok()).toBe(true);

  // Stranded warning clears.
  const w2 = await (await request.get("/api/warnings")).json();
  expect(w2.some((w: { kind: string }) => w.kind === "stranded")).toBe(false);

  // Editing a matrix cell manually flips to manual and survives recompute.
  const patch = await request.patch("/api/travel-times", {
    data: { from_vs: vsA.id, to_vs: vsB.id, mode: "drive", seconds: 9999 },
  });
  expect(patch.ok()).toBe(true);
  await request.post("/api/travel-times/recompute");
  const matrix2 = await (await request.get("/api/travel-times")).json();
  const manualCell = matrix2.find(
    (c: { from_vs: number; to_vs: number; mode: string }) =>
      c.from_vs === vsA.id && c.to_vs === vsB.id && c.mode === "drive",
  );
  expect(manualCell.source).toBe("manual");
  expect(manualCell.seconds).toBe(9999);

  // UI smoke: switch to the Besoins workspace mode in the Trajets sidebar.
  await page.goto("/#/trajets");
  await page.locator('[data-trajets-mode="besoins"]').click();
  await expect(page.locator('[data-trajets-mode="besoins"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // Switch back to trips and assert the created trip is listed.
  await page.locator('[data-trajets-mode="trips"]').click();
  await expect(page.locator(`[data-trip-id]`).first()).toBeVisible();
});

test("capacity warning surfaces when boarders > car seats", async ({ request }) => {
  const vsA = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "VA", lat: 48.0, lon: 2.0 } }),
  );
  const vsB = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "VB", lat: 48.1, lon: 2.1 } }),
  );
  const driver = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: {
        first_name: "D",
        last_name: "Driver",
        phone: "+33611111111",
        can_drive: true,
      },
    }),
  );
  const p1 = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: { first_name: "P1", last_name: "X", phone: "+33611111112" },
    }),
  );
  const p2 = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: { first_name: "P2", last_name: "X", phone: "+33611111113" },
    }),
  );
  const car = await unwrap<{ id: number }>(
    await request.post("/api/cars", {
      data: { name: "Bike", seats: 1, default_driver_id: driver.id },
    }),
  );
  await request.post("/api/trips", {
    data: {
      day: 1,
      driver_id: driver.id,
      car_id: car.id,
      mode: "drive",
      notes: "",
      stops: [
        { vs_id: vsA.id, time: "08:00", board: [p1.id, p2.id] },
        { vs_id: vsB.id, time: "08:30", alight: [p1.id, p2.id] },
      ],
    },
  });
  const ws = await (await request.get("/api/warnings")).json();
  expect(ws.some((w: { kind: string }) => w.kind === "capacity_exceeded")).toBe(true);
});

test("Voir matrice opens a Dialog without changing the URL", async ({ page }) => {
  await page.goto("/#/trajets");
  await expect(page).toHaveURL(/#\/trajets$/);
  await page.locator('[data-action="open-matrix"]').click();
  await expect(page.getByTestId("matrix-dialog")).toBeVisible();
  await expect(page).toHaveURL(/#\/trajets$/);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("matrix-dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/trajets$/);
});

test("Trajets/Besoins toggle swaps sidebar list content", async ({ page }) => {
  await page.goto("/#/trajets");
  await expect(page.locator('[data-trajets-mode="trips"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.locator('[data-testid="trip-list"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="transport-needs-list"]')).toHaveCount(0);
  await page.locator('[data-trajets-mode="besoins"]').click();
  await expect(page.locator('[data-testid="transport-needs-list"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="trip-list"]')).toHaveCount(0);
  await page.locator('[data-trajets-mode="trips"]').click();
  await expect(page.locator('[data-testid="trip-list"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="transport-needs-list"]')).toHaveCount(0);
});

test("clicking a VS marker while editing a trip appends a stop", async ({
  page,
  request,
}) => {
  const vsA = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "PB-Alpha", lat: 48.0, lon: 2.0 } }),
  );
  const vsB = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "PB-Beta", lat: 48.1, lon: 2.1 } }),
  );

  await page.goto("/#/trajets/new");
  await waitForMap(page);
  const stops = page.locator('[data-testid="stops"] [data-stop-index]');
  await expect(stops).toHaveCount(2);

  await page.locator(`[data-vs-id="${vsA.id}"]`).dispatchEvent("click");
  await expect(stops).toHaveCount(3);
  await expect(stops.nth(2).locator("select")).toHaveValue(String(vsA.id));

  await page.locator(`[data-vs-id="${vsB.id}"]`).dispatchEvent("click");
  await expect(stops).toHaveCount(4);
  await expect(stops.nth(3).locator("select")).toHaveValue(String(vsB.id));
});
