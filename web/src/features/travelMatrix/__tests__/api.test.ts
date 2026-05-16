import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listMatrix, patchCell, recompute } from "../api";

describe("travel matrix api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("listMatrix GETs /api/travel-times", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await listMatrix();
    expect(mock.mock.calls[0]?.[0]).toBe("/api/travel-times");
  });

  it("patchCell PATCHes the body", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ from_vs: 1, to_vs: 2, mode: "drive", seconds: 600, source: "manual" }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mock;
    await patchCell({ from_vs: 1, to_vs: 2, mode: "drive", seconds: 600 });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/travel-times");
    expect(mock.mock.calls[0]?.[1]?.method).toBe("PATCH");
  });

  it("recompute POSTs to /recompute", async () => {
    const mock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    globalThis.fetch = mock;
    await recompute();
    expect(mock.mock.calls[0]?.[0]).toBe("/api/travel-times/recompute");
    expect(mock.mock.calls[0]?.[1]?.method).toBe("POST");
  });
});
