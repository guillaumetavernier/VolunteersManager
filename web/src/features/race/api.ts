import { apiFetch } from "@/lib/api";

export interface Race {
  id: number;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface RaceCreate {
  name: string;
  color?: string;
}

export type RacePatch = Partial<RaceCreate>;

export interface RaceVSEntry {
  id: number;
  race_id: number;
  vs_id: number;
  sequence: number;
  projected_dist_m: number | null;
  earliest_first_in: string | null;
  latest_last_in: string | null;
}

export async function listRaces(): Promise<Race[]> {
  return apiFetch<Race[]>("/api/races");
}
export async function getRace(id: number): Promise<Race> {
  return apiFetch<Race>(`/api/races/${id}`);
}
export async function createRace(input: RaceCreate): Promise<Race> {
  return apiFetch<Race>("/api/races", { method: "POST", body: JSON.stringify(input) });
}
export async function patchRace(id: number, input: RacePatch): Promise<Race> {
  return apiFetch<Race>(`/api/races/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}
export async function deleteRace(id: number): Promise<void> {
  await apiFetch<null>(`/api/races/${id}`, { method: "DELETE" });
}

export async function listRaceVS(id: number): Promise<RaceVSEntry[]> {
  return apiFetch<RaceVSEntry[]>(`/api/races/${id}/vs`);
}

export async function replaceRaceVS(id: number, items: Array<{ vs_id: number; sequence: number }>): Promise<RaceVSEntry[]> {
  return apiFetch<RaceVSEntry[]>(`/api/races/${id}/vs`, { method: "PUT", body: JSON.stringify(items) });
}

export type GeoJSON = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: { type: "LineString"; coordinates: number[][] };
  }>;
};

export async function getRaceTrack(id: number): Promise<GeoJSON> {
  return apiFetch<GeoJSON>(`/api/races/${id}/track`);
}
