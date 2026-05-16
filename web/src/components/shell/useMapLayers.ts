import { create } from "zustand";

interface State {
  raceVisibility: Record<number, boolean>;
  toggleRace(id: number, visible: boolean): void;
}

export const useMapLayers = create<State>((set) => ({
  raceVisibility: {},
  toggleRace: (id, visible) =>
    set((s) => ({ raceVisibility: { ...s.raceVisibility, [id]: visible } })),
}));
