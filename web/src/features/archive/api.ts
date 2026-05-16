import { apiFetch } from "@/lib/api";

export interface ImportResp {
  path: string;
}

export async function uploadArchive(file: File): Promise<ImportResp> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<ImportResp>("/api/archive/import", {
    method: "POST",
    body: fd,
  });
}

export function exportArchiveUrl(): string {
  return "/api/archive/export";
}
