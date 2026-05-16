import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { csvCommit, csvMapping, csvResolve, csvUpload } from "../csvApi";

describe("csv api", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("csvUpload posts multipart", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: "s",
          filename: "x.csv",
          delimiter: ";",
          headers: ["Prénom"],
          preview: [["a"]],
          auto_mapping: { 0: "first_name" },
          row_count: 1,
          field_keys: ["first_name"],
          header_hints: { first_name: "Prénom" },
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = mock;
    const file = new File(["a"], "x.csv", { type: "text/csv" });
    const r = await csvUpload(file);
    expect(r.session_id).toBe("s");
    expect(mock.mock.calls[0]?.[0]).toBe("/api/csv/upload");
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("csvMapping serialises payload", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ counts: { new: 0, update: 0, ambiguous: 0, error: 0, skip: 0 }, decisions: [] }), {
        status: 200,
      }),
    );
    globalThis.fetch = mock;
    await csvMapping("s", { "0": "first_name" }, "name");
    expect(mock.mock.calls[0]?.[0]).toBe("/api/csv/s/mapping");
    expect(mock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("csvResolve targets the resolve route", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ counts: { new: 0, update: 0, ambiguous: 0, error: 0, skip: 0 }, decisions: [] }), {
        status: 200,
      }),
    );
    globalThis.fetch = mock;
    await csvResolve("s", 1, "new");
    expect(mock.mock.calls[0]?.[0]).toBe("/api/csv/s/resolve");
  });

  it("csvCommit POSTs", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { inserted: 1, updated: 0, skipped: 0 } }), { status: 200 }),
    );
    globalThis.fetch = mock;
    const r = await csvCommit("s");
    expect(r.result.inserted).toBe(1);
  });
});
