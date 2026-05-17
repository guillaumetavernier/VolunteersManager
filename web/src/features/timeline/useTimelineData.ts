import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { listRaces, getRaceTrack, listRaceVS } from "@/features/race/api";
import type { Race, RaceVSEntry } from "@/features/race/api";
import { listTrialsForRace } from "@/features/trial/api";
import type { Trial } from "@/features/trial/api";
import { listVS } from "@/features/vs/api";
import type { VS } from "@/features/vs/api";
import { listVolunteers } from "@/features/volunteer/api";
import type { Volunteer } from "@/features/volunteer/api";
import { listCars } from "@/features/car/api";
import type { Car } from "@/features/car/api";
import { listMissions } from "@/features/mission/api";
import type { Mission } from "@/features/mission/api";
import { listTrips } from "@/features/trip/api";
import type { Trip } from "@/features/trip/api";
import { listAssignmentsForVolunteer } from "@/features/assignment/api";
import { useEvent } from "@/features/event/hooks";

import type {
  CarCtx,
  MissionCtx,
  PositionContext,
  RaceTimeline,
  RaceVsTiming,
  TripCtx,
  TripStopCtx,
  VolunteerCtx,
  VsPoint,
} from "./positions";

export interface TrialBadge {
  id: number;
  name: string;
  color: string;
  startMs: number | null;
  endMs: number | null;
}

export interface TimelineData {
  loading: boolean;
  startMs: number;
  endMs: number;
  totalDays: number;
  races: Race[];
  racesById: Map<number, Race>;
  raceTimelines: Map<number, RaceTimeline>;
  trialBadgesByRace: Map<number, TrialBadge[]>;
  vsById: Map<number, VS>;
  volunteers: Volunteer[];
  volunteersById: Map<number, Volunteer>;
  cars: Car[];
  carsById: Map<number, Car>;
  missions: Mission[];
  missionsByVS: Map<number, Mission[]>;
  trips: Trip[];
  tripsByCar: Map<number, Trip[]>;
  context: PositionContext;
}

