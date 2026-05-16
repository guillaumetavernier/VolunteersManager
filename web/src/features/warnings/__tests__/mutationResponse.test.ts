import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyDiff, installWarningsBridge } from "@/lib/mutationResponse";
import { warningsKey, type Warning } from "../api";
import { apiFetch } from "@/lib/api";

describe("warnings cache bridge", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("applyDiff adds and removes warnings", () => {
    const qc = new QueryClient();
    qc.setQueryData<Warning[]>(warningsKey, [
      { id: "a", kind: "double_booking", severity: "error", message: "m", entities: [] },
    ]);
    applyDiff(qc, {
      added: [{ id: "b", kind: "role_mismatch", severity: "warn", message: "m2", entities: [] }],
      removed: ["a"],
      unchanged: 0,
    });
    const cache = qc.getQueryData<Warning[]>(warningsKey);
    expect(cache?.length).toBe(1);
    expect(cache?.[0]?.id).toBe("b");
  });

  it("installWarningsBridge merges warnings from mutation responses", async () => {
    const qc = new QueryClient();
    installWarningsBridge(qc);
    qc.setQueryData<Warning[]>(warningsKey, []);
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { id: 1, mission_id: 1, volunteer_id: 1, created_at: "" },
          warnings: {
            added: [
              {
                id: "w1",
                kind: "double_booking",
                severity: "error",
                message: "m",
                entities: [],
              },
            ],
            removed: [],
            unchanged: 0,
          },
        }),
        { status: 201 },
      ),
    );
    globalThis.fetch = mock;
    const out = await apiFetch<{ id: number }>("/api/assignments", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(out.id).toBe(1);
    const cache = qc.getQueryData<Warning[]>(warningsKey);
    expect(cache?.[0]?.id).toBe("w1");
  });
});
