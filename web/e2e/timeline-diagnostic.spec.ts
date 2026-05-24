import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

import { ensureEventInitialized, resetState, unwrap } from "./helpers";

test.describe.configure({ mode: "serial" });

interface Seed {
  vsA: { id: number };
  vsB: { id: number };
  vsC: { id: number };
  driver: { id: number };
  pass1: { id: number };
  pass2: { id: number };
  pass3: { id: number };
  car: { id: number };
  missionA1: { id: number };
  missionB1: { id: number };
  missionA2: { id: number };
  missionC2: { id: number };
  missionA3: { id: number };
  capacityTrip: { id: number };
  strandedFromMission: { id: number };
  strandedToMission: { id: number };
}

async function seedDiagnosticEvent(request: APIRequestContext): Promise<Seed> {
  const vsA = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "PB-Alpha", lat: 48.0, lon: 2.0 } }),
  );
  const vsB = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "PB-Bravo", lat: 48.05, lon: 2.05 } }),
  );
  const vsC = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "PB-Charlie", lat: 48.1, lon: 2.1 } }),
  );

  const driver = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: {
        first_name: "Dan",
        last_name: "Driver",
        phone: "+33611111111",
        can_drive: true,
        availability: [
          { day: 1, start: "06:00", end: "23:59" },
          { day: 2, start: "06:00", end: "23:59" },
          { day: 3, start: "06:00", end: "23:59" },
        ],
      },
    }),
  );

  // pass1 has missions on day 2 at different VS WITH a trip → capacity_exceeded.
  const pass1 = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: {
        first_name: "Patty",
        last_name: "One",
        phone: "+33611111112",
        availability: [{ day: 2, start: "06:00", end: "23:59" }],
      },
    }),
  );
  const pass2 = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: {
        first_name: "Patty",
        last_name: "Two",
        phone: "+33611111113",
        availability: [{ day: 2, start: "06:00", end: "23:59" }],
      },
    }),
  );

  // pass3 has consecutive missions on day 3 at different VS WITHOUT a trip → stranded.
  const pass3 = await unwrap<{ id: number }>(
    await request.post("/api/volunteers", {
      data: {
        first_name: "Sandy",
        last_name: "Stranded",
        phone: "+33611111114",
        availability: [{ day: 3, start: "06:00", end: "23:59" }],
      },
    }),
  );

  // Bike with 2 seats. We'll put 3 boarders on it → capacity_exceeded.
  const car = await unwrap<{ id: number }>(
    await request.post("/api/cars", {
      data: { name: "Tandem", seats: 2, default_driver_id: driver.id },
    }),
  );

  // Missions spread across days at different VS so the gantt has multiple
  // rows. ISO timestamps so the timeline projection renders the bars (the
  // canvas skips bars whose start/end aren't finite ms).
  const missionA1 = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vsA.id}/missions`, {
      data: {
        day: 1,
        start_time: "2026-06-01T08:00:00Z",
        end_time: "2026-06-01T12:00:00Z",
        role_type: "Signaleur",
        headcount: 1,
      },
    }),
  );
  const missionB1 = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vsB.id}/missions`, {
      data: {
        day: 1,
        start_time: "2026-06-01T13:00:00Z",
        end_time: "2026-06-01T17:00:00Z",
        role_type: "Signaleur",
        headcount: 1,
      },
    }),
  );
  const missionA2 = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vsA.id}/missions`, {
      data: {
        day: 2,
        start_time: "2026-06-02T08:00:00Z",
        end_time: "2026-06-02T10:00:00Z",
        role_type: "Signaleur",
        headcount: 1,
      },
    }),
  );
  const missionC2 = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vsC.id}/missions`, {
      data: {
        day: 2,
        start_time: "2026-06-02T11:00:00Z",
        end_time: "2026-06-02T13:00:00Z",
        role_type: "Signaleur",
        headcount: 1,
      },
    }),
  );
  const missionA3 = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vsA.id}/missions`, {
      data: {
        day: 3,
        start_time: "2026-06-03T05:00:00Z",
        end_time: "2026-06-03T06:00:00Z",
        role_type: "Signaleur",
        headcount: 1,
      },
    }),
  );

  // Stranded pair on day 3 for pass3: VS-A then VS-B, no trip. Carefully
  // separated in time from any sibling bars on the same row so hit-tests
  // resolve to the intended bar.
  const strandedFromMission = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vsA.id}/missions`, {
      data: {
        day: 3,
        start_time: "2026-06-03T09:00:00Z",
        end_time: "2026-06-03T11:00:00Z",
        role_type: "Signaleur",
        headcount: 1,
      },
    }),
  );
  const strandedToMission = await unwrap<{ id: number }>(
    await request.post(`/api/vs/${vsB.id}/missions`, {
      data: {
        day: 3,
        start_time: "2026-06-03T13:00:00Z",
        end_time: "2026-06-03T16:00:00Z",
        role_type: "Signaleur",
        headcount: 1,
      },
    }),
  );

  // pass1 + pass2 cover the day-2 capacity trip.
  await request.post("/api/assignments", {
    data: { mission_id: missionA2.id, volunteer_id: pass1.id },
  });
  await request.post("/api/assignments", {
    data: { mission_id: missionC2.id, volunteer_id: pass1.id },
  });
  await request.post("/api/assignments", {
    data: { mission_id: missionA2.id, volunteer_id: pass2.id },
  });

  // pass3 covers the stranded pair → fires `stranded` warning.
  await request.post("/api/assignments", {
    data: { mission_id: strandedFromMission.id, volunteer_id: pass3.id },
  });
  await request.post("/api/assignments", {
    data: { mission_id: strandedToMission.id, volunteer_id: pass3.id },
  });

  // Capacity trip: 2-seat car, 3 boarders (driver + pass1 + pass2 + pass3 = 4
  // bodies; seats = 2 → over-capacity). Board everyone at VS-A then alight at
  // VS-C on day 2.
  const tripRes = await request.post("/api/trips", {
    data: {
      day: 2,
      driver_id: driver.id,
      car_id: car.id,
      mode: "drive",
      notes: "",
      stops: [
        {
          vs_id: vsA.id,
          time: "2026-06-02T10:10:00Z",
          board: [pass1.id, pass2.id, pass3.id],
        },
        {
          vs_id: vsC.id,
          time: "2026-06-02T10:50:00Z",
          alight: [pass1.id, pass2.id, pass3.id],
        },
      ],
    },
  });
  expect(tripRes.ok()).toBe(true);
  const capacityTrip = await unwrap<{ id: number }>(tripRes);

  // Sanity-check: capacity_exceeded + stranded must both surface.
  const warnings = await (await request.get("/api/warnings")).json();
  expect(warnings.some((w: { kind: string }) => w.kind === "capacity_exceeded")).toBe(true);
  expect(warnings.some((w: { kind: string }) => w.kind === "stranded")).toBe(true);

  return {
    vsA,
    vsB,
    vsC,
    driver,
    pass1,
    pass2,
    pass3,
    car,
    missionA1,
    missionB1,
    missionA2,
    missionC2,
    missionA3,
    capacityTrip,
    strandedFromMission,
    strandedToMission,
  };
}

