import { apiFetch } from "@/lib/api";

export interface AvailabilityWindow {
  day: number;
  start: string;
  end: string;
}

export interface Volunteer {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  general_info: string | null;
  customizable_message: string | null;
  role_types: string[];
  availability: AvailabilityWindow[];
  default_vs_id: number | null;
  can_drive: boolean;
  license_type: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface VolunteerInput {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  general_info?: string | null;
  customizable_message?: string | null;
  role_types?: string[];
  availability?: AvailabilityWindow[];
  default_vs_id?: number | null;
  can_drive?: boolean;
  license_type?: string | null;
  notes?: string | null;
  archived?: boolean;
}

export type VolunteerPatch = Partial<VolunteerInput>;

export type ArchivedFilter = "false" | "true" | "all";

export async function listVolunteers(filter: ArchivedFilter = "false"): Promise<Volunteer[]> {
  return apiFetch<Volunteer[]>(`/api/volunteers?archived=${filter}`);
}

export async function getVolunteer(id: number): Promise<Volunteer> {
  return apiFetch<Volunteer>(`/api/volunteers/${id}`);
}

export async function createVolunteer(input: VolunteerInput): Promise<Volunteer> {
  return apiFetch<Volunteer>("/api/volunteers", { method: "POST", body: JSON.stringify(input) });
}

export async function patchVolunteer(id: number, patch: VolunteerPatch): Promise<Volunteer> {
  return apiFetch<Volunteer>(`/api/volunteers/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function archiveVolunteer(id: number): Promise<void> {
  await apiFetch<null>(`/api/volunteers/${id}`, { method: "DELETE" });
}

export async function listRoleTypes(): Promise<string[]> {
  return apiFetch<string[]>("/api/volunteers/role-types");
}
