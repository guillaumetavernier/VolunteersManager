import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listWarnings } from "../api";

describe("warnings api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("listWarnings fetches /api/warnings", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "abc",
            kind: "double_booking",
            severity: "error",
            message: "msg",
            entities: [{ type: "volunteer", id: 1 }],
          },
        ]),
        { status: 200 },
      ),
    );
    globalThis.fetch = mock;
    const xs = await listWarnings();
    expect(xs).toHaveLength(1);
    expect(xs[0]?.kind).toBe("double_booking");
    expect(mock.mock.calls[0]?.[0]).toBe("/api/warnings");
  });
});
