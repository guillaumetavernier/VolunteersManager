import { apiFetch } from "@/lib/api";

export interface TripStop {
  id?: number;
  sequence: number;
  vs_id: number;
  time: string;
  leg_time_source: "auto" | "manual";
  board: number[];
  alight: number[];
}

export interface Trip {
  id: number;
  day: number;
  driver_id: number;
  car_id: number;
  mode: "drive" | "walk";
  notes: string;
  stops: TripStop[];
  created_at: string;
  updated_at: string;
}

export interface TripInput {
  day: number;
  driver_id: number;
  car_id: number;
  mode: "drive" | "walk";
  notes: string;
  stops: Array<{
    vs_id: number;
    time: string;
    leg_time_source?: "auto" | "manual";
    board?: number[];
    alight?: number[];
  }>;
}

export interface TransportNeed {
  volunteer_id: number;
  from_vs: number;
  from_time: string;
  to_vs: number;
  to_time: string;
  day: number;
}

export async function listTrips(day?: number): Promise<Trip[]> {
  const qs = day != null ? `?day=${day}` : "";
  return apiFetch<Trip[]>(`/api/trips${qs}`);
}

export async function getTrip(id: number): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${id}`);
}

export async function createTrip(input: TripInput): Promise<Trip> {
  return apiFetch<Trip>("/api/trips", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function replaceTrip(id: number, input: TripInput): Promise<Trip> {
  return apiFetch<Trip>(`/api/trips/${id}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteTrip(id: number): Promise<void> {
  await apiFetch<null>(`/api/trips/${id}`, { method: "DELETE" });
}

export async function listTransportNeeds(day?: number): Promise<TransportNeed[]> {
  const qs = day != null ? `?day=${day}` : "";
  return apiFetch<TransportNeed[]>(`/api/transport-needs${qs}`);
}
