import { describe, expect, it } from "vitest";

import { composeISO, dateForDay, dayCount, dayForDate, extractHHMM } from "../eventcal";

const ev = { start_date: "2026-06-01", end_date: "2026-06-03" };

describe("eventcal", () => {
  it("dayCount is inclusive of both endpoints", () => {
    expect(dayCount(ev)).toBe(3);
    expect(dayCount({ start_date: "2026-06-01", end_date: "2026-06-01" })).toBe(1);
  });

  it("dateForDay walks one calendar day at a time", () => {
    expect(dateForDay(ev, 1)).toBe("2026-06-01");
    expect(dateForDay(ev, 2)).toBe("2026-06-02");
    expect(dateForDay(ev, 3)).toBe("2026-06-03");
  });

  it("dateForDay crosses month boundaries", () => {
    const m = { start_date: "2026-05-31" };
    expect(dateForDay(m, 1)).toBe("2026-05-31");
    expect(dateForDay(m, 2)).toBe("2026-06-01");
  });

  it("composeISO joins date and HH:MM", () => {
    expect(composeISO(ev, 2, "08:30")).toBe("2026-06-02T08:30");
  });

  it("composeISO returns empty when time is empty", () => {
    expect(composeISO(ev, 2, "")).toBe("");
  });

  it("extractHHMM pulls HH:MM out of ISO-ish strings", () => {
    expect(extractHHMM("2026-06-02T08:30")).toBe("08:30");
    expect(extractHHMM("2026-06-02T08:30:00")).toBe("08:30");
    expect(extractHHMM("")).toBe("");
    expect(extractHHMM(null)).toBe("");
  });

  it("dayCount handles malformed dates by returning 1", () => {
    expect(dayCount({ start_date: "garbage", end_date: "2026-06-02" })).toBe(1);
  });

  it("dayForDate is the inverse of dateForDay", () => {
    expect(dayForDate(ev, "2026-06-01")).toBe(1);
    expect(dayForDate(ev, "2026-06-02T08:30")).toBe(2);
    expect(dayForDate(ev, "2026-06-03T18:00:00")).toBe(3);
  });

  it("dayForDate accepts dates outside the event window", () => {
    expect(dayForDate(ev, "2026-05-31")).toBe(0);
    expect(dayForDate(ev, "2026-06-04")).toBe(4);
  });

  it("dayForDate returns null on garbage", () => {
    expect(dayForDate(ev, "")).toBe(null);
    expect(dayForDate(ev, null)).toBe(null);
    expect(dayForDate(ev, "not-a-date")).toBe(null);
  });
});
