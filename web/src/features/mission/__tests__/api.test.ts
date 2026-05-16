import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMission,
  deleteMission,
  listMissionsForVS,
  listMissions,
  patchMission,
} from "../api";

describe("mission api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("listMissionsForVS sends optional day", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await listMissionsForVS(7, 2);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/vs/7/missions?day=2");
  });

  it("listMissions appends filter params", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await listMissions({ day: 1, role: "Ravito", race: 3 });
    expect(mock.mock.calls[0]?.[0]).toMatch(/day=1/);
    expect(mock.mock.calls[0]?.[0]).toMatch(/role=Ravito/);
    expect(mock.mock.calls[0]?.[0]).toMatch(/race=3/);
  });

  it("createMission POSTs to /api/vs/{id}/missions", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1, vs_id: 5, day: 1, start_time: "", end_time: "", role_type: "R",
          headcount: 1, title: null, description: null, tagged_race_ids: [],
          assigned: 0, needed: 1, status: "under", created_at: "", updated_at: "",
        }),
        { status: 201 },
      ),
    );
    globalThis.fetch = mock;
    await createMission(5, { day: 1, start_time: "a", end_time: "b", role_type: "R", headcount: 1 });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/vs/5/missions");
    expect(mock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("patchMission targets /api/missions/{id}", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1, vs_id: 5, day: 1, start_time: "", end_time: "", role_type: "R",
          headcount: 2, title: null, description: null, tagged_race_ids: [],
          assigned: 0, needed: 2, status: "under", created_at: "", updated_at: "",
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mock;
    await patchMission(1, { headcount: 2 });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/missions/1");
    expect(mock.mock.calls[0]?.[1]?.method).toBe("PATCH");
  });

  it("deleteMission issues DELETE", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = mock;
    await deleteMission(9);
    expect(mock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});
