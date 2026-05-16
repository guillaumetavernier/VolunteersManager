import { create } from "zustand";

export type Speed = 1 | 5 | 30 | 300;
export const SPEEDS: Speed[] = [1, 5, 30, 300];

interface State {
  cursorTime: number;
  playing: boolean;
  speed: Speed;
  setCursor(t: number): void;
  setSpeed(s: Speed): void;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(t: number): void;
  tick(dtRealMs: number): void;
}

export const useTimelineCursor = create<State>((set, get) => ({
  cursorTime: 0,
  playing: false,
  speed: 1,
  setCursor: (t) => set({ cursorTime: t }),
  setSpeed: (s) => set({ speed: s }),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  toggle: () => set({ playing: !get().playing }),
  seek: (t) => set({ cursorTime: t }),
  tick: (dtRealMs) => {
    const s = get();
    if (!s.playing) return;
    set({ cursorTime: s.cursorTime + dtRealMs * s.speed });
  },
}));
