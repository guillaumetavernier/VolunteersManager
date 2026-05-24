import { describe, expect, it } from "vitest";

import { hitTest, type Bar } from "../TimelineView";

type Row =
  | { kind: "race-badge"; raceID: number; label: string }
  | { kind: "race-front"; raceID: number; label: string; color: string }
  | { kind: "race-tail"; raceID: number; label: string; color: string }
  | { kind: "missions-vs"; vsID: number; label: string }
  | { kind: "trips-car"; carID: number; label: string };

const HEADER_H = 28;
const ROW_H = 22;
const LEFT_GUTTER = 140;

const tb = { start: 1_000_000, end: 1_000_000 + 3_600_000 };
const innerW = 1000;

const rows: Row[] = [
  { kind: "missions-vs", vsID: 1, label: "PB 1" },
  { kind: "missions-vs", vsID: 2, label: "PB 2" },
  { kind: "trips-car", carID: 10, label: "Car A" },
];
const rowOffsets = [0, ROW_H, ROW_H * 2];

function pxFor(t: number): number {
  return LEFT_GUTTER + ((t - tb.start) / (tb.end - tb.start)) * innerW;
}

const bars: Bar[] = [
  {
    rowIndex: 0,
    startMs: tb.start + 600_000,
    endMs: tb.start + 1_200_000,
    fill: "#10b981",
    title: "m1",
    kind: "mission",
    payload: { missionID: 100 },
  },
  {
    rowIndex: 1,
    startMs: tb.start + 1_500_000,
    endMs: tb.start + 2_100_000,
    fill: "#10b981",
    title: "m2",
    kind: "mission",
    payload: { missionID: 200 },
  },
  {
    rowIndex: 2,
    startMs: tb.start + 1_800_000,
    endMs: tb.start + 2_400_000,
    fill: "#3b82f6",
    title: "leg",
    kind: "trip-leg",
    payload: { tripID: 7, legIndex: 0 },
  },
];

describe("hitTest", () => {
  it("returns null when mouse is in the left gutter", () => {
    expect(hitTest(rows, bars, rowOffsets, 10, HEADER_H + 5, 0, tb, innerW)).toBeNull();
  });

  it("returns null when mouse is above the header", () => {
    expect(hitTest(rows, bars, rowOffsets, LEFT_GUTTER + 50, 10, 0, tb, innerW)).toBeNull();
  });

  it("finds the bar in row 0 under the cursor", () => {
    const m1 = bars[0];
    const cx = (pxFor(m1.startMs) + pxFor(m1.endMs)) / 2;
    const cy = HEADER_H + ROW_H / 2;
    expect(hitTest(rows, bars, rowOffsets, cx, cy, 0, tb, innerW)).toBe(0);
  });

  it("finds the bar in row 1 under the cursor", () => {
    const m2 = bars[1];
    const cx = (pxFor(m2.startMs) + pxFor(m2.endMs)) / 2;
    const cy = HEADER_H + ROW_H + ROW_H / 2;
    expect(hitTest(rows, bars, rowOffsets, cx, cy, 0, tb, innerW)).toBe(1);
  });

  it("returns null when no bar is at the (row, x) under the cursor", () => {
    const cx = LEFT_GUTTER + 5;
    const cy = HEADER_H + ROW_H / 2;
    expect(hitTest(rows, bars, rowOffsets, cx, cy, 0, tb, innerW)).toBeNull();
  });

  it("accounts for scrollY when locating the row", () => {
    const m2 = bars[1];
    const cx = (pxFor(m2.startMs) + pxFor(m2.endMs)) / 2;
    const cy = HEADER_H + ROW_H / 2;
    expect(hitTest(rows, bars, rowOffsets, cx, cy, ROW_H, tb, innerW)).toBe(1);
  });

  it("scrollY past content yields no hit", () => {
    const cx = LEFT_GUTTER + 100;
    const cy = HEADER_H + 1;
    expect(hitTest(rows, bars, rowOffsets, cx, cy, 10_000, tb, innerW)).toBeNull();
  });

  it("finds the trip-leg bar in the third row", () => {
    const leg = bars[2];
    const cx = (pxFor(leg.startMs) + pxFor(leg.endMs)) / 2;
    const cy = HEADER_H + ROW_H * 2 + ROW_H / 2;
    expect(hitTest(rows, bars, rowOffsets, cx, cy, 0, tb, innerW)).toBe(2);
  });
});
