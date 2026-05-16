import type { Mission } from "@/features/mission/api";
import type { Volunteer, AvailabilityWindow } from "@/features/volunteer/api";

export interface VolunteerScore {
  roleMatch: boolean;
  availabilityMatch: boolean;
  notBusy: boolean;
}

function timeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false;
  return aStart < bEnd && bStart < aEnd;
}

// availabilityWindowToISO maps an availability window (event-day + HH:MM strings)
// to ISO-like comparable strings using the mission's start_time as the date axis.
// Returns null if it can't be mapped.
function availabilityToISO(
  win: AvailabilityWindow,
  missionStart: string,
): { start: string; end: string } | null {
  if (!missionStart) return null;
  const datePart = missionStart.slice(0, 10);
  if (!datePart) return null;
  return {
    start: `${datePart}T${win.start}`,
    end: `${datePart}T${win.end}`,
  };
}

export function roleMatches(v: Volunteer, m: Mission): boolean {
  if (!m.role_type) return true;
  const target = m.role_type.trim().toLowerCase();
  return v.role_types.some((r) => r.trim().toLowerCase() === target);
}

export function availabilityCovers(v: Volunteer, m: Mission): boolean {
  if (v.availability.length === 0) return true;
  const sameDay = v.availability.filter((w) => w.day === m.day);
  if (sameDay.length === 0) return false;
  for (const w of sameDay) {
    const iso = availabilityToISO(w, m.start_time);
    if (!iso) continue;
    if (iso.start <= m.start_time && iso.end >= m.end_time) return true;
    if (timeOverlap(iso.start, iso.end, m.start_time, m.end_time)) return true;
  }
  return false;
}

export interface MissionLite {
  start_time: string;
  end_time: string;
  id: number;
}

export function notBusyAt(
  m: Mission,
  busy: MissionLite[],
): boolean {
  for (const b of busy) {
    if (b.id === m.id) continue;
    if (timeOverlap(b.start_time, b.end_time, m.start_time, m.end_time)) return false;
  }
  return true;
}

export function isCompatible(
  v: Volunteer,
  m: Mission,
  busy: MissionLite[],
): VolunteerScore & { compatible: boolean } {
  const roleMatch = roleMatches(v, m);
  const availabilityMatch = availabilityCovers(v, m);
  const notBusy = notBusyAt(m, busy);
  return {
    roleMatch,
    availabilityMatch,
    notBusy,
    compatible: roleMatch && availabilityMatch && notBusy,
  };
}
