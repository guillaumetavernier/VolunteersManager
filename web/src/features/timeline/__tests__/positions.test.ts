import { describe, expect, it } from "vitest";

import {
  carPosition,
  runnerFrontPosition,
  runnerTailPosition,
  searchCumDist,
  volunteerPosition,
  type LonLat,
  type PositionContext,
  type RaceTimeline,
} from "../positions";

function makePoints(coords: Array<[number, number, number]>): Float32Array {
  const out = new Float32Array(coords.length * 3);
  for (let i = 0; i < coords.length; i++) {
    out[i * 3] = coords[i][0];
    out[i * 3 + 1] = coords[i][1];
    out[i * 3 + 2] = coords[i][2];
  }
  return out;
}

describe("searchCumDist", () => {
  const pts = makePoints([
    [0, 0, 0],
    [1, 1, 100],
    [2, 2, 200],
    [3, 3, 300],
  ]);
  it("returns 0 when v is below first", () => {
    expect(searchCumDist(pts, -5)).toBe(0);
    expect(searchCumDist(pts, 0)).toBe(0);
  });
  it("returns last index when v exceeds", () => {
    expect(searchCumDist(pts, 9999)).toBe(3);
  });
  it("finds the lower bound", () => {
    expect(searchCumDist(pts, 100)).toBe(1);
    expect(searchCumDist(pts, 150)).toBe(1);
    expect(searchCumDist(pts, 250)).toBe(2);
  });
});

describe("runnerFrontPosition", () => {
  const race: RaceTimeline = {
    id: 1,
    start_ms: 0,
    total_distance_m: 1000,
    points: makePoints([
      [0, 0, 0],
      [10, 0, 500],
      [20, 0, 1000],
    ]),
    frontTimings: [
      { vs_id: 1, projected_dist_m: 500, first_in_ms: 1000, last_in_ms: 1500 },
      { vs_id: 2, projected_dist_m: 1000, first_in_ms: 2000, last_in_ms: 3000 },
    ],
    tailTimings: [
      { vs_id: 1, projected_dist_m: 500, first_in_ms: 1500, last_in_ms: 1500 },
      { vs_id: 2, projected_dist_m: 1000, first_in_ms: 3000, last_in_ms: 3000 },
    ],
  };
  it("returns false before race start", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(runnerFrontPosition(race, -1, out)).toBe(false);
  });
  it("places runner at origin at t=0", () => {
    const out: LonLat = { lon: 1, lat: 1 };
    expect(runnerFrontPosition(race, 0, out)).toBe(true);
    expect(out.lon).toBeCloseTo(0);
    expect(out.lat).toBeCloseTo(0);
  });
  it("places runner mid-segment", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(runnerFrontPosition(race, 500, out)).toBe(true);
    // 500ms in: dist = 250m, lon ~ 5.
    expect(out.lon).toBeCloseTo(5, 5);
  });
  it("places runner at end", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(runnerFrontPosition(race, 2000, out)).toBe(true);
    expect(out.lon).toBeCloseTo(20);
  });
  it("returns false after race window", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(runnerFrontPosition(race, 5000, out)).toBe(false);
  });
  it("tail trails the front", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(runnerTailPosition(race, 1500, out)).toBe(true);
    // At 1500ms tail-cum-dist is at vs 1 (proj 500), lon=10.
    expect(out.lon).toBeCloseTo(10, 5);
  });
});

describe("volunteerPosition", () => {
  const ctx: PositionContext = {
    vsById: new Map([
      [1, { id: 1, lat: 48.0, lon: 2.0 }],
      [2, { id: 2, lat: 48.1, lon: 2.1 }],
      [3, { id: 3, lat: 48.2, lon: 2.2 }],
    ]),
    missionsByVolunteer: new Map([
      [
        100,
        [
          { id: 1, vs_id: 1, start_ms: 0, end_ms: 1000 },
          { id: 2, vs_id: 3, start_ms: 3000, end_ms: 5000 },
        ],
      ],
    ]),
    tripsByPassenger: new Map([
      [
        100,
        [
          {
            id: 1,
            car_id: 1,
            driver_id: 200,
            stops: [
              { vs_id: 1, time_ms: 1500, board: [100], alight: [] },
              { vs_id: 3, time_ms: 2500, board: [], alight: [100] },
            ],
          },
        ],
      ],
    ]),
    tripsByDriver: new Map(),
    tripsByCar: new Map(),
    volunteerById: new Map([
      [100, { id: 100, default_vs_id: 2 }],
      [101, { id: 101, default_vs_id: null }],
      [200, { id: 200, default_vs_id: 1 }],
    ]),
    carById: new Map(),
  };

  it("active mission → mission.vs", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(volunteerPosition(100, 500, ctx, out)).toBe(true);
    expect(out.lon).toBeCloseTo(2.0);
  });

  it("between board/alight on active trip → interpolation", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(volunteerPosition(100, 2000, ctx, out)).toBe(true);
    // Halfway from (2.0,48.0) to (2.2,48.2) = (2.1, 48.1).
    expect(out.lon).toBeCloseTo(2.1);
    expect(out.lat).toBeCloseTo(48.1);
  });

  it("falls back to default_vs when idle", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(volunteerPosition(100, 9999, ctx, out)).toBe(true);
    expect(out.lon).toBeCloseTo(2.1);
    expect(out.lat).toBeCloseTo(48.1);
  });

  it("returns false when no default_vs and idle", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(volunteerPosition(101, 0, ctx, out)).toBe(false);
  });
});

describe("carPosition with cross-midnight trip", () => {
  // Trip starts 23:50 day 2 (epoch e.g. 1_000_000_000_000); next stop 00:20 day 3.
  const t1 = Date.parse("2026-06-02T23:50:00Z");
  const t2 = Date.parse("2026-06-03T00:20:00Z");
  const tMid = (t1 + t2) / 2;
  const ctx: PositionContext = {
    vsById: new Map([
      [1, { id: 1, lat: 48.0, lon: 2.0 }],
      [2, { id: 2, lat: 48.5, lon: 2.5 }],
    ]),
    missionsByVolunteer: new Map(),
    tripsByPassenger: new Map(),
    tripsByDriver: new Map(),
    tripsByCar: new Map([
      [
        7,
        [
          {
            id: 1,
            car_id: 7,
            driver_id: 200,
            stops: [
              { vs_id: 1, time_ms: t1, board: [], alight: [] },
              { vs_id: 2, time_ms: t2, board: [], alight: [] },
            ],
          },
        ],
      ],
    ]),
    volunteerById: new Map([[200, { id: 200, default_vs_id: 1 }]]),
    carById: new Map([[7, { id: 7, default_driver_id: 200 }]]),
  };

  it("interpolates across midnight", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(carPosition(7, tMid, ctx, out)).toBe(true);
    expect(out.lon).toBeCloseTo(2.25);
    expect(out.lat).toBeCloseTo(48.25);
  });

  it("falls back to garage (driver default_vs) outside trip window", () => {
    const out: LonLat = { lon: 0, lat: 0 };
    expect(carPosition(7, t1 - 1, ctx, out)).toBe(true);
    expect(out.lon).toBeCloseTo(2.0);
  });
});
