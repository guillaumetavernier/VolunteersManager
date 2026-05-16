import { apiFetch } from "@/lib/api";

export type Severity = "info" | "warn" | "error";

export type WarningKind =
  | "double_booking"
  | "role_mismatch"
  | "availability_violation"
  | "excessive_duty"
  | "no_break"
  | "understaffed"
  | "overstaffed"
  | "unassigned"
  | "missing_phone_with_assignments"
  | "stranded"
  | "insufficient_travel"
  | "capacity_exceeded"
  | "driver_double_book"
  | "passenger_double_book"
  | "board_without_alight"
  | "alight_before_board";

export type EntityType = "volunteer" | "mission" | "assignment" | "trip" | "trip_stop" | "car";

export interface EntityRef {
  type: EntityType;
  id: number;
}

export interface Warning {
  id: string;
  kind: WarningKind;
  severity: Severity;
  message: string;
  entities: EntityRef[];
  suggested_fix?: { description: string } | null;
}

export const warningsKey = ["warnings"] as const;

export async function listWarnings(): Promise<Warning[]> {
  return apiFetch<Warning[]>("/api/warnings");
}
