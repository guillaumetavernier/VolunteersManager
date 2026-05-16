import type { QueryClient } from "@tanstack/react-query";
import type { Warning } from "@/features/warnings/api";
import { warningsKey } from "@/features/warnings/api";
import type { WarningsDiff } from "@/lib/api";
import { setWarningsObserver } from "@/lib/api";

// applyDiff merges {added, removed} into the warnings query cache so the UI
// updates without a refetch. Called by the global apiFetch observer.
export function applyDiff(qc: QueryClient, diff: WarningsDiff) {
  qc.setQueryData<Warning[]>(warningsKey, (prev) => {
    const map = new Map<string, Warning>();
    for (const w of prev ?? []) map.set(w.id, w);
    for (const id of diff.removed ?? []) map.delete(id);
    for (const w of diff.added ?? []) map.set(w.id, w as Warning);
    return Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  });
}

// installWarningsBridge wires apiFetch's mutation observer to the query cache.
// Call once at app boot.
export function installWarningsBridge(qc: QueryClient) {
  setWarningsObserver((diff) => applyDiff(qc, diff));
}
