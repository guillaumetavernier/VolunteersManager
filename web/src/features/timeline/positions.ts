// Pure interpolation utilities for the timeline. No DOM, no canvas, no MapLibre.
// Position functions operate on denormalized inputs supplied by the caller so
// they can be tested in isolation and called from the per-frame hot path
// without per-call allocations.

export interface LonLat {
  lon: number;
  lat: number;
}

export interface VsPoint {
  id: number;
  lat: number;
  lon: number;
}

export interface RaceVsTiming {
  vs_id: number;
  projected_dist_m: number;
  first_in_ms: number; // resolved (manual ?? auto) → epoch ms
  last_in_ms: number;
}

export interface RaceTimeline {
  id: number;
  start_ms: number | null;
  total_distance_m: number;
  // [lon, lat, cumDistM, ...] flattened. cumDist is meters.
  points: Float32Array;
  // sorted by sequence; only entries with a resolved first_in are included for "front"
  frontTimings: RaceVsTiming[]; // (start, 0) prepended implicitly when start_ms is set
  tailTimings: RaceVsTiming[];
}

export interface TripStopCtx {
  vs_id: number;
  time_ms: number;
  board: number[];
  alight: number[];
}

export interface TripCtx {
  id: number;
  car_id: number;
  driver_id: number;
  stops: TripStopCtx[];
}

export interface MissionCtx {
  id: number;
  vs_id: number;
  start_ms: number;
  end_ms: number;
}

export interface VolunteerCtx {
  id: number;
  default_vs_id: number | null;
}

export interface CarCtx {
  id: number;
  default_driver_id: number | null;
}

export interface PositionContext {
  vsById: Map<number, VsPoint>;
  missionsByVolunteer: Map<number, MissionCtx[]>; // sorted by start_ms
  tripsByPassenger: Map<number, TripCtx[]>;
  tripsByDriver: Map<number, TripCtx[]>;
  tripsByCar: Map<number, TripCtx[]>;
  volunteerById: Map<number, VolunteerCtx>;
  carById: Map<number, CarCtx>;
}

