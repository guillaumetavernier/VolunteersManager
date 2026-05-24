import { beforeEach, describe, expect, it } from "vitest";

import { effectiveTimeBounds, useTimelineWindow } from "../useTimelineWindow";

const DAY_MS = 86_400_000;

describe("useTimelineWindow", () => {
  beforeEach(() => {
    useTimelineWindow.setState({ window: { kind: "all" } });
  });

  it("defaults to {kind: 'all'}", () => {
    expect(useTimelineWindow.getState().window).toEqual({ kind: "all" });
  });

  it("setWindow updates the state", () => {
    useTimelineWindow.getState().setWindow({ kind: "day", dayIndex: 1 });
    expect(useTimelineWindow.getState().window).toEqual({ kind: "day", dayIndex: 1 });
  });
});

describe("effectiveTimeBounds", () => {
  it("returns the full range for 'all'", () => {
    const A = 1_700_000_000_000;
    const B = A + 3 * DAY_MS - 1;
    expect(effectiveTimeBounds({ kind: "all" }, A, B)).toEqual({ startMs: A, endMs: B });
  });

  it("returns the first day for dayIndex 0", () => {
    const dayStart = 1_700_000_000_000;
    const dataEnd = dayStart + 3 * DAY_MS - 1;
    expect(effectiveTimeBounds({ kind: "day", dayIndex: 0 }, dayStart, dataEnd)).toEqual({
      startMs: dayStart,
      endMs: dayStart + DAY_MS - 1,
    });
  });

  it("returns the third day for dayIndex 2", () => {
    const dayStart = 1_700_000_000_000;
    const dataEnd = dayStart + 3 * DAY_MS - 1;
    expect(effectiveTimeBounds({ kind: "day", dayIndex: 2 }, dayStart, dataEnd)).toEqual({
      startMs: dayStart + 2 * DAY_MS,
      endMs: dayStart + 3 * DAY_MS - 1,
    });
  });

  it("does not clamp out-of-range dayIndex", () => {
    const dayStart = 1_700_000_000_000;
    const dataEnd = dayStart + DAY_MS - 1;
    expect(effectiveTimeBounds({ kind: "day", dayIndex: 5 }, dayStart, dataEnd)).toEqual({
      startMs: dayStart + 5 * DAY_MS,
      endMs: dayStart + 6 * DAY_MS - 1,
    });
  });
});
