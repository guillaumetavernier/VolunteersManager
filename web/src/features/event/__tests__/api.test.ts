import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEvent, putEvent } from "../api";

describe("event api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns null when GET /api/event 404s with not_initialized", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ code: "not_initialized" }), { status: 404 }),
    );
    expect(await getEvent()).toBeNull();
  });

  it("PUT /api/event sends JSON body", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 1,
          name: "X",
          start_date: "2026-06-01",
          end_date: "2026-06-03",
          timezone: "Europe/Paris",
          country_code: "FR",
          settings: "{}",
          created_at: "",
          updated_at: "",
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mock;
    const got = await putEvent({ name: "X", start_date: "2026-06-01", end_date: "2026-06-03" });
    expect(got.name).toBe("X");
    expect(mock).toHaveBeenCalledWith(
      "/api/event",
      expect.objectContaining({ method: "PUT" }),
    );
  });
});
