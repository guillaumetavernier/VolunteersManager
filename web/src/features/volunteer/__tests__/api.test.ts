import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveVolunteer,
  createVolunteer,
  listVolunteers,
  patchVolunteer,
} from "../api";

describe("volunteer api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("listVolunteers includes archived filter in query", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await listVolunteers("all");
    expect(mock.mock.calls[0]?.[0]).toBe("/api/volunteers?archived=all");
  });

  it("createVolunteer posts JSON", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1, first_name: "A", last_name: "B", phone: "+33611111111",
          email: null, emergency_contact_name: null, emergency_contact_phone: null,
          general_info: null, customizable_message: null, role_types: [], availability: [],
          default_vs_id: null, can_drive: false, license_type: null, notes: null,
          archived: false, created_at: "", updated_at: "",
        }),
        { status: 201 },
      ),
    );
    globalThis.fetch = mock;
    const got = await createVolunteer({ first_name: "A", last_name: "B", phone: "+33611111111" });
    expect(got.id).toBe(1);
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("patchVolunteer PATCHes the right path", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    globalThis.fetch = mock;
    await patchVolunteer(7, { archived: true });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/volunteers/7");
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
  });

  it("archiveVolunteer DELETEs default (soft)", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = mock;
    await archiveVolunteer(7);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/volunteers/7");
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
