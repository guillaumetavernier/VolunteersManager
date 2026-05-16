import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCar, deleteCar, listCars, patchCar } from "../api";

describe("car api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("listCars returns array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    expect(await listCars()).toEqual([]);
  });

  it("createCar POSTs JSON", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 1, name: "Kangoo", seats: 5, default_driver_id: null, notes: null, created_at: "", updated_at: "" }),
        { status: 201 },
      ),
    );
    globalThis.fetch = mock;
    const got = await createCar({ name: "Kangoo", seats: 5 });
    expect(got.id).toBe(1);
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("patchCar PATCHes the right path", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 7, name: "X", seats: 5, default_driver_id: null, notes: null, created_at: "", updated_at: "" }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mock;
    await patchCar(7, { seats: 3 });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/cars/7");
  });

  it("deleteCar issues DELETE", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = mock;
    await deleteCar(7);
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
