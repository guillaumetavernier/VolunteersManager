import type { Mission } from "@/features/mission/api";
import type { Trip } from "@/features/trip/api";
import type { Warning } from "@/features/warnings/api";

export interface WarningLookups {
  warningsByMission: Map<number, Warning[]>;
  warningsByTripLeg: Map<string, Warning[]>;
}

export function tripLegKey(tripID: number, legIdx: number): string {
  return `${tripID}:${legIdx}`;
}

export function buildWarningLookups(
  missions: Mission[],
  trips: Trip[],
  warnings: Warning[],
): WarningLookups {
  const missionIds = new Set(missions.map((m) => m.id));
  const tripsById = new Map(trips.map((t) => [t.id, t] as const));

  const warningsByMission = new Map<number, Warning[]>();
  const warningsByTripLeg = new Map<string, Warning[]>();

  const pushMission = (missionID: number, w: Warning) => {
    if (!missionIds.has(missionID)) return;
    const arr = warningsByMission.get(missionID) ?? [];
    arr.push(w);
    warningsByMission.set(missionID, arr);
  };

  const pushLeg = (tripID: number, legIdx: number, w: Warning) => {
    const key = tripLegKey(tripID, legIdx);
    const arr = warningsByTripLeg.get(key) ?? [];
    arr.push(w);
    warningsByTripLeg.set(key, arr);
  };

  const attachToAllLegs = (trip: Trip, w: Warning) => {
    const legCount = Math.max(0, trip.stops.length - 1);
    for (let i = 0; i < legCount; i++) pushLeg(trip.id, i, w);
  };

  const missionRefs = (w: Warning) =>
    w.entities.filter((e) => e.type === "mission");
  const tripRefs = (w: Warning) => w.entities.filter((e) => e.type === "trip");
  const tripStopRefs = (w: Warning) =>
    w.entities.filter((e) => e.type === "trip_stop");

  for (const w of warnings) {
    if (w.kind === "unassigned" || w.kind === "missing_phone_with_assignments") {
      continue;
    }

    switch (w.kind) {
      case "capacity_exceeded":
      case "board_without_alight":
      case "alight_before_board": {
        const stopIDs = new Set(tripStopRefs(w).map((e) => e.id));
        for (const tr of tripRefs(w)) {
          const trip = tripsById.get(tr.id);
          if (!trip) continue;
          // Trip API may omit server-side stop IDs (TripStop.id optional);
          // when absent we attach to every leg of the trip as a safe fallback.
          const stopsHaveIds = trip.stops.some((s) => s.id != null);
          if (!stopsHaveIds || stopIDs.size === 0) {
            attachToAllLegs(trip, w);
            continue;
          }
          const legCount = Math.max(0, trip.stops.length - 1);
          for (let i = 0; i < legCount; i++) {
            const from = trip.stops[i];
            const to = trip.stops[i + 1];
            if (
              (from.id != null && stopIDs.has(from.id)) ||
              (to.id != null && stopIDs.has(to.id))
            ) {
              pushLeg(trip.id, i, w);
            }
          }
        }
        break;
      }

      case "driver_double_book":
      case "passenger_double_book": {
        for (const tr of tripRefs(w)) {
          const trip = tripsById.get(tr.id);
          if (!trip) continue;
          attachToAllLegs(trip, w);
        }
        break;
      }

      case "insufficient_travel": {
        for (const tr of tripRefs(w)) {
          const trip = tripsById.get(tr.id);
          if (!trip) continue;
          attachToAllLegs(trip, w);
        }
        for (const mr of missionRefs(w)) pushMission(mr.id, w);
        break;
      }

      default: {
        for (const mr of missionRefs(w)) pushMission(mr.id, w);
        break;
      }
    }
  }

  return { warningsByMission, warningsByTripLeg };
}
