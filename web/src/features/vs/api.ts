import { apiFetch } from "@/lib/api";

export interface VS {
  id: number;
  name: string;
  lat: number;
  lon: number;
  notes: string | null;
  photo_path: string | null;
  what3words: string | null;
  created_at: string;
  updated_at: string;
}

export interface VSCreate {
  name: string;
  lat: number;
  lon: number;
  notes?: string | null;
  what3words?: string | null;
}

export type VSPatch = Partial<Omit<VSCreate, "name"> & { name: string }>;

export async function listVS(): Promise<VS[]> {
  return apiFetch<VS[]>("/api/vs");
}

export async function createVS(input: VSCreate): Promise<VS> {
  return apiFetch<VS>("/api/vs", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function patchVS(id: number, input: VSPatch): Promise<VS> {
  return apiFetch<VS>(`/api/vs/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteVS(id: number, force = false): Promise<void> {
  const qs = force ? "?force=true" : "";
  await apiFetch<null>(`/api/vs/${id}${qs}`, { method: "DELETE" });
}

export async function uploadVSPhoto(id: number, file: File): Promise<VS> {
  const form = new FormData();
  form.append("photo", file);
  return apiFetch<VS>(`/api/vs/${id}/photo`, {
    method: "POST",
    body: form,
  });
}
