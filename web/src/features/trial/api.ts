import { apiFetch } from "@/lib/api";

export interface Trial {
  id: number;
  race_id: number;
  sequence: number;
  name: string;
  start_time: string | null;
  front_pace: number;
  tail_pace: number;
  created_at: string;
  updated_at: string;
}

export interface TrialCreate {
  name: string;
  sequence: number;
  start_time?: string | null;
  front_pace?: number;
  tail_pace?: number;
}

export type TrialPatch = Partial<Pick<Trial, "name" | "start_time" | "front_pace" | "tail_pace">>;

export interface TrialGPXFile {
  id: number;
  race_id: number;
  trial_id: number | null;
  file_path: string;
  total_distance_m: number;
  created_at: string;
}

export interface TrialVS {
  id: number;
  trial_id: number;
  vs_id: number;
  source: "auto" | "manual_include" | "manual_exclude";
  dist_in_trial_m: number | null;
  auto_first_in: string | null;
  auto_last_in: string | null;
  manual_first_in: string | null;
  manual_last_in: string | null;
}

export interface ReorderItem {
  trial_id: number;
  sequence: number;
}

export async function listTrialsForRace(raceID: number): Promise<Trial[]> {
  return apiFetch<Trial[]>(`/api/races/${raceID}/trials`);
}

export async function createTrial(raceID: number, input: TrialCreate): Promise<Trial> {
  return apiFetch<Trial>(`/api/races/${raceID}/trials`, { method: "POST", body: JSON.stringify(input) });
}

export async function patchTrial(id: number, input: TrialPatch): Promise<Trial> {
  return apiFetch<Trial>(`/api/trials/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function deleteTrial(id: number): Promise<void> {
  await apiFetch<null>(`/api/trials/${id}`, { method: "DELETE" });
}

export async function reorderTrials(raceID: number, items: ReorderItem[]): Promise<Trial[]> {
  return apiFetch<Trial[]>(`/api/races/${raceID}/trials/reorder`, { method: "PUT", body: JSON.stringify(items) });
}

export async function listTrialGPX(trialID: number): Promise<TrialGPXFile[]> {
  return apiFetch<TrialGPXFile[]>(`/api/trials/${trialID}/gpx`);
}

export async function uploadTrialGPX(trialID: number, file: File): Promise<TrialGPXFile> {
  const form = new FormData();
  form.append("gpx", file);
  return apiFetch<TrialGPXFile>(`/api/trials/${trialID}/gpx`, { method: "POST", body: form });
}

export async function deleteTrialGPX(trialID: number, gpxID: number): Promise<void> {
  await apiFetch<null>(`/api/trials/${trialID}/gpx/${gpxID}`, { method: "DELETE" });
}

export async function putTrialVS(
  id: number,
  patch: { source?: TrialVS["source"]; manual_first_in?: string | null; manual_last_in?: string | null },
): Promise<TrialVS> {
  return apiFetch<TrialVS>(`/api/race_trial_vs/${id}`, { method: "PUT", body: JSON.stringify(patch) });
}

export async function listTrialVS(trialID: number): Promise<TrialVS[]> {
  return apiFetch<TrialVS[]>(`/api/trials/${trialID}/vs`);
}
