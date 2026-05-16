import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTrip, deleteTrip, listTransportNeeds, listTrips, replaceTrip } from "../api";

describe("trip api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("listTrips includes day when given", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await listTrips(2);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/trips?day=2");
  });

  it("listTrips skips query when undefined", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await listTrips();
    expect(mock.mock.calls[0]?.[0]).toBe("/api/trips");
  });

  it("createTrip POSTs to /api/trips", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1, day: 1, driver_id: 1, car_id: 1, mode: "drive", notes: "",
          stops: [], created_at: "", updated_at: "",
        }),
        { status: 201 },
      ),
    );
    globalThis.fetch = mock;
    await createTrip({
      day: 1,
      driver_id: 1,
      car_id: 1,
      mode: "drive",
      notes: "",
      stops: [{ vs_id: 1, time: "08:00" }, { vs_id: 2, time: "08:30" }],
    });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/trips");
    expect(mock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("replaceTrip PUTs to /api/trips/{id}", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 7, day: 1, driver_id: 1, car_id: 1, mode: "drive", notes: "",
          stops: [], created_at: "", updated_at: "",
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mock;
    await replaceTrip(7, {
      day: 1, driver_id: 1, car_id: 1, mode: "drive", notes: "",
      stops: [{ vs_id: 1, time: "08:00" }, { vs_id: 2, time: "08:30" }],
    });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/trips/7");
    expect(mock.mock.calls[0]?.[1]?.method).toBe("PUT");
  });

  it("deleteTrip issues DELETE", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = mock;
    await deleteTrip(9);
    expect(mock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("listTransportNeeds appends day", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await listTransportNeeds(3);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/transport-needs?day=3");
  });
});
