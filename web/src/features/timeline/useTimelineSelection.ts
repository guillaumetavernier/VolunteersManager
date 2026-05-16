import { create } from "zustand";

export interface SelectedSegment {
  raceID: number;
  fromVsID: number;
  toVsID: number;
}

interface State {
  selected: SelectedSegment | null;
  visibleRaces: Record<number, boolean>;
  setSelected(s: SelectedSegment | null): void;
  toggleRace(id: number, on?: boolean): void;
  isVisible(id: number): boolean;
}

export const useTimelineSelection = create<State>((set, get) => ({
  selected: null,
  visibleRaces: {},
  setSelected: (s) => set({ selected: s }),
  toggleRace: (id, on) =>
    set((st) => ({ visibleRaces: { ...st.visibleRaces, [id]: on ?? !(st.visibleRaces[id] ?? true) } })),
  isVisible: (id) => get().visibleRaces[id] ?? true,
}));

export function isRaceVisible(state: { visibleRaces: Record<number, boolean> }, id: number): boolean {
  return state.visibleRaces[id] ?? true;
}
