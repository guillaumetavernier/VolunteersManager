import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRaceVSManual,
  createRace,
  getRaceTrack,
  listRaceVS,
  patchRaceVSTimes,
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
      new Response(JSON.stringify({ id: 1, name: "X", color: "#fff", front_pace: 12, tail_pace: 5, start_time: null, created_at: "", updated_at: "" }), { status: 201 }),
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

  it("patchRaceVSTimes targets the per-vs path", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 9, race_id: 2, vs_id: 5, sequence: 0, projected_dist_m: null, auto_first_in: null, auto_last_in: null, manual_first_in: "x", manual_last_in: null }), { status: 200 }),
    );
    globalThis.fetch = mock;
    await patchRaceVSTimes(2, 5, { manual_first_in: "x" });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/races/2/vs/5");
  });

  it("clearRaceVSManual builds query string with selected fields", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 9, race_id: 2, vs_id: 5, sequence: 0, projected_dist_m: null, auto_first_in: null, auto_last_in: null, manual_first_in: null, manual_last_in: null }), { status: 200 }),
    );
    globalThis.fetch = mock;
    await clearRaceVSManual(2, 5, { first: true });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/races/2/vs/5/manual?first=1");
  });

  it("listRaceVS returns the array", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    expect(await listRaceVS(1)).toEqual([]);
  });

  it("getRaceTrack returns the FeatureCollection", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "FeatureCollection", features: [] }), { status: 200 }),
    );
    const got = await getRaceTrack(1);
    expect(got.type).toBe("FeatureCollection");
  });
});