async function gotoChronologie(page: Page): Promise<void> {
  await page.goto("/#/chronologie");
  await page.getByTestId("timeline-canvas").waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      !!(window as unknown as { __timelineMap?: { isStyleLoaded: () => boolean } }).__timelineMap,
    { timeout: 15_000 },
  );
}

interface BarGeom {
  x0: number;
  x1: number;
  y: number;
  rh: number;
}

// barGeometry computes the screen-space rect of a mission/trip-leg bar by
// reading the layout that `TimelineView` publishes on `window.__vmTimelineLayout`.
// Working off the live layout avoids drifting from the component's own row /
// time computation.
async function barGeometry(
  page: Page,
  kind: "mission" | "trip-leg",
  id: number,
  legIndex: number,
): Promise<BarGeom | null> {
  return page.evaluate(
    ([k, missionOrTripID, legIdx]) => {
      const HEADER_H = 28;
      const ROW_H = 22;
      const BADGE_ROW_H = 12;
      const LEFT_GUTTER = 140;
      const canvas = document.querySelector(
        "[data-testid='timeline-canvas']",
      ) as HTMLCanvasElement | null;
      if (!canvas) return null;
      const w = canvas.clientWidth;
      const rect = canvas.getBoundingClientRect();
      const layout = (
        window as unknown as {
          __vmTimelineLayout?: {
            rows: Array<{ kind: string }>;
            bars: Array<{
              rowIndex: number;
              startMs: number;
              endMs: number;
              kind: string;
              payload?: { missionID?: number; tripID?: number; legIndex?: number };
            }>;
            rowOffsets: number[];
            timeBounds: { start: number; end: number };
          };
        }
      ).__vmTimelineLayout;
      if (!layout) return null;
      const innerW = w - LEFT_GUTTER;
      const range = layout.timeBounds.end - layout.timeBounds.start;
      const target = layout.bars.findIndex((b) => {
        if (k === "mission") {
          return b.kind === "mission" && b.payload?.missionID === missionOrTripID;
        }
        return (
          b.kind === "trip-leg" &&
          b.payload?.tripID === missionOrTripID &&
          b.payload?.legIndex === legIdx
        );
      });
      if (target < 0) return null;
      const b = layout.bars[target];
      const baseY = HEADER_H + layout.rowOffsets[b.rowIndex];
      const rh = layout.rows[b.rowIndex].kind === "race-badge" ? BADGE_ROW_H : ROW_H;
      const x0 = LEFT_GUTTER + ((b.startMs - layout.timeBounds.start) / range) * innerW;
      const x1 = LEFT_GUTTER + ((b.endMs - layout.timeBounds.start) / range) * innerW;
      return { x0: rect.left + x0, x1: rect.left + x1, y: rect.top + baseY, rh };
    },
    [kind, id, legIndex] as const,
  );
}

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("stranded scenario surfaces tooltip with FR label on the from-mission bar", async ({
  page,
  request,
}) => {
  const seed = await seedDiagnosticEvent(request);
  await gotoChronologie(page);

  // The stranded triangle and tooltip are anchored to the from-mission bar.
  // We hover the canvas at the bar's center and assert the tooltip shows up
  // with the localized kind label. Pixel-perfect triangle assertions are too
  // fragile; tooltip content is the deterministic check.
  await waitForTimelineLayout(page);
  const geom = await barGeometry(page, "mission", seed.strandedFromMission.id, 0);
  expect(geom, "from-mission bar geometry").not.toBeNull();
  const cx = (geom!.x0 + geom!.x1) / 2;
  const cy = geom!.y + geom!.rh / 2;
  // Move first to bypass hover-flicker, then settle on the bar.
  await page.mouse.move(cx, cy - 30);
  await page.mouse.move(cx, cy);
  const tooltip = page.getByTestId("timeline-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Sans transport");
});

