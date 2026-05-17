import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRace,
  getRaceTrack,
  listRaceVS,
  replaceRaceVS,
} from "../api";

describe("race api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("createRace posts JSON", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, name: "X", color: "#fff", created_at: "", updated_at: "" }), { status: 201 }),
    );
    globalThis.fetch = mock;
    const got = await createRace({ name: "X" });
    expect(got.id).toBe(1);
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("replaceRaceVS PUTs an array", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await replaceRaceVS(2, [{ vs_id: 5, sequence: 0 }]);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/races/2/vs");
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "PUT" });
  });

  it("listRaceVS returns entries with aggregated timing", async () => {
    const entry = {
      id: 1, race_id: 1, vs_id: 1, sequence: 0, projected_dist_m: null,
      earliest_first_in: "2026-06-01T06:00:00Z", latest_last_in: "2026-06-01T08:00:00Z",
    };
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify([entry]), { status: 200 }));
    const xs = await listRaceVS(1);
    expect(xs).toHaveLength(1);
    expect(xs[0].earliest_first_in).toBe("2026-06-01T06:00:00Z");
  });

  it("getRaceTrack returns the FeatureCollection", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 }),
    );
    const got = await getRaceTrack(1);
    expect(got.type).toBe("FeatureCollection");
  });
});
