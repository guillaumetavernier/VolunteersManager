import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listTrialsForRace,
  createTrial,
  patchTrial,
  deleteTrial,
  reorderTrials,
  listTrialGPX,
  uploadTrialGPX,
  deleteTrialGPX,
  putTrialVS,
  listTrialVS,
} from "../api";

describe("trial api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  const trialFixture = {
    id: 1,
    race_id: 2,
    sequence: 0,
    name: "Épreuve A",
    start_time: "2026-06-01T06:00:00Z",
    front_pace: 12.0,
    tail_pace: 8.0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("listTrialsForRace GETs the correct URL", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([trialFixture]), { status: 200 }),
    );
    const result = await listTrialsForRace(2);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/races/2/trials", expect.anything());
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Épreuve A");
  });

  it("createTrial POSTs JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(trialFixture), { status: 201 }),
    );
    const result = await createTrial(2, { name: "Épreuve A", sequence: 0, front_pace: 12, tail_pace: 8 });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/races/2/trials",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.id).toBe(1);
  });

  it("patchTrial PATCHes the trial", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ...trialFixture, name: "Épreuve B" }), { status: 200 }),
    );
    const result = await patchTrial(1, { name: "Épreuve B" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/trials/1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(result.name).toBe("Épreuve B");
  });

  it("deleteTrial DELETEs the trial", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await deleteTrial(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/trials/1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("reorderTrials PUTs the reorder endpoint", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([trialFixture]), { status: 200 }),
    );
    const result = await reorderTrials(2, [{ trial_id: 1, sequence: 0 }]);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/races/2/trials/reorder",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(result).toHaveLength(1);
  });

  it("listTrialGPX GETs GPX files for a trial", async () => {
    const gpxFixture = {
      id: 10,
      race_id: 2,
      trial_id: 1,
      file_path: "/assets/gpx/2/abc.gpx",
      total_distance_m: 42000,
      created_at: "2026-01-01T00:00:00Z",
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([gpxFixture]), { status: 200 }),
    );
    const result = await listTrialGPX(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/trials/1/gpx", expect.anything());
    expect(result[0].total_distance_m).toBe(42000);
  });

  it("uploadTrialGPX POSTs FormData", async () => {
    const gpxFixture = {
      id: 11,
      race_id: 2,
      trial_id: 1,
      file_path: "/assets/gpx/2/def.gpx",
      total_distance_m: 50000,
      created_at: "2026-01-01T00:00:00Z",
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(gpxFixture), { status: 201 }),
    );
    const file = new File(["<gpx/>"], "trail.gpx", { type: "application/gpx+xml" });
    const result = await uploadTrialGPX(1, file);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/trials/1/gpx",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.id).toBe(11);
  });

  it("deleteTrialGPX DELETEs a GPX file", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await deleteTrialGPX(1, 10);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/trials/1/gpx/10",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("putTrialVS PUTs a source update", async () => {
    const tvFixture = {
      id: 5,
      trial_id: 1,
      vs_id: 3,
      source: "manual_include",
      dist_in_trial_m: 1200,
      auto_first_in: "2026-06-01T07:00:00Z",
      auto_last_in: "2026-06-01T09:00:00Z",
      manual_first_in: null,
      manual_last_in: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(tvFixture), { status: 200 }),
    );
    const result = await putTrialVS(5, { source: "manual_include" });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/race_trial_vs/5",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(result.source).toBe("manual_include");
  });

  it("listTrialVS GETs VS rows for a trial", async () => {
    const tvFixture = {
      id: 5,
      trial_id: 1,
      vs_id: 3,
      source: "auto",
      dist_in_trial_m: 1200,
      auto_first_in: "2026-06-01T07:00:00Z",
      auto_last_in: "2026-06-01T09:00:00Z",
      manual_first_in: null,
      manual_last_in: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([tvFixture]), { status: 200 }),
    );
    const result = await listTrialVS(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/trials/1/vs", expect.anything());
    expect(result[0].source).toBe("auto");
    expect(result[0].dist_in_trial_m).toBe(1200);
  });
});
