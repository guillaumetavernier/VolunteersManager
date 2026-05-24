import { describe, expect, it } from "vitest";

import type { Mission } from "@/features/mission/api";
import type { Trip, TripStop } from "@/features/trip/api";
import type { EntityRef, Severity, Warning, WarningKind } from "@/features/warnings/api";

import { buildWarningLookups, tripLegKey } from "../warningLookup";

function mission(id: number, vs_id = 1, day = 1): Mission {
  return {
    id,
    vs_id,
    day,
    start_time: "08:00",
    end_time: "10:00",
    role_type: "signaleur",
    headcount: 1,
    title: null,
    description: null,
    tagged_race_ids: [],
    assigned: 1,
    needed: 1,
    status: "exact",
    created_at: "",
    updated_at: "",
  };
}

function stop(vs_id: number, sequence: number, id?: number): TripStop {
  return {
    id,
    sequence,
    vs_id,
    time: "08:00",
    leg_time_source: "auto",
    board: [],
    alight: [],
  };
}

function trip(id: number, stops: TripStop[]): Trip {
  return {
    id,
    day: 1,
    driver_id: 10,
    car_id: 20,
    mode: "drive",
    notes: "",
    stops,
    created_at: "",
    updated_at: "",
  };
}

function warning(
  kind: WarningKind,
  entities: EntityRef[],
  severity: Severity = "warn",
): Warning {
  return {
    id: `${kind}-${entities.map((e) => `${e.type}${e.id}`).join("-")}`,
    kind,
    severity,
    message: `message for ${kind}`,
    entities,
  };
}

const missions: Mission[] = [mission(1), mission(2), mission(3)];

// trip 1 has stops with server-side IDs (s100/s101/s102 → legs 0:s100→s101, 1:s101→s102).
// trip 2 has stops WITHOUT IDs to exercise the fallback path.
const trips: Trip[] = [
  trip(1, [stop(1, 0, 100), stop(2, 1, 101), stop(3, 2, 102)]),
  trip(2, [stop(1, 0), stop(2, 1), stop(3, 2)]),
];

describe("buildWarningLookups — mission-anchored kinds", () => {
  const cases: { name: string; kind: WarningKind }[] = [
    { name: "double_booking", kind: "double_booking" },
    { name: "role_mismatch", kind: "role_mismatch" },
    { name: "availability_violation", kind: "availability_violation" },
    { name: "excessive_duty", kind: "excessive_duty" },
    { name: "no_break", kind: "no_break" },
    { name: "understaffed", kind: "understaffed" },
    { name: "overstaffed", kind: "overstaffed" },
    { name: "stranded", kind: "stranded" },
  ];

  for (const c of cases) {
    it(`${c.name} attaches to the referenced mission`, () => {
      const w = warning(c.kind, [{ type: "mission", id: 1 }]);
      const { warningsByMission, warningsByTripLeg } = buildWarningLookups(
        missions,
        trips,
        [w],
      );
      expect(warningsByMission.get(1)).toEqual([w]);
      expect(warningsByTripLeg.size).toBe(0);
    });
  }

  it("a single warning may attach to multiple missions", () => {
    const w = warning("stranded", [
      { type: "mission", id: 1 },
      { type: "mission", id: 2 },
    ]);
    const { warningsByMission } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByMission.get(1)).toEqual([w]);
    expect(warningsByMission.get(2)).toEqual([w]);
  });
});

