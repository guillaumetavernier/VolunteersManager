import { apiFetch } from "@/lib/api";

export type StaffingStatus = "under" | "exact" | "over";

export interface Mission {
  id: number;
  vs_id: number;
  day: number;
  start_time: string;
  end_time: string;
  role_type: string;
  headcount: number;
  title: string | null;
  description: string | null;
  tagged_race_ids: number[];
  assigned: number;
  needed: number;
  status: StaffingStatus;
  created_at: string;
  updated_at: string;
}

export interface MissionInput {
  day: number;
  start_time: string;
  end_time: string;
  role_type: string;
  headcount: number;
  title?: string | null;
  description?: string | null;
  tagged_race_ids?: number[];
}

export type MissionPatch = Partial<MissionInput>;

export interface MissionFilter {
  day?: number;
  role?: string;
  race?: number;
}

export async function listMissionsForVS(vsID: number, day?: number): Promise<Mission[]> {
  const qs = day != null ? `?day=${day}` : "";
  return apiFetch<Mission[]>(`/api/vs/${vsID}/missions${qs}`);
}

export async function listMissions(f: MissionFilter = {}): Promise<Mission[]> {
  const params = new URLSearchParams();
  if (f.day != null) params.set("day", String(f.day));
  if (f.role) params.set("role", f.role);
  if (f.race != null) params.set("race", String(f.race));
  const qs = params.toString();
  return apiFetch<Mission[]>(`/api/missions${qs ? `?${qs}` : ""}`);
}

export async function getMission(id: number): Promise<Mission> {
  return apiFetch<Mission>(`/api/missions/${id}`);
}

export async function createMission(vsID: number, input: MissionInput): Promise<Mission> {
  return apiFetch<Mission>(`/api/vs/${vsID}/missions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchMission(id: number, patch: MissionPatch): Promise<Mission> {
  return apiFetch<Mission>(`/api/missions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteMission(id: number): Promise<void> {
  await apiFetch<null>(`/api/missions/${id}`, { method: "DELETE" });
}
