import { apiFetch } from "@/lib/api";

export interface Race {
  id: number;
  name: string;
  color: string;
  front_pace: number;
  tail_pace: number;
  start_time: string | null;
  created_at: string;
  updated_at: string;
}

export interface RaceCreate {
  name: string;
  color?: string;
  front_pace?: number;
  tail_pace?: number;
  start_time?: string | null;
}

export type RacePatch = Partial<RaceCreate>;

export interface GPXFile {
  id: number;
  race_id: number;
  day: number | null;
  file_path: string;
  total_distance_m: number;
  created_at: string;
}

export interface RaceVSEntry {
  id: number;
  race_id: number;
  vs_id: number;
  sequence: number;
  projected_dist_m: number | null;
  auto_first_in: string | null;
  auto_last_in: string | null;
  manual_first_in: string | null;
  manual_last_in: string | null;
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

export async function listRaceGPX(id: number): Promise<GPXFile[]> {
  return apiFetch<GPXFile[]>(`/api/races/${id}/gpx`);
}

export async function uploadRaceGPX(id: number, file: File, day?: number | null): Promise<GPXFile> {
  const form = new FormData();
  form.append("gpx", file);
  const qs = day != null ? `?day=${day}` : "";
  return apiFetch<GPXFile>(`/api/races/${id}/gpx${qs}`, { method: "POST", body: form });
}

export async function deleteRaceGPX(raceID: number, gpxID: number): Promise<void> {
  await apiFetch<null>(`/api/races/${raceID}/gpx/${gpxID}`, { method: "DELETE" });
}

export async function listRaceVS(id: number): Promise<RaceVSEntry[]> {
  return apiFetch<RaceVSEntry[]>(`/api/races/${id}/vs`);
}

export async function replaceRaceVS(id: number, items: Array<{ vs_id: number; sequence: number }>): Promise<RaceVSEntry[]> {
  return apiFetch<RaceVSEntry[]>(`/api/races/${id}/vs`, { method: "PUT", body: JSON.stringify(items) });
}

export async function patchRaceVSTimes(
  raceID: number,
  vsID: number,
  patch: { manual_first_in?: string | null; manual_last_in?: string | null },
): Promise<RaceVSEntry> {
  return apiFetch<RaceVSEntry>(`/api/races/${raceID}/vs/${vsID}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
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

export async function clearRaceVSManual(
  raceID: number,
  vsID: number,
  fields: { first?: boolean; last?: boolean },
): Promise<RaceVSEntry> {
  const qs: string[] = [];
  if (fields.first) qs.push("first=1");
  if (fields.last) qs.push("last=1");
  const url = `/api/races/${raceID}/vs/${vsID}/manual${qs.length ? `?${qs.join("&")}` : ""}`;
  return apiFetch<RaceVSEntry>(url, { method: "DELETE" });
}
