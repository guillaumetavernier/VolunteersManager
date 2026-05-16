// Microbench for the timeline frame budget. Loads a synthetic fixture (5 races,
// 50 VS, 200 missions, 30 trips) and times 1000 frames worth of position
// computation. Target: <16ms/frame so 60fps headroom even at 300× speed.

import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const SRC = path.join(REPO, "web", "src", "features", "timeline", "positions.ts");

// Compile positions.ts on the fly. We avoid pulling in vite by using esbuild
// from the workspace (pnpm has it transitively); fall back to tsc.
function transpile(src) {
  const outFile = path.join(os.tmpdir(), `positions_${Date.now()}.mjs`);
  const esbuildBin = path.join(REPO, "web", "node_modules", ".bin", "esbuild");
  if (fs.existsSync(esbuildBin)) {
    const r = spawnSync(esbuildBin, [src, "--bundle=false", "--format=esm", "--platform=node", `--outfile=${outFile}`]);
    if (r.status !== 0) {
      throw new Error("esbuild failed: " + r.stderr?.toString());
    }
    return outFile;
  }
  // Last-ditch: tsc.
  const tscBin = path.join(REPO, "web", "node_modules", ".bin", "tsc");
  if (fs.existsSync(tscBin)) {
    const r = spawnSync(tscBin, [src, "--target", "es2020", "--module", "esnext", "--moduleResolution", "node", "--outDir", os.tmpdir()]);
    if (r.status !== 0) {
      throw new Error("tsc failed: " + r.stderr?.toString());
    }
    return path.join(os.tmpdir(), "positions.js");
  }
  throw new Error("Neither esbuild nor tsc available.");
}

const compiled = transpile(SRC);
const mod = await import(pathToFileURL(compiled).href);
const { runnerFrontPosition, runnerTailPosition, volunteerPosition, carPosition } = mod;

// Build a fixture: 5 races × 200 GPX points, 50 VS, 200 missions, 30 trips.
const RACES = 5;
const VS_COUNT = 50;
const MISSIONS = 200;
const TRIPS = 30;
const POINTS_PER_RACE = 200;
const VOLUNTEERS = 100;
const CARS = 20;

const eventStart = Date.parse("2026-06-01T00:00:00Z");
const eventEnd = eventStart + 3 * 86_400_000;

