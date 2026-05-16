import { apiFetch } from "@/lib/api";

export interface UploadResponse {
  session_id: string;
  filename: string;
  delimiter: string;
  headers: string[];
  preview: string[][];
  auto_mapping: Record<number, string>;
  row_count: number;
  field_keys: string[];
  header_hints: Record<string, string>;
}

export interface ValidatedRow {
  index: number;
  input: Record<string, unknown>;
  raw: Record<string, string>;
  errors?: string[];
}

export type Classification = "new" | "update" | "ambiguous" | "error" | "skip";

export interface RowDecision {
  row: ValidatedRow;
  class: Classification;
  candidates?: number[];
  target_id?: number | null;
}

export interface Counts {
  new: number;
  update: number;
  ambiguous: number;
  error: number;
  skip: number;
}

export interface MappingResponse {
  counts: Counts;
  decisions: RowDecision[];
}

export interface CommitResponse {
  result: { inserted: number; updated: number; skipped: number };
}

export async function csvUpload(file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<UploadResponse>("/api/csv/upload", { method: "POST", body: fd });
}

export async function csvMapping(
  session: string,
  columnToField: Record<string, string>,
  upsertKey: "name" | "email",
): Promise<MappingResponse> {
  return apiFetch<MappingResponse>(`/api/csv/${session}/mapping`, {
    method: "POST",
    body: JSON.stringify({ column_to_field: columnToField, upsert_key: upsertKey }),
  });
}

export async function csvResolve(
  session: string,
  row: number,
  choice: string,
): Promise<MappingResponse> {
  return apiFetch<MappingResponse>(`/api/csv/${session}/resolve`, {
    method: "POST",
    body: JSON.stringify({ row, choice }),
  });
}

export async function csvCommit(session: string): Promise<CommitResponse> {
  return apiFetch<CommitResponse>(`/api/csv/${session}/commit`, { method: "POST" });
}
