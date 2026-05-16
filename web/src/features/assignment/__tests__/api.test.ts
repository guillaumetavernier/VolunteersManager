import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import {
  createAssignment,
  deleteAssignment,
  deleteAssignmentByPair,
  listAssignmentsForVolunteer,
} from "../api";

describe("assignment api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("createAssignment POSTs JSON", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1, mission_id: 2, volunteer_id: 3, created_at: "" }), { status: 201 }),
    );
    globalThis.fetch = mock;
    const got = await createAssignment({ mission_id: 2, volunteer_id: 3 });
    expect(got.id).toBe(1);
    expect(mock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("createAssignment surfaces 409 via ApiError", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: "duplicate" }), { status: 409 }),
    );
    globalThis.fetch = mock;
    await expect(createAssignment({ mission_id: 1, volunteer_id: 1 })).rejects.toBeInstanceOf(ApiError);
  });

  it("deleteAssignment DELETEs /api/assignments/{id}", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = mock;
    await deleteAssignment(7);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/assignments/7");
  });

  it("deleteAssignmentByPair sends query params", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = mock;
    await deleteAssignmentByPair(3, 4);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/assignments?volunteer=3&mission=4");
  });

  it("listAssignmentsForVolunteer GETs the right URL", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await listAssignmentsForVolunteer(8);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/assignments?volunteer=8");
  });
});