function makeRace(rid) {
  // 50 km race straight line, 200 sampled points.
  const points = new Float32Array(POINTS_PER_RACE * 3);
  let cum = 0;
  for (let i = 0; i < POINTS_PER_RACE; i++) {
    const lon = 2 + (rid - 1) * 0.1 + i * 0.001;
    const lat = 48 + i * 0.001;
    if (i > 0) {
      const prevLon = points[(i - 1) * 3];
      const prevLat = points[(i - 1) * 3 + 1];
      const dLat = ((lat - prevLat) * Math.PI) / 180;
      const dLon = ((lon - prevLon) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((prevLat * Math.PI) / 180) *
          Math.cos((lat * Math.PI) / 180) *
          Math.sin(dLon / 2) ** 2;
      cum += 2 * 6371008.8 * Math.asin(Math.sqrt(a));
    }
    points[i * 3] = lon;
    points[i * 3 + 1] = lat;
    points[i * 3 + 2] = cum;
  }
  const totalDist = cum;
  // 10 VS along the race, evenly spaced.
  const front = [];
  const tail = [];
  const start_ms = eventStart + (rid - 1) * 3600_000;
  for (let k = 1; k <= 10; k++) {
    const d = (totalDist * k) / 10;
    const tFront = start_ms + (d / (10 * 1000 / 3600)) * 1000;
    const tTail = start_ms + (d / (5 * 1000 / 3600)) * 1000;
    front.push({ vs_id: k, projected_dist_m: d, first_in_ms: tFront, last_in_ms: tFront });
    tail.push({ vs_id: k, projected_dist_m: d, first_in_ms: tTail, last_in_ms: tTail });
  }
  return { id: rid, start_ms, total_distance_m: totalDist, points, frontTimings: front, tailTimings: tail };
}

const races = [];
for (let r = 1; r <= RACES; r++) races.push(makeRace(r));

const vsById = new Map();
for (let i = 1; i <= VS_COUNT; i++) {
  vsById.set(i, { id: i, lat: 48 + i * 0.01, lon: 2 + i * 0.01 });
}

const missionsByVolunteer = new Map();
for (let i = 0; i < MISSIONS; i++) {
  const vid = (i % VOLUNTEERS) + 1;
  const vs_id = (i % VS_COUNT) + 1;
  const start = eventStart + (i % 48) * 1800_000;
  const end = start + 7200_000;
  let bucket = missionsByVolunteer.get(vid);
  if (!bucket) {
    bucket = [];
    missionsByVolunteer.set(vid, bucket);
  }
  bucket.push({ id: i + 1, vs_id, start_ms: start, end_ms: end });
}
for (const list of missionsByVolunteer.values()) list.sort((a, b) => a.start_ms - b.start_ms);

const tripsByCar = new Map();
const tripsByPassenger = new Map();
const tripsByDriver = new Map();
for (let i = 0; i < TRIPS; i++) {
  const car_id = (i % CARS) + 1;
  const driver_id = ((i * 3) % VOLUNTEERS) + 1;
  const stops = [];
  const base = eventStart + (i % 24) * 3600_000;
  for (let j = 0; j < 4; j++) {
    stops.push({
      vs_id: ((i + j) % VS_COUNT) + 1,
      time_ms: base + j * 600_000,
      board: j === 0 ? [(i + 1) % VOLUNTEERS + 1] : [],
      alight: j === 3 ? [(i + 1) % VOLUNTEERS + 1] : [],
    });
  }
  const ctx = { id: i + 1, car_id, driver_id, stops };
  if (!tripsByCar.has(car_id)) tripsByCar.set(car_id, []);
  tripsByCar.get(car_id).push(ctx);
  if (!tripsByDriver.has(driver_id)) tripsByDriver.set(driver_id, []);
  tripsByDriver.get(driver_id).push(ctx);
  const pass = (i + 1) % VOLUNTEERS + 1;
  if (!tripsByPassenger.has(pass)) tripsByPassenger.set(pass, []);
  tripsByPassenger.get(pass).push(ctx);
}

const volunteerById = new Map();
for (let i = 1; i <= VOLUNTEERS; i++) {
  volunteerById.set(i, { id: i, default_vs_id: ((i % VS_COUNT) + 1) });
}
const carById = new Map();
for (let i = 1; i <= CARS; i++) {
  carById.set(i, { id: i, default_driver_id: ((i % VOLUNTEERS) + 1) });
}

const ctx = { vsById, missionsByVolunteer, tripsByPassenger, tripsByDriver, tripsByCar, volunteerById, carById };

// Warm-up.
const out = { lon: 0, lat: 0 };
for (let t = eventStart; t < eventStart + 1000; t += 100) {
  for (const r of races) {
    runnerFrontPosition(r, t, out);
    runnerTailPosition(r, t, out);
  }
  for (let v = 1; v <= VOLUNTEERS; v++) volunteerPosition(v, t, ctx, out);
  for (let c = 1; c <= CARS; c++) carPosition(c, t, ctx, out);
}

const FRAMES = 1000;
// At 30× speed, 30s real-time = 900s event-time, but we want to span the
// whole event window to exercise every code path.
const span = eventEnd - eventStart;
const step = span / FRAMES;
const samples = [];
for (let i = 0; i < FRAMES; i++) {
  const t = eventStart + step * i;
  const t0 = performance.now();
  for (const r of races) {
    runnerFrontPosition(r, t, out);
    runnerTailPosition(r, t, out);
  }
  for (let v = 1; v <= VOLUNTEERS; v++) volunteerPosition(v, t, ctx, out);
  for (let c = 1; c <= CARS; c++) carPosition(c, t, ctx, out);
  samples.push(performance.now() - t0);
}

samples.sort((a, b) => a - b);
const sum = samples.reduce((a, b) => a + b, 0);
const avg = sum / samples.length;
const p50 = samples[Math.floor(samples.length / 2)];
const p95 = samples[Math.floor(samples.length * 0.95)];
const p99 = samples[Math.floor(samples.length * 0.99)];

console.log(
  `frames=${FRAMES} races=${RACES} vs=${VS_COUNT} missions=${MISSIONS} trips=${TRIPS} volunteers=${VOLUNTEERS} cars=${CARS}`,
);
console.log(`avg=${avg.toFixed(3)}ms p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms p99=${p99.toFixed(3)}ms`);

if (avg > 16) {
  console.error(`❌ avg ${avg.toFixed(3)}ms exceeds 16ms budget`);
  process.exit(1);
}
console.log("✅ within 16ms/frame budget");
