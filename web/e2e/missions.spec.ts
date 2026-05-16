import { expect, test } from "@playwright/test";
import { ensureEventInitialized, resetState, unwrap, waitForMap } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  await resetState(request);
});

test("VS missions: create 3, drag-assign, 409 on dup, grid view, cascade-delete", async ({
  page,
  request,
}) => {
  // Seed a VS via the API.
  const vsRes = await request.post("/api/vs", {
    data: { name: "Refuge Nord", lat: 48.86, lon: 2.34 },
  });
  expect(vsRes.ok()).toBe(true);
  const vs = await unwrap<{ id: number }>(vsRes);

  // Seed a volunteer with a role that matches the missions.
  const volRes = await request.post("/api/volunteers", {
    data: {
      first_name: "Marie",
      last_name: "Dupont",
      phone: "+33611111111",
      role_types: ["Ravitaillement"],
      availability: [{ day: 1, start: "06:00", end: "23:00" }],
    },
  });
  expect(volRes.ok()).toBe(true);
  const vol = await unwrap<{ id: number }>(volRes);

  // Open the VS sidebar via the VS tool. Click the marker → detail frame →
  // "Missions" button pushes the missions frame.
  await page.goto("/#/vs");
  await waitForMap(page);
  await page.locator(`[data-vs-name="Refuge Nord"]`).click();
  await expect(page).toHaveURL(/#\/vs\/\d+/);
  await page.locator('[data-action="open-missions"]').click();
  await expect(page.locator("[data-missions-panel]")).toBeVisible();

  // Create 3 missions on day 1 by clicking "Add mission", filling the form,
  // submitting, and repeating.
  for (let i = 0; i < 3; i++) {
    const startH = String(8 + i).padStart(2, "0");
    const endH = String(9 + i).padStart(2, "0");
    await page.locator('[data-action="add-mission"]').click();
    await page.getByLabel("Jour", { exact: true }).fill("1");
    await page.getByLabel("Effectif", { exact: true }).fill("1");
    await page.getByLabel("Rôle", { exact: true }).fill("Ravitaillement");
    await page.getByLabel("Début", { exact: true }).fill(`2026-06-01T${startH}:00`);
    await page.getByLabel("Fin", { exact: true }).fill(`2026-06-01T${endH}:00`);
    await page.getByRole("button", { name: /créer la mission/i }).click();
    // Wait for the new card to appear; we expect at least i+1 cards.
    await expect(page.locator("[data-mission-id]")).toHaveCount(i + 1);
  }

  // Confirm DB has 3 missions.
  const missionsAPI = await (await request.get(`/api/vs/${vs.id}/missions?day=1`)).json();
  expect(missionsAPI).toHaveLength(3);

  // Drag the volunteer onto the first mission card.
  const firstMission = page.locator("[data-mission-id]").first();
  await expect(firstMission.locator("[data-staffing-badge]")).toHaveText("0/1");
  const dragSrc = page.locator(`[data-draggable-volunteer][data-volunteer-id="${vol.id}"]`);
  const srcBox = await dragSrc.boundingBox();
  const dstBox = await firstMission.boundingBox();
  if (!srcBox || !dstBox) throw new Error("missing bounding box");
  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
  await page.mouse.down();
  // dnd-kit PointerSensor activates after distance:4 — give it a few small steps.
  await page.mouse.move(srcBox.x + 20, srcBox.y + 20, { steps: 4 });
  await page.mouse.move(dstBox.x + dstBox.width / 2, dstBox.y + dstBox.height / 2, { steps: 10 });
  await page.mouse.up();

  // Staffing badge updates 0/1 → 1/1.
  await expect(firstMission.locator("[data-staffing-badge]")).toHaveText("1/1", { timeout: 5_000 });

  // Try to drag the same volunteer onto the same mission again → toast 409.
  const dragSrc2Box = await dragSrc.boundingBox();
  const dstBox2 = await firstMission.boundingBox();
  if (!dragSrc2Box || !dstBox2) throw new Error("missing bounding box 2");
  await page.mouse.move(dragSrc2Box.x + dragSrc2Box.width / 2, dragSrc2Box.y + dragSrc2Box.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragSrc2Box.x + 20, dragSrc2Box.y + 20, { steps: 4 });
  await page.mouse.move(dstBox2.x + dstBox2.width / 2, dstBox2.y + dstBox2.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('[data-toast-kind="error"]')).toBeVisible({ timeout: 5_000 });

  // Reload — assignment persists.
  await page.reload();
  await waitForMap(page);
  await page.locator(`[data-vs-name="Refuge Nord"]`).click();
  await page.locator('[data-action="open-missions"]').click();
  await expect(page.locator("[data-mission-id]")).toHaveCount(3);
  await expect(page.locator("[data-mission-id]").first().locator("[data-staffing-badge]")).toHaveText("1/1");

  // Affectations page renders the chip.
  await page.goto("/#/affectations");
  await expect(page.locator("[data-missions-grid]")).toBeVisible();
  await expect(page.locator("[data-mission-chip]").first()).toBeVisible();

  // Cascade-delete: back to VS, attempt delete → confirmation dialog → cascade.
  await page.goto("/#/vs");
  await waitForMap(page);
  await page.locator(`[data-vs-name="Refuge Nord"]`).click();
  await expect(page).toHaveURL(/#\/vs\/\d+/);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /supprimer/i }).first().click();
  await expect(page.locator("[data-cascade-confirm]")).toBeVisible();
  await page.locator('[data-action="confirm-cascade-delete"]').click();

  // VS is gone.
  await expect.poll(async () => {
    const xs = await (await request.get("/api/vs")).json();
    return xs.length;
  }, { timeout: 5_000 }).toBe(0);
});

test("VS marker → VS detail → Missions → VolunteerPicker dialog opens", async ({
  page,
  request,
}) => {
  const vs = await unwrap<{ id: number }>(
    await request.post("/api/vs", { data: { name: "Refuge Sud", lat: 48.8, lon: 2.3 } }),
  );
  await request.post("/api/volunteers", {
    data: {
      first_name: "Camille",
      last_name: "Dupuis",
      phone: "+33611112233",
      role_types: ["Ravitaillement"],
      availability: [{ day: 1, start: "06:00", end: "23:00" }],
    },
  });
  await request.post(`/api/vs/${vs.id}/missions`, {
    data: {
      day: 1,
      start_time: "2026-06-01T08:00",
      end_time: "2026-06-01T10:00",
      role_type: "Ravitaillement",
      headcount: 1,
    },
  });

  await page.goto("/#/vs");
  await waitForMap(page);
  await page.locator(`[data-vs-name="Refuge Sud"]`).click();
  await expect(page).toHaveURL(/#\/vs\/\d+/);
  await page.locator('[data-action="open-missions"]').click();
  await expect(page.locator("[data-missions-panel]")).toBeVisible();
  await page.locator('[data-action="open-picker"]').first().click();
  const picker = page.getByRole("dialog", { name: /choisir un bénévole/i });
  await expect(picker).toBeVisible();

  await picker.getByText("Camille Dupuis").click();
  await expect(
    page.locator("[data-mission-id]").first().locator("[data-staffing-badge]"),
  ).toHaveText("1/1", { timeout: 5_000 });
});

test("race-delete scrubs mission tagged_race_ids", async ({ request }) => {
  // Seed VS, race, mission tagged with that race.
  const vsRes = await request.post("/api/vs", {
    data: { name: "Aid", lat: 48.86, lon: 2.34 },
  });
  const vs = await unwrap<{ id: number }>(vsRes);
  const raceRes = await request.post("/api/races", { data: { name: "Trail" } });
  const race = await unwrap<{ id: number }>(raceRes);
  const mRes = await request.post(`/api/vs/${vs.id}/missions`, {
    data: {
      day: 1,
      start_time: "2026-06-01T08:00",
      end_time: "2026-06-01T10:00",
      role_type: "R",
      headcount: 1,
      tagged_race_ids: [race.id],
    },
  });
  expect(mRes.ok()).toBe(true);
  const m = await unwrap<{ id: number; tagged_race_ids: number[] }>(mRes);
  expect(m.tagged_race_ids).toContain(race.id);

  // Delete the race.
  await request.delete(`/api/races/${race.id}`);

  // List missions — tag is gone.
  const after = await (await request.get(`/api/missions`)).json();
  const same = after.find((x: { id: number }) => x.id === m.id);
  expect(same.tagged_race_ids).not.toContain(race.id);
});
