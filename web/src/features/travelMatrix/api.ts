import { apiFetch } from "@/lib/api";

export type TravelSource = "auto" | "manual" | "fallback";
export type TravelMode = "drive" | "walk";

export interface MatrixCell {
  from_vs: number;
  to_vs: number;
  mode: TravelMode;
  seconds: number;
  source: TravelSource;
}

export interface MatrixPatch {
  from_vs: number;
  to_vs: number;
  mode: TravelMode;
  seconds: number;
}

export async function listMatrix(): Promise<MatrixCell[]> {
  return apiFetch<MatrixCell[]>("/api/travel-times");
}

export async function patchCell(p: MatrixPatch): Promise<MatrixCell> {
  return apiFetch<MatrixCell>("/api/travel-times", {
    method: "PATCH",
    body: JSON.stringify(p),
  });
}

export async function recompute(): Promise<MatrixCell[]> {
  return apiFetch<MatrixCell[]>("/api/travel-times/recompute", {
    method: "POST",
  });
}