// Lower bound binary search: returns the largest index i where arr[i] <= v,
// or -1 if v < arr[0]. arr is the cumulative-distance column of the flattened
// race points (stride 3, offset 2).
export function searchCumDist(points: Float32Array, v: number): number {
  // points encodes [lon, lat, cumDist, ...]. n = points.length / 3.
  const n = points.length / 3;
  if (n === 0) return -1;
  if (v <= points[2]) return 0;
  if (v >= points[(n - 1) * 3 + 2]) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (points[mid * 3 + 2] <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

// Locate cumulative distance for time t on a piecewise-linear (timing → dist)
// curve, then look up the lon/lat on the flattened GPX. Returns null when t
// is outside the race window.
function distAtTime(timings: RaceVsTiming[], t: number, startMs: number | null): number | null {
  if (timings.length === 0) return null;
  let prevT: number;
  let prevD: number;
  if (startMs != null) {
    if (t < startMs) return null;
    prevT = startMs;
    prevD = 0;
  } else {
    if (t < timings[0].first_in_ms) return null;
    prevT = timings[0].first_in_ms;
    prevD = timings[0].projected_dist_m;
  }
  for (let i = 0; i < timings.length; i++) {
    const nt = timings[i].first_in_ms;
    const nd = timings[i].projected_dist_m;
    if (t <= nt) {
      if (nt === prevT) return nd;
      const frac = (t - prevT) / (nt - prevT);
      return prevD + (nd - prevD) * frac;
    }
    prevT = nt;
    prevD = nd;
  }
  return null;
}

function distAtTimeTail(race: RaceTimeline, t: number): number | null {
  if (race.tailTimings.length === 0) return null;
  let prevT: number;
  let prevD: number;
  if (race.start_ms != null) {
    if (t < race.start_ms) return null;
    prevT = race.start_ms;
    prevD = 0;
  } else {
    if (t < race.tailTimings[0].last_in_ms) return null;
    prevT = race.tailTimings[0].last_in_ms;
    prevD = race.tailTimings[0].projected_dist_m;
  }
  for (let i = 0; i < race.tailTimings.length; i++) {
    const nt = race.tailTimings[i].last_in_ms;
    const nd = race.tailTimings[i].projected_dist_m;
    if (t <= nt) {
      if (nt === prevT) return nd;
      const frac = (t - prevT) / (nt - prevT);
      return prevD + (nd - prevD) * frac;
    }
    prevT = nt;
    prevD = nd;
  }
  return null;
}

function lookupLonLat(points: Float32Array, d: number, out: LonLat): boolean {
  const i = searchCumDist(points, d);
  if (i < 0) return false;
  const n = points.length / 3;
  if (i === n - 1) {
    out.lon = points[i * 3];
    out.lat = points[i * 3 + 1];
    return true;
  }
  const d0 = points[i * 3 + 2];
  const d1 = points[(i + 1) * 3 + 2];
  if (d1 === d0) {
    out.lon = points[i * 3];
    out.lat = points[i * 3 + 1];
    return true;
  }
  const frac = (d - d0) / (d1 - d0);
  out.lon = points[i * 3] + (points[(i + 1) * 3] - points[i * 3]) * frac;
  out.lat = points[i * 3 + 1] + (points[(i + 1) * 3 + 1] - points[i * 3 + 1]) * frac;
  return true;
}

// runnerPosition writes the front-runner position into `out` and returns true
// when t is inside the race window; otherwise returns false and leaves `out`
// untouched. Reusing `out` avoids per-frame allocations.
export function runnerFrontPosition(race: RaceTimeline, t: number, out: LonLat): boolean {
  const d = distAtTime(race.frontTimings, t, race.start_ms);
  if (d == null) return false;
  return lookupLonLat(race.points, d, out);
}

export function runnerTailPosition(race: RaceTimeline, t: number, out: LonLat): boolean {
  const d = distAtTimeTail(race, t);
  if (d == null) return false;
  return lookupLonLat(race.points, d, out);
}

// volunteerPosition follows the priority order:
//   1. active mission → mission.vs
//   2. between board/alight on an active trip → linear lerp between adjacent stops
//   3. default_vs
// Returns false when no position can be determined.
export function volunteerPosition(
  volunteerID: number,
  t: number,
  ctx: PositionContext,
  out: LonLat,
): boolean {
  const missions = ctx.missionsByVolunteer.get(volunteerID);
  if (missions) {
    for (let i = 0; i < missions.length; i++) {
      const m = missions[i];
      if (t >= m.start_ms && t < m.end_ms) {
        const vs = ctx.vsById.get(m.vs_id);
        if (vs) {
          out.lon = vs.lon;
          out.lat = vs.lat;
          return true;
        }
      }
    }
  }
  const trips = ctx.tripsByPassenger.get(volunteerID);
  if (trips) {
    for (let i = 0; i < trips.length; i++) {
      if (interpAlongTrip(trips[i], volunteerID, t, ctx, out)) return true;
    }
  }
  const v = ctx.volunteerById.get(volunteerID);
  if (v?.default_vs_id != null) {
    const vs = ctx.vsById.get(v.default_vs_id);
    if (vs) {
      out.lon = vs.lon;
      out.lat = vs.lat;
      return true;
    }
  }
  return false;
}

// carPosition: if there's an active trip for this car, lerp between consecutive
// stops; else pin to the default driver's default_vs.
export function carPosition(
  carID: number,
  t: number,
  ctx: PositionContext,
  out: LonLat,
): boolean {
  const trips = ctx.tripsByCar.get(carID);
  if (trips) {
    for (let i = 0; i < trips.length; i++) {
      const trip = trips[i];
      const stops = trip.stops;
      if (stops.length < 2) continue;
      if (t < stops[0].time_ms || t > stops[stops.length - 1].time_ms) continue;
      for (let j = 0; j < stops.length - 1; j++) {
        const a = stops[j];
        const b = stops[j + 1];
        if (t >= a.time_ms && t <= b.time_ms) {
          const va = ctx.vsById.get(a.vs_id);
          const vb = ctx.vsById.get(b.vs_id);
          if (!va || !vb) return false;
          const denom = b.time_ms - a.time_ms;
          const frac = denom === 0 ? 0 : (t - a.time_ms) / denom;
          out.lon = va.lon + (vb.lon - va.lon) * frac;
          out.lat = va.lat + (vb.lat - va.lat) * frac;
          return true;
        }
      }
    }
  }
  const car = ctx.carById.get(carID);
  if (car?.default_driver_id != null) {
    const driver = ctx.volunteerById.get(car.default_driver_id);
    if (driver?.default_vs_id != null) {
      const vs = ctx.vsById.get(driver.default_vs_id);
      if (vs) {
        out.lon = vs.lon;
        out.lat = vs.lat;
        return true;
      }
    }
  }
  return false;
}

// interpAlongTrip places a passenger between their board stop and their alight
// stop on this trip. Passengers ride only on the segment(s) where they're on
// board, so we treat their journey as the line from the board stop to the
// alight stop; positions for t outside [board, alight] return false.
function interpAlongTrip(
  trip: TripCtx,
  volunteerID: number,
  t: number,
  ctx: PositionContext,
  out: LonLat,
): boolean {
  const stops = trip.stops;
  let boardIdx = -1;
  let alightIdx = -1;
  for (let i = 0; i < stops.length; i++) {
    if (stops[i].board.includes(volunteerID)) boardIdx = i;
    if (stops[i].alight.includes(volunteerID)) alightIdx = i;
  }
  if (boardIdx < 0 || alightIdx < 0 || alightIdx <= boardIdx) return false;
  const tStart = stops[boardIdx].time_ms;
  const tEnd = stops[alightIdx].time_ms;
  if (t < tStart || t > tEnd) return false;
  // Walk consecutive segments inside [boardIdx, alightIdx] to find the active one.
  for (let i = boardIdx; i < alightIdx; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.time_ms && t <= b.time_ms) {
      const va = ctx.vsById.get(a.vs_id);
      const vb = ctx.vsById.get(b.vs_id);
      if (!va || !vb) return false;
      const denom = b.time_ms - a.time_ms;
      const frac = denom === 0 ? 0 : (t - a.time_ms) / denom;
      out.lon = va.lon + (vb.lon - va.lon) * frac;
      out.lat = va.lat + (vb.lat - va.lat) * frac;
      return true;
    }
  }
  return false;
}