test("capacity-exceeded trip leg surfaces tooltip with FR label", async ({
  page,
  request,
}) => {
  const seed = await seedDiagnosticEvent(request);
  await gotoChronologie(page);
  await waitForTimelineLayout(page);
  const geom = await barGeometry(page, "trip-leg", seed.capacityTrip.id, 0);
  expect(geom, "capacity-trip leg geometry").not.toBeNull();
  const cx = (geom!.x0 + geom!.x1) / 2;
  const cy = geom!.y + geom!.rh / 2;
  await page.mouse.move(cx, cy - 30);
  await page.mouse.move(cx, cy);
  const tooltip = page.getByTestId("timeline-tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Capacité dépassée");
});

test("clicking a mission bar routes to the VS sidebar and primes the map echo", async ({
  page,
  request,
}) => {
  const seed = await seedDiagnosticEvent(request);
  await gotoChronologie(page);
  await waitForTimelineLayout(page);
  const geom = await barGeometry(page, "mission", seed.missionA2.id, 0);
  expect(geom).not.toBeNull();
  await page.mouse.click((geom!.x0 + geom!.x1) / 2, geom!.y + geom!.rh / 2);
  await expect.poll(() => page.url()).toMatch(
    new RegExp(`#/vs/${seed.vsA.id}\\?mission=${seed.missionA2.id}`),
  );

  // Hash-route back to chronologie without a full reload so the Zustand
  // selection store persists; the timeline map remounts with the selection
  // intact and emits the pulse + ring layers.
  await page.evaluate(() => {
    window.location.hash = "/chronologie";
  });
  await page.getByTestId("timeline-canvas").waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      !!(window as unknown as { __timelineMap?: { isStyleLoaded: () => boolean } }).__timelineMap,
    { timeout: 15_000 },
  );

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const m = (
            window as unknown as {
              __timelineMap?: {
                getLayer: (id: string) => unknown;
                getSource: (id: string) => unknown;
                getFilter?: (id: string) => unknown;
              };
            }
          ).__timelineMap;
          if (!m) return "no-map";
          const pulse = m.getLayer("tl-vs-pulse");
          const ring = m.getLayer("tl-volunteers-ring");
          return { pulse: !!pulse, ring: !!ring };
        }),
      { timeout: 10_000 },
    )
    .toMatchObject({ pulse: true });
});

