import { useQuery } from "@tanstack/react-query";
import { listWarnings, warningsKey, type EntityRef, type Warning } from "./api";

export function useWarnings() {
  return useQuery({
    queryKey: warningsKey,
    queryFn: listWarnings,
    staleTime: 60_000,
  });
}

export function filterByEntity(all: Warning[] | undefined, ref: EntityRef): Warning[] {
  if (!all) return [];
  return all.filter((w) =>
    w.entities.some((e) => e.type === ref.type && e.id === ref.id),
  );
}

export function topSeverity(ws: Warning[]): "error" | "warn" | "info" | null {
  if (ws.some((w) => w.severity === "error")) return "error";
  if (ws.some((w) => w.severity === "warn")) return "warn";
  if (ws.some((w) => w.severity === "info")) return "info";
  return null;
}
