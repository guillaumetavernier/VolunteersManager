import { expect, test } from "@playwright/test";
import { ensureEventInitialized, resetState, unwrap } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("double-assign surfaces a double_booking warning; unassign removes it", async ({
  page,
  request,
}) => {
  // Seed VS + volunteer + two overlapping missions.
  const vsRes = await request.post("/api/vs", {
    data: { name: "Carrefour", lat: 48.86, lon: 2.34 },
  });
  const vs = await unwrap<{ id: number }>(vsRes);

  const volRes = await request.post("/api/volunteers", {
    data: {
      first_name: "Claire",
      last_name: "Durand",
      phone: "+33611111111",
      role_types: ["Signaleur"],
      availability: [{ day: 1, start: "06:00", end: "23:00" }],
    },
  });
  const vol = await unwrap<{ id: number }>(volRes);

  const m1Res = await request.post(`/api/vs/${vs.id}/missions`, {
    data: { day: 1, start_time: "08:00", end_time: "10:00", role_type: "Signaleur", headcount: 1 },
  });
  const m1 = await unwrap<{ id: number }>(m1Res);
  const m2Res = await request.post(`/api/vs/${vs.id}/missions`, {
    data: { day: 1, start_time: "09:00", end_time: "11:00", role_type: "Signaleur", headcount: 1 },
  });
  const m2 = await unwrap<{ id: number }>(m2Res);

  // First assignment: no double_booking yet.
  const a1Res = await request.post("/api/assignments", {
    data: { mission_id: m1.id, volunteer_id: vol.id },
  });
  expect(a1Res.ok()).toBe(true);

  // Second assignment — should produce a double_booking.
  const a2Res = await request.post("/api/assignments", {
    data: { mission_id: m2.id, volunteer_id: vol.id },
  });
  const a2Body = await a2Res.json();
  const a2 = a2Body.data as { id: number };
  const added = (a2Body.warnings?.added ?? []) as Array<{ kind: string }>;
  expect(added.some((w) => w.kind === "double_booking")).toBe(true);

  // GET /api/warnings includes it.
  const wList = await (await request.get("/api/warnings")).json();
  expect(wList.some((w: { kind: string }) => w.kind === "double_booking")).toBe(true);

  // UI: global counter shows the count + badge in /issues panel.
  await page.goto("/#/issues");
  await expect(page.getByRole("heading", { name: /problèmes/i })).toBeVisible();
  await expect(page.locator(`[data-kind="double_booking"]`).first()).toBeVisible();

  // Remove one of the overlapping assignments.
  const delRes = await request.delete(`/api/assignments/${a2.id}`);
  const delBody = await delRes.json();
  const removed = (delBody.warnings?.removed ?? []) as string[];
  expect(removed.length).toBeGreaterThan(0);

  // GET /api/warnings no longer includes double_booking.
  const wList2 = await (await request.get("/api/warnings")).json();
  expect(wList2.some((w: { kind: string }) => w.kind === "double_booking")).toBe(false);
});
