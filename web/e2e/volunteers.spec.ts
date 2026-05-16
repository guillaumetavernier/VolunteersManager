import { expect, test } from "@playwright/test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ensureEventInitialized } from "./helpers";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
  await ensureEventInitialized(request);
  // Wipe volunteers (any leftovers) before each spec.
  const xs = await (await request.get("/api/volunteers?archived=all")).json();
  for (const v of xs) await request.delete(`/api/volunteers/${v.id}?hard=true&force=true`);
  const cars = await (await request.get("/api/cars")).json();
  for (const c of cars) await request.delete(`/api/cars/${c.id}`);
});

test("CSV import: 50 rows + 5 duplicates → counts → commit → list shows 50", async ({ page, request }) => {
  // Seed 5 existing volunteers so CSV duplicates match them.
  const seeds = [
    { fn: "Marie", ln: "Dupont" },
    { fn: "Jean", ln: "Martin" },
    { fn: "Paul", ln: "Petit" },
    { fn: "Anne", ln: "Lefevre" },
    { fn: "Luc", ln: "Bernard" },
  ];
  for (let i = 0; i < seeds.length; i++) {
    const r = await request.post("/api/volunteers", {
      data: { first_name: seeds[i].fn, last_name: seeds[i].ln, phone: `+3361111110${i}` },
    });
    expect(r.ok()).toBe(true);
  }

  // Build CSV with BOM + semicolon delimiter, 5 duplicates + 45 new = 50 rows.
  const lines: string[] = [];
  lines.push("Prénom;Nom;Téléphone;Email");
  for (let i = 0; i < seeds.length; i++) {
    lines.push(`${seeds[i].fn};${seeds[i].ln};06 11 22 33 ${String(i).padStart(2, "0")};`);
  }
  for (let i = 0; i < 45; i++) {
    lines.push(
      `First${String(i).padStart(2, "0")};Last${String(i).padStart(2, "0")};06 22 33 44 ${String(i % 100).padStart(2, "0")};f${i}@example.org`,
    );
  }
  const csv = "﻿" + lines.join("\n") + "\n";
  const tmpPath = path.join(os.tmpdir(), `vm-roster-${Date.now()}.csv`);
  await fs.writeFile(tmpPath, csv, "utf-8");

  // Drive the wizard UI.
  await page.goto("/#/volunteers/import");
  await page.locator('input[type="file"]').setInputFiles(tmpPath);

  // Mapping step shows the auto-detected mapping. Submit it.
  await expect(page.getByRole("button", { name: /calculer l'aperçu/i })).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /calculer l'aperçu/i }).click();

  // Preview shows the right counts.
  await expect(page.locator('[data-stat="Nouveaux"]')).toHaveText("45");
  await expect(page.locator('[data-stat="Mises à jour"]')).toHaveText("5");
  await expect(page.locator('[data-stat="Ambigus"]')).toHaveText("0");

  // Commit.
  await page.locator('[data-action="commit"]').click();

  await expect(page.getByText(/import terminé/i)).toBeVisible({ timeout: 5_000 });

  // The roster now has 50 volunteers.
  const after = await (await request.get("/api/volunteers")).json();
  expect(after.length).toBe(50);
});

test("Form-create volunteer; archive removes from default list; reappears with show-archived", async ({
  page,
  request,
}) => {
  await page.goto("/#/volunteers");
  await page.getByRole("button", { name: /^nouveau bénévole$/i }).click();
  await page.getByLabel("Prénom", { exact: true }).fill("Sophie");
  await page.getByLabel("Nom", { exact: true }).fill("Bernard");
  // PhoneInput: enter local digits; component adds +33 prefix.
  await page.getByPlaceholder(/\+33/).first().fill("612345678");
  await page.getByRole("button", { name: /^créer$/i }).click();

  // Wait for it to appear in the list.
  await expect(page.getByText("Sophie Bernard")).toBeVisible({ timeout: 5_000 });

  const xs = await (await request.get("/api/volunteers")).json();
  const v = xs.find((x: { first_name: string }) => x.first_name === "Sophie");
  expect(v).toBeTruthy();
  expect(v.phone).toBe("+33612345678");

  // Archive via API (faster than UI) then verify default list excludes it.
  await request.delete(`/api/volunteers/${v.id}`);
  await page.reload();
  await expect(page.getByText("Sophie Bernard")).toHaveCount(0);

  // Toggle "show archived".
  await page.getByLabel(/afficher les archivés/i).check();
  await expect(page.getByText(/Sophie Bernard/i)).toBeVisible();
});

test("Form-create car; default driver picker only lists can_drive volunteers", async ({ page, request }) => {
  await request.post("/api/volunteers", {
    data: { first_name: "Alice", last_name: "Driver", phone: "+33611111111", can_drive: true },
  });
  await request.post("/api/volunteers", {
    data: { first_name: "Bob", last_name: "Passenger", phone: "+33611111112", can_drive: false },
  });

  await page.goto("/#/cars");
  const driverSelect = page.getByLabel("Conducteur par défaut");
  await expect(driverSelect.locator("option", { hasText: "Alice Driver" })).toHaveCount(1);
  await expect(driverSelect.locator("option", { hasText: "Bob Passenger" })).toHaveCount(0);

  await page.getByLabel("Nom du véhicule").fill("Berlingo");
  await page.getByLabel("Places").fill("5");
  await driverSelect.selectOption({ label: "Alice Driver" });
  await page.getByRole("button", { name: /^ajouter$/i }).click();

  await expect(page.getByText("Berlingo")).toBeVisible({ timeout: 5_000 });
  const cars = await (await request.get("/api/cars")).json();
  expect(cars[0].name).toBe("Berlingo");
  expect(cars[0].default_driver_id).toBeTruthy();
});
