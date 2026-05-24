import { create } from "zustand";

export type TimelineWindow =
  | { kind: "all" }
  | { kind: "day"; dayIndex: number };

interface State {
  window: TimelineWindow;
  setWindow(w: TimelineWindow): void;
}

export const useTimelineWindow = create<State>((set) => ({
  window: { kind: "all" },
  setWindow: (w) => set({ window: w }),
}));

const DAY_MS = 86_400_000;

export function effectiveTimeBounds(
  window: TimelineWindow,
  dataStartMs: number,
  dataEndMs: number,
): { startMs: number; endMs: number } {
  if (window.kind === "all") {
    return { startMs: dataStartMs, endMs: dataEndMs };
  }
  const startMs = dataStartMs + window.dayIndex * DAY_MS;
  return { startMs, endMs: startMs + DAY_MS - 1 };
}