export function useTimelineData(): TimelineData {
  const ev = useEvent();
  const races = useQuery({ queryKey: ["races"], queryFn: listRaces });
  const vs = useQuery({ queryKey: ["vs"], queryFn: listVS });
  const volunteers = useQuery({
    queryKey: ["volunteers", "archived=all"],
    queryFn: () => listVolunteers("all"),
  });
  const cars = useQuery({ queryKey: ["cars"], queryFn: listCars });
  const missions = useQuery({ queryKey: ["missions"], queryFn: () => listMissions({}) });
  const trips = useQuery({ queryKey: ["trips"], queryFn: () => listTrips() });

  const raceIDs = races.data?.map((r) => r.id) ?? [];
  const raceTracks = useQueries({
    queries: raceIDs.map((id) => ({
      queryKey: ["races", id, "track"],
      queryFn: () => getRaceTrack(id),
    })),
  });
  const raceVSEntries = useQueries({
    queries: raceIDs.map((id) => ({
      queryKey: ["races", id, "vs"],
      queryFn: () => listRaceVS(id),
    })),
  });
  const raceTrials = useQueries({
    queries: raceIDs.map((id) => ({
      queryKey: ["races", id, "trials"],
      queryFn: () => listTrialsForRace(id),
    })),
  });

  const volunteerIDs = volunteers.data?.map((v) => v.id) ?? [];
  const assignmentQs = useQueries({
    queries: volunteerIDs.map((id) => ({
      queryKey: ["assignments", "volunteer", id],
      queryFn: () => listAssignmentsForVolunteer(id),
    })),
  });

  return useMemo<TimelineData>(() => {
    const loading =
      ev.isLoading ||
      races.isLoading ||
      vs.isLoading ||
      volunteers.isLoading ||
      cars.isLoading ||
      missions.isLoading ||
      trips.isLoading;

    const eventStart = ev.data?.start_date ?? "";
    const eventEnd = ev.data?.end_date ?? "";
    let dataStart = Number.POSITIVE_INFINITY;
    let dataEnd = Number.NEGATIVE_INFINITY;
    const considerMs = (s: string | null | undefined) => {
      if (!s) return;
      const t = Date.parse(s);
      if (!Number.isFinite(t)) return;
      if (t < dataStart) dataStart = t;
      if (t > dataEnd) dataEnd = t;
    };

    const racesArr = races.data ?? [];
    const racesById = new Map(racesArr.map((r) => [r.id, r] as const));

    // Consider timing from trials' start_time and VS entries' aggregated timings.
    for (let i = 0; i < racesArr.length; i++) {
      const trials = raceTrials[i]?.data ?? [];
      for (const t of trials) considerMs(t.start_time);
      const entries = raceVSEntries[i]?.data ?? [];
      for (const e of entries) {
        considerMs(e.earliest_first_in);
        considerMs(e.latest_last_in);
      }
    }
    const vsArr = vs.data ?? [];
    const vsById = new Map(vsArr.map((v) => [v.id, v] as const));
    const volArr = volunteers.data ?? [];
    const volunteersById = new Map(volArr.map((v) => [v.id, v] as const));
    const carsArr = cars.data ?? [];
    const carsById = new Map(carsArr.map((c) => [c.id, c] as const));

    const missionsArr = missions.data ?? [];
    const missionsByVS = new Map<number, Mission[]>();
    for (const m of missionsArr) {
      let bucket = missionsByVS.get(m.vs_id);
      if (!bucket) {
        bucket = [];
        missionsByVS.set(m.vs_id, bucket);
      }
      bucket.push(m);
      considerMs(m.start_time);
      considerMs(m.end_time);
    }

    const tripsArr = trips.data ?? [];
    const tripsByCar = new Map<number, Trip[]>();
    for (const t of tripsArr) {
      let bucket = tripsByCar.get(t.car_id);
      if (!bucket) {
        bucket = [];
        tripsByCar.set(t.car_id, bucket);
      }
      bucket.push(t);
      for (const s of t.stops) considerMs(s.time);
    }

    let startMs: number;
    let endMs: number;
    if (Number.isFinite(dataStart) && Number.isFinite(dataEnd)) {
      startMs = Math.floor(dataStart / 86_400_000) * 86_400_000;
      endMs = (Math.floor(dataEnd / 86_400_000) + 1) * 86_400_000 - 1;
    } else if (eventStart && eventEnd) {
      startMs = Date.parse(`${eventStart}T00:00:00Z`);
      endMs = Date.parse(`${eventEnd}T23:59:59Z`);
    } else {
      startMs = 0;
      endMs = startMs + 86_400_000;
    }
    const totalDays = Math.max(1, Math.floor((endMs - startMs) / 86_400_000) + 1);

    // Build race timelines from per-trial VS timing.
    const raceTimelines = new Map<number, RaceTimeline>();
    const trialBadgesByRace = new Map<number, TrialBadge[]>();
    for (let i = 0; i < racesArr.length; i++) {
      const r = racesArr[i];
      const track = raceTracks[i]?.data;
      const entries = raceVSEntries[i]?.data ?? [];
      const trials = raceTrials[i]?.data ?? [];
      const { tl, badges } = buildRaceTimeline(r, track, entries, trials, vsById);
      raceTimelines.set(r.id, tl);
      trialBadgesByRace.set(r.id, badges);
    }

    // Assignment → mission joins.
    const missionsByVolunteer = new Map<number, MissionCtx[]>();
    const missionById = new Map(missionsArr.map((m) => [m.id, m] as const));
    for (let i = 0; i < volunteerIDs.length; i++) {
      const vid = volunteerIDs[i];
      const aq = assignmentQs[i]?.data;
      if (!aq) continue;
      const list: MissionCtx[] = [];
      for (const a of aq) {
        const m = missionById.get(a.mission_id);
        if (!m) continue;
        const s = Date.parse(m.start_time);
        const e = Date.parse(m.end_time);
        if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
        list.push({ id: m.id, vs_id: m.vs_id, start_ms: s, end_ms: e });
      }
      list.sort((a, b) => a.start_ms - b.start_ms);
      missionsByVolunteer.set(vid, list);
    }

    // Trip projection.
    const tripsByPassenger = new Map<number, TripCtx[]>();
    const tripsByDriver = new Map<number, TripCtx[]>();
    const tripsByCarCtx = new Map<number, TripCtx[]>();
    for (const t of tripsArr) {
      const stops: TripStopCtx[] = [];
      for (const s of t.stops) {
        const ms = Date.parse(s.time);
        if (!Number.isFinite(ms)) continue;
        stops.push({ vs_id: s.vs_id, time_ms: ms, board: s.board ?? [], alight: s.alight ?? [] });
      }
      stops.sort((a, b) => a.time_ms - b.time_ms);
      const ctx: TripCtx = { id: t.id, car_id: t.car_id, driver_id: t.driver_id, stops };
      pushTo(tripsByCarCtx, t.car_id, ctx);
      pushTo(tripsByDriver, t.driver_id, ctx);
      const passengers = new Set<number>();
      for (const s of stops) for (const v of s.board) passengers.add(v);
      for (const p of passengers) pushTo(tripsByPassenger, p, ctx);
    }

    const volunteerCtxById = new Map<number, VolunteerCtx>();
    for (const v of volArr) volunteerCtxById.set(v.id, { id: v.id, default_vs_id: v.default_vs_id });
    const carCtxById = new Map<number, CarCtx>();
    for (const c of carsArr) carCtxById.set(c.id, { id: c.id, default_driver_id: c.default_driver_id });
    const vsPointById = new Map<number, VsPoint>();
    for (const v of vsArr) vsPointById.set(v.id, { id: v.id, lat: v.lat, lon: v.lon });

    const context: PositionContext = {
      vsById: vsPointById,
      missionsByVolunteer,
      tripsByPassenger,
      tripsByDriver,
      tripsByCar: tripsByCarCtx,
      volunteerById: volunteerCtxById,
      carById: carCtxById,
    };

    return {
      loading,
      startMs,
      endMs,
      totalDays,
      races: racesArr,
      racesById,
      raceTimelines,
      trialBadgesByRace,
      vsById,
      volunteers: volArr,
      volunteersById,
      cars: carsArr,
      carsById,
      missions: missionsArr,
      missionsByVS,
      trips: tripsArr,
      tripsByCar,
      context,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ev.data,
    races.data,
    vs.data,
    volunteers.data,
    cars.data,
    missions.data,
    trips.data,
    serializeQueryData(raceTracks),
    serializeQueryData(raceVSEntries),
    serializeQueryData(raceTrials),
    serializeQueryData(assignmentQs),
  ]);
}

function pushTo<K, V>(m: Map<K, V[]>, key: K, value: V): void {
  let bucket = m.get(key);
  if (!bucket) {
    bucket = [];
    m.set(key, bucket);
  }
  bucket.push(value);
}

function serializeQueryData(qs: ReadonlyArray<{ data: unknown; dataUpdatedAt: number }>): string {
  let s = "";
  for (const q of qs) s += `${q.data ? 1 : 0}:${q.dataUpdatedAt};`;
  return s;
}

function buildRaceTimeline(
  race: Race,
  track: { features: Array<{ geometry: { coordinates: number[][] } }> } | undefined,
  entries: RaceVSEntry[],
  trials: Trial[],
  vsById: Map<number, VS>,
): { tl: RaceTimeline; badges: TrialBadge[] } {
  let points = new Float32Array(0);
  let total = 0;
  if (track && track.features.length > 0) {
    const coords = track.features[0].geometry.coordinates;
    if (coords.length > 0) {
      points = new Float32Array(coords.length * 3);
      let cum = 0;
      for (let i = 0; i < coords.length; i++) {
        const lon = coords[i][0];
        const lat = coords[i][1];
        if (i > 0) {
          const prevLon = coords[i - 1][0];
          const prevLat = coords[i - 1][1];
          cum += haversineM(prevLat, prevLon, lat, lon);
        }
        points[i * 3] = lon;
        points[i * 3 + 1] = lat;
        points[i * 3 + 2] = cum;
      }
      total = cum;
    }
  }

  // Build front/tail timings from aggregated entries (earliest_first_in / latest_last_in).
  const front: RaceVsTiming[] = [];
  const tail: RaceVsTiming[] = [];
  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  for (const e of sorted) {
    if (!vsById.has(e.vs_id)) continue;
    const projected = e.projected_dist_m ?? 0;
    const fStr = e.earliest_first_in;
    const lStr = e.latest_last_in;
    if (fStr) {
      const ms = Date.parse(fStr);
      if (Number.isFinite(ms)) {
        front.push({ vs_id: e.vs_id, projected_dist_m: projected, first_in_ms: ms, last_in_ms: ms });
      }
    }
    if (lStr) {
      const ms = Date.parse(lStr);
      if (Number.isFinite(ms)) {
        tail.push({ vs_id: e.vs_id, projected_dist_m: projected, first_in_ms: ms, last_in_ms: ms });
      }
    }
  }
  front.sort((a, b) => a.first_in_ms - b.first_in_ms);
  tail.sort((a, b) => a.last_in_ms - b.last_in_ms);

  // Derive the overall start from the earliest trial start_time.
  let startMs: number | null = null;
  for (const t of trials) {
    if (t.start_time) {
      const ms = Date.parse(t.start_time);
      if (Number.isFinite(ms) && (startMs === null || ms < startMs)) startMs = ms;
    }
  }

  // Build trial badges: each trial spans from its start_time to the last VS timing.
  const badges: TrialBadge[] = trials
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((t) => {
      const tStart = t.start_time ? Date.parse(t.start_time) : null;
      // endMs = the last auto_last_in of this trial's VS entries (if available).
      // For simplicity use latest_last_in across all entries for this race.
      // A more precise version would query per-trial VS.
      const tEnd = tail.length > 0 ? tail[tail.length - 1].last_in_ms : tStart;
      return { id: t.id, name: t.name, color: race.color, startMs: tStart, endMs: tEnd ?? null };
    });

  const tl: RaceTimeline = { id: race.id, start_ms: startMs, total_distance_m: total, points, frontTimings: front, tailTimings: tail };
  return { tl, badges };
}

const R_EARTH_M = 6371008.8;
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.sqrt(a));
}
