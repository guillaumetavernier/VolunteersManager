import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "../api";

describe("apiFetch", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns parsed JSON on success", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ hello: "world" }), { status: 200 }),
    );
    const got = await apiFetch<{ hello: string }>("/x");
    expect(got).toEqual({ hello: "world" });
  });

  it("throws ApiError on non-ok response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), {
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    await expect(apiFetch("/x")).rejects.toBeInstanceOf(ApiError);
  });
});
