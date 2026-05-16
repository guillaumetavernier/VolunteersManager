import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { listRaces, getRaceTrack, listRaceVS } from "@/features/race/api";
import type { Race, RaceVSEntry } from "@/features/race/api";
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

export interface TimelineData {
  loading: boolean;
  startMs: number;
  endMs: number;
  totalDays: number;
  races: Race[];
  racesById: Map<number, Race>;
  raceTimelines: Map<number, RaceTimeline>;
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
    const startMs = eventStart ? Date.parse(`${eventStart}T00:00:00Z`) : 0;
    const endMs = eventEnd ? Date.parse(`${eventEnd}T23:59:59Z`) : startMs + 86_400_000;
    const totalDays = eventStart && eventEnd
      ? Math.max(1, Math.floor((Date.parse(eventEnd) - Date.parse(eventStart)) / 86_400_000) + 1)
      : 1;

    const racesArr = races.data ?? [];
    const racesById = new Map(racesArr.map((r) => [r.id, r] as const));
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
    }

    // Build race timelines (flattened GPX + projected timings).
    const raceTimelines = new Map<number, RaceTimeline>();
    for (let i = 0; i < racesArr.length; i++) {
      const r = racesArr[i];
      const track = raceTracks[i]?.data;
      const entries = raceVSEntries[i]?.data;
      raceTimelines.set(r.id, buildRaceTimeline(r, track, entries ?? [], vsById));
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

    // Trip projection: build per-car/passenger/driver indexes with epoch-ms stops.
    const tripsByPassenger = new Map<number, TripCtx[]>();
    const tripsByDriver = new Map<number, TripCtx[]>();
    const tripsByCarCtx = new Map<number, TripCtx[]>();
    for (const t of tripsArr) {
      const stops: TripStopCtx[] = [];
      for (const s of t.stops) {
        const ms = Date.parse(s.time);
        if (!Number.isFinite(ms)) continue;
        stops.push({
          vs_id: s.vs_id,
          time_ms: ms,
          board: s.board ?? [],
          alight: s.alight ?? [],
        });
      }
      stops.sort((a, b) => a.time_ms - b.time_ms);
      const ctx: TripCtx = { id: t.id, car_id: t.car_id, driver_id: t.driver_id, stops };
      pushTo(tripsByCarCtx, t.car_id, ctx);
      pushTo(tripsByDriver, t.driver_id, ctx);
      const passengers = new Set<number>();
      for (const s of stops) {
        for (const v of s.board) passengers.add(v);
      }
      for (const p of passengers) pushTo(tripsByPassenger, p, ctx);
    }

    const volunteerCtxById = new Map<number, VolunteerCtx>();
    for (const v of volArr) {
      volunteerCtxById.set(v.id, { id: v.id, default_vs_id: v.default_vs_id });
    }
    const carCtxById = new Map<number, CarCtx>();
    for (const c of carsArr) {
      carCtxById.set(c.id, { id: c.id, default_driver_id: c.default_driver_id });
    }
    const vsPointById = new Map<number, VsPoint>();
    for (const v of vsArr) {
      vsPointById.set(v.id, { id: v.id, lat: v.lat, lon: v.lon });
    }

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
    // Tracks/entries/assignments are arrays of query results; depend on the data of each.
    serializeQueryData(raceTracks),
    serializeQueryData(raceVSEntries),
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
  // Cheap fingerprint: count + last update timestamp per slot.
  let s = "";
  for (const q of qs) s += `${q.data ? 1 : 0}:${q.dataUpdatedAt};`;
  return s;
}

function buildRaceTimeline(
  race: Race,
  track: { features: Array<{ geometry: { coordinates: number[][] } }> } | undefined,
  entries: RaceVSEntry[],
  vsById: Map<number, VS>,
): RaceTimeline {
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

  const startMs = race.start_time ? Date.parse(race.start_time) : null;
  const front: RaceVsTiming[] = [];
  const tail: RaceVsTiming[] = [];
  const sorted = [...entries].sort((a, b) => a.sequence - b.sequence);
  for (const e of sorted) {
    if (!vsById.has(e.vs_id)) continue;
    const projected = e.projected_dist_m ?? 0;
    const fStr = e.manual_first_in ?? e.auto_first_in;
    const lStr = e.manual_last_in ?? e.auto_last_in;
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

  return {
    id: race.id,
    start_ms: startMs,
    total_distance_m: total,
    points,
    frontTimings: front,
    tailTimings: tail,
  };
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
