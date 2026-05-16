import { describe, expect, it } from "vitest";
import { filterByEntity, topSeverity } from "../hooks";
import type { Warning } from "../api";

const fixtures: Warning[] = [
  {
    id: "a",
    kind: "double_booking",
    severity: "error",
    message: "m",
    entities: [{ type: "volunteer", id: 1 }],
  },
  {
    id: "b",
    kind: "unassigned",
    severity: "info",
    message: "m2",
    entities: [{ type: "volunteer", id: 1 }],
  },
  {
    id: "c",
    kind: "role_mismatch",
    severity: "warn",
    message: "m3",
    entities: [{ type: "volunteer", id: 2 }],
  },
];

describe("warnings helpers", () => {
  it("filterByEntity keeps only matching refs", () => {
    const matched = filterByEntity(fixtures, { type: "volunteer", id: 1 });
    expect(matched).toHaveLength(2);
    expect(matched.map((w) => w.id).sort()).toEqual(["a", "b"]);
  });

  it("filterByEntity returns empty when no match", () => {
    expect(filterByEntity(fixtures, { type: "mission", id: 1 })).toEqual([]);
    expect(filterByEntity(undefined, { type: "volunteer", id: 1 })).toEqual([]);
  });

  it("topSeverity prefers error > warn > info", () => {
    expect(topSeverity(fixtures)).toBe("error");
    expect(topSeverity([fixtures[1]!])).toBe("info");
    expect(topSeverity([fixtures[2]!])).toBe("warn");
    expect(topSeverity([])).toBeNull();
  });
});