test("clicking a trip-leg bar routes to the trip editor and adds the polyline source", async ({
  page,
  request,
}) => {
  const seed = await seedDiagnosticEvent(request);
  await gotoChronologie(page);
  await waitForTimelineLayout(page);
  const geom = await barGeometry(page, "trip-leg", seed.capacityTrip.id, 0);
  expect(geom).not.toBeNull();
  await page.mouse.click((geom!.x0 + geom!.x1) / 2, geom!.y + geom!.rh / 2);
  await expect.poll(() => page.url()).toMatch(
    new RegExp(`#/trajets/${seed.capacityTrip.id}$`),
  );

  await page.evaluate(() => {
    window.location.hash = "/chronologie";
  });
  await page.getByTestId("timeline-canvas").waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      !!(window as unknown as { __timelineMap?: { isStyleLoaded: () => boolean } }).__timelineMap,
    { timeout: 15_000 },
  );

  const sourceID = `tl-trip-polyline-${seed.capacityTrip.id}`;
  await expect
    .poll(
      async () =>
        page.evaluate((sid) => {
          const m = (
            window as unknown as {
              __timelineMap?: { getSource: (id: string) => unknown };
            }
          ).__timelineMap;
          return !!m?.getSource(sid);
        }, sourceID),
      { timeout: 10_000 },
    )
    .toBe(true);
});

test("space toggles play state", async ({ page, request }) => {
  await seedDiagnosticEvent(request);
  await gotoChronologie(page);

  const btn = page.getByTestId("timeline-toggle-play");
  const beforeLabel = await btn.getAttribute("aria-label");
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Space");
  await expect
    .poll(async () => btn.getAttribute("aria-label"))
    .not.toBe(beforeLabel);
  // Toggle back so the rest of the test doesn't drift the cursor.
  await page.keyboard.press("Space");
});

test("ArrowRight × 4 steps the cursor by 60 minutes", async ({ page, request }) => {
  await seedDiagnosticEvent(request);
  await gotoChronologie(page);

  const label = page.getByTestId("timeline-cursor-label");
  const before = await label.textContent();
  expect(before).toBeTruthy();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("ArrowRight");
  }
  await expect
    .poll(async () => {
      const txt = (await label.textContent()) ?? "";
      return msFromCursorLabel(txt) - msFromCursorLabel(before!);
    })
    .toBe(60 * 60_000);
});

