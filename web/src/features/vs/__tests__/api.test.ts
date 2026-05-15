import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVS, deleteVS, listVS, patchVS } from "../api";

describe("vs api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("listVS returns parsed JSON array", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("[]", { status: 200 }),
    );
    expect(await listVS()).toEqual([]);
  });

  it("createVS POSTs JSON", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 7,
          name: "A",
          lat: 1,
          lon: 2,
          notes: null,
          photo_path: null,
          what3words: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 201 },
      ),
    );
    globalThis.fetch = mock;
    const got = await createVS({ name: "A", lat: 1, lon: 2 });
    expect(got.id).toBe(7);
    expect(mock).toHaveBeenCalledWith(
      "/api/vs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("patchVS targets /api/vs/{id}", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 9,
          name: "B",
          lat: 3,
          lon: 4,
          notes: null,
          photo_path: null,
          what3words: null,
          created_at: "",
          updated_at: "",
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mock;
    await patchVS(9, { lat: 3 });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/vs/9");
  });

  it("deleteVS issues DELETE", async () => {
    const mock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = mock;
    await deleteVS(3);
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