describe("buildWarningLookups — trip-leg kinds", () => {
  it("capacity_exceeded on a trip with stop IDs attaches only to the affected leg", () => {
    const w = warning("capacity_exceeded", [
      { type: "trip", id: 1 },
      { type: "trip_stop", id: 101 },
    ]);
    const { warningsByMission, warningsByTripLeg } = buildWarningLookups(
      missions,
      trips,
      [w],
    );
    expect(warningsByMission.size).toBe(0);
    expect(warningsByTripLeg.get(tripLegKey(1, 0))).toEqual([w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 1))).toEqual([w]);
    expect(warningsByTripLeg.size).toBe(2);
  });

  it("capacity_exceeded on a trip whose stops lack IDs falls back to every leg", () => {
    const w = warning("capacity_exceeded", [
      { type: "trip", id: 2 },
      { type: "trip_stop", id: 999 },
    ]);
    const { warningsByTripLeg } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByTripLeg.get(tripLegKey(2, 0))).toEqual([w]);
    expect(warningsByTripLeg.get(tripLegKey(2, 1))).toEqual([w]);
  });

  it("capacity_exceeded with only a trip ref (no stop) attaches to every leg", () => {
    const w = warning("capacity_exceeded", [{ type: "trip", id: 1 }]);
    const { warningsByTripLeg } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 0))).toEqual([w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 1))).toEqual([w]);
  });

  it("board_without_alight on a referenced stop attaches to legs that touch it", () => {
    const w = warning("board_without_alight", [
      { type: "trip", id: 1 },
      { type: "trip_stop", id: 100 },
    ]);
    const { warningsByTripLeg } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 0))).toEqual([w]);
    expect(warningsByTripLeg.has(tripLegKey(1, 1))).toBe(false);
  });

  it("alight_before_board references two stops → attaches to the legs they touch", () => {
    const w = warning("alight_before_board", [
      { type: "trip", id: 1 },
      { type: "trip_stop", id: 100 },
      { type: "trip_stop", id: 102 },
    ]);
    const { warningsByTripLeg } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 0))).toEqual([w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 1))).toEqual([w]);
  });

  it("driver_double_book attaches to every leg of the trip", () => {
    const w = warning("driver_double_book", [{ type: "trip", id: 1 }]);
    const { warningsByTripLeg } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 0))).toEqual([w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 1))).toEqual([w]);
    expect(warningsByTripLeg.size).toBe(2);
  });

  it("passenger_double_book attaches to every leg of the trip", () => {
    const w = warning("passenger_double_book", [{ type: "trip", id: 2 }]);
    const { warningsByTripLeg } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByTripLeg.get(tripLegKey(2, 0))).toEqual([w]);
    expect(warningsByTripLeg.get(tripLegKey(2, 1))).toEqual([w]);
  });

  it("insufficient_travel on a trip attaches to every leg", () => {
    const w = warning("insufficient_travel", [{ type: "trip", id: 1 }]);
    const { warningsByTripLeg, warningsByMission } = buildWarningLookups(
      missions,
      trips,
      [w],
    );
    expect(warningsByTripLeg.get(tripLegKey(1, 0))).toEqual([w]);
    expect(warningsByTripLeg.get(tripLegKey(1, 1))).toEqual([w]);
    expect(warningsByMission.size).toBe(0);
  });

  it("insufficient_travel on a mission attaches to the mission", () => {
    const w = warning("insufficient_travel", [{ type: "mission", id: 2 }]);
    const { warningsByMission, warningsByTripLeg } = buildWarningLookups(
      missions,
      trips,
      [w],
    );
    expect(warningsByMission.get(2)).toEqual([w]);
    expect(warningsByTripLeg.size).toBe(0);
  });
});

describe("buildWarningLookups — non-time-anchored kinds", () => {
  it("unassigned produces no map entries", () => {
    const w = warning("unassigned", [{ type: "volunteer", id: 5 }]);
    const { warningsByMission, warningsByTripLeg } = buildWarningLookups(
      missions,
      trips,
      [w],
    );
    expect(warningsByMission.size).toBe(0);
    expect(warningsByTripLeg.size).toBe(0);
  });

  it("missing_phone_with_assignments produces no map entries", () => {
    const w = warning("missing_phone_with_assignments", [
      { type: "volunteer", id: 5 },
      { type: "mission", id: 1 },
    ]);
    const { warningsByMission, warningsByTripLeg } = buildWarningLookups(
      missions,
      trips,
      [w],
    );
    expect(warningsByMission.size).toBe(0);
    expect(warningsByTripLeg.size).toBe(0);
  });
});

describe("buildWarningLookups — stale refs", () => {
  it("skips a warning whose mission id is not present", () => {
    const w = warning("double_booking", [{ type: "mission", id: 999 }]);
    const { warningsByMission, warningsByTripLeg } = buildWarningLookups(
      missions,
      trips,
      [w],
    );
    expect(warningsByMission.size).toBe(0);
    expect(warningsByTripLeg.size).toBe(0);
  });

  it("skips a warning whose trip id is not present", () => {
    const w = warning("driver_double_book", [{ type: "trip", id: 42 }]);
    const { warningsByMission, warningsByTripLeg } = buildWarningLookups(
      missions,
      trips,
      [w],
    );
    expect(warningsByMission.size).toBe(0);
    expect(warningsByTripLeg.size).toBe(0);
  });

  it("a mixed-ref warning keeps the valid bucket and drops the stale one", () => {
    const w = warning("stranded", [
      { type: "mission", id: 1 },
      { type: "mission", id: 999 },
    ]);
    const { warningsByMission } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByMission.get(1)).toEqual([w]);
    expect(warningsByMission.has(999)).toBe(false);
  });
});

describe("buildWarningLookups — staffing kinds keep the lookup entry", () => {
  it("understaffed mission warning is recorded (view layer decides border)", () => {
    const w = warning("understaffed", [{ type: "mission", id: 1 }], "warn");
    const { warningsByMission } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByMission.get(1)).toEqual([w]);
  });

  it("overstaffed mission warning is recorded", () => {
    const w = warning("overstaffed", [{ type: "mission", id: 2 }], "info");
    const { warningsByMission } = buildWarningLookups(missions, trips, [w]);
    expect(warningsByMission.get(2)).toEqual([w]);
  });
});

describe("buildWarningLookups — empty inputs", () => {
  it("returns empty maps when no warnings", () => {
    const { warningsByMission, warningsByTripLeg } = buildWarningLookups(
      missions,
      trips,
      [],
    );
    expect(warningsByMission.size).toBe(0);
    expect(warningsByTripLeg.size).toBe(0);
  });
});