test("segmented J2 window constrains the cursor to day 2", async ({ page, request }) => {
  await seedDiagnosticEvent(request);
  await gotoChronologie(page);

  await page.getByTestId("timeline-window-day-2").click();
  await expect(page.getByTestId("timeline-cursor-label")).toContainText("2026-06-02");

  // Restore the full window before tearing down.
  await page.getByTestId("timeline-window-tout").click();
});

test("dragging the resize handle adjusts the gantt height and persists across reloads", async ({
  page,
  request,
}) => {
  await seedDiagnosticEvent(request);
  await gotoChronologie(page);

  const handle = page.getByTestId("timeline-resize-handle");
  const startBox = await handle.boundingBox();
  expect(startBox).toBeTruthy();
  const initialStored = await page.evaluate(() => localStorage.getItem("timeline.heightPx"));

  // Drag the handle up by 80 px → gantt should grow by ~80 px.
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    startBox!.x + startBox!.width / 2,
    startBox!.y - 80,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect
    .poll(async () => Number(await page.evaluate(() => localStorage.getItem("timeline.heightPx"))))
    .toBeGreaterThan(Number(initialStored ?? 0));
  const newStored = Number(await page.evaluate(() => localStorage.getItem("timeline.heightPx")));

  // Reload → height persists.
  await page.reload();
  await page.getByTestId("timeline-canvas").waitFor({ state: "visible" });
  const reloaded = Number(await page.evaluate(() => localStorage.getItem("timeline.heightPx")));
  expect(reloaded).toBe(newStored);
});

test("double-clicking the resize handle collapses then restores the gantt", async ({
  page,
  request,
}) => {
  await seedDiagnosticEvent(request);
  await gotoChronologie(page);

  // Clear any pre-existing collapsed state to make the test independent of order.
  await page.evaluate(() => localStorage.removeItem("timeline.collapsed"));
  await page.reload();
  await page.getByTestId("timeline-canvas").waitFor({ state: "visible" });

  const handle = page.getByTestId("timeline-resize-handle");
  await handle.dblclick();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("timeline.collapsed")))
    .toBe("true");

  await handle.dblclick();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("timeline.collapsed")))
    .toBe("false");
});

test("gantt scroll container overflows vertically when many VS rows exist", async ({
  page,
  request,
}) => {
  await seedDiagnosticEvent(request);
  // Add enough extra VS to force the gantt to overflow regardless of viewport.
  for (let i = 0; i < 25; i++) {
    await request.post("/api/vs", {
      data: { name: `Bulk-${i}`, lat: 48.0 + i * 0.001, lon: 2.0 + i * 0.001 },
    });
  }
  // Each new VS gets at least one mission so missionsByVS surfaces a row.
  const vsList = (await (await request.get("/api/vs")).json()) as Array<{ id: number; name: string }>;
  for (const v of vsList) {
    if (!v.name.startsWith("Bulk-")) continue;
    await request.post(`/api/vs/${v.id}/missions`, {
      data: {
        day: 1,
        start_time: "2026-06-01T09:00:00Z",
        end_time: "2026-06-01T10:00:00Z",
        role_type: "Signaleur",
        headcount: 1,
      },
    });
  }

  await gotoChronologie(page);

  const scroller = page.getByTestId("timeline-scroll");
  await scroller.evaluate((el) => el.scrollTo({ top: 200 }));
  await expect
    .poll(async () => scroller.evaluate((el) => (el as HTMLElement).scrollTop))
    .toBeGreaterThan(0);
  await expect(page.getByTestId("timeline-canvas")).toBeVisible();
});

async function waitForTimelineLayout(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const l = (window as unknown as { __vmTimelineLayout?: { bars: unknown[] } })
        .__vmTimelineLayout;
      return !!l && Array.isArray(l.bars) && l.bars.length > 0;
    },
    { timeout: 10_000 },
  );
}

function msFromCursorLabel(label: string): number {
  // Label format: "YYYY-MM-DD HH:MM UTC".
  const m = label.match(/(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/);
  if (!m) return Number.NaN;
  return Date.parse(`${m[1]}T${m[2]}:00Z`);
}
