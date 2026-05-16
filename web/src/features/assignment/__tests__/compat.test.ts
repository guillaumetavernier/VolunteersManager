import { describe, expect, it } from "vitest";
import type { Mission } from "@/features/mission/api";
import type { Volunteer } from "@/features/volunteer/api";
import { availabilityCovers, isCompatible, roleMatches } from "../compat";

function v(overrides: Partial<Volunteer> = {}): Volunteer {
  return {
    id: 1,
    first_name: "A",
    last_name: "B",
    phone: "+33611111111",
    email: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    general_info: null,
    customizable_message: null,
    role_types: ["Ravitaillement"],
    availability: [{ day: 1, start: "08:00", end: "12:00" }],
    default_vs_id: null,
    can_drive: false,
    license_type: null,
    notes: null,
    archived: false,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function m(overrides: Partial<Mission> = {}): Mission {
  return {
    id: 10,
    vs_id: 1,
    day: 1,
    start_time: "2026-06-01T08:00",
    end_time: "2026-06-01T11:00",
    role_type: "Ravitaillement",
    headcount: 1,
    title: null,
    description: null,
    tagged_race_ids: [],
    assigned: 0,
    needed: 1,
    status: "under",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("compat", () => {
  it("roleMatches is case-insensitive", () => {
    expect(roleMatches(v({ role_types: ["ravitaillement"] }), m())).toBe(true);
    expect(roleMatches(v({ role_types: ["Balisage"] }), m())).toBe(false);
  });

  it("availabilityCovers matches same-day windows", () => {
    expect(availabilityCovers(v(), m())).toBe(true);
    expect(availabilityCovers(v({ availability: [{ day: 2, start: "08:00", end: "12:00" }] }), m())).toBe(false);
  });

  it("isCompatible composes the three signals", () => {
    const r = isCompatible(v(), m(), []);
    expect(r.compatible).toBe(true);
    const r2 = isCompatible(v({ role_types: ["Other"] }), m(), []);
    expect(r2.compatible).toBe(false);
    expect(r2.roleMatch).toBe(false);
  });
});
