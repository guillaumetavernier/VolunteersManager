import { useCallback, useEffect, useState } from "react";

const HEIGHT_KEY = "timeline.heightPx";
const COLLAPSED_KEY = "timeline.collapsed";
const MIN_PX = 80;
const MAX_RATIO = 0.7;
const DEFAULT_RATIO = 0.4;

export interface UseGanttHeight {
  heightPx: number;
  collapsed: boolean;
  setHeightPx(px: number): void;
  toggleCollapsed(): void;
}

function maxFor(innerHeight: number): number {
  return Math.round(innerHeight * MAX_RATIO);
}

function clamp(px: number, innerHeight: number): number {
  return Math.min(Math.max(px, MIN_PX), maxFor(innerHeight));
}

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readBoolean(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "boolean" ? parsed : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function useGanttHeight(): UseGanttHeight {
  const [heightPx, setHeightPxState] = useState<number>(300);
  const [collapsed, setCollapsedState] = useState<boolean>(false);

  useEffect(() => {
    const innerHeight = window.innerHeight;
    const stored = readNumber(HEIGHT_KEY);
    const initial = stored ?? Math.round(innerHeight * DEFAULT_RATIO);
    const clamped = clamp(initial, innerHeight);
    setHeightPxState(clamped);
    if (clamped !== stored) write(HEIGHT_KEY, clamped);

    const storedCollapsed = readBoolean(COLLAPSED_KEY);
    setCollapsedState(storedCollapsed ?? false);
  }, []);

  useEffect(() => {
    function onResize() {
      const innerHeight = window.innerHeight;
      setHeightPxState((prev) => {
        const clamped = clamp(prev, innerHeight);
        if (clamped !== prev) write(HEIGHT_KEY, clamped);
        return clamped;
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const setHeightPx = useCallback((px: number) => {
    const clamped = clamp(px, window.innerHeight);
    write(HEIGHT_KEY, clamped);
    setHeightPxState(clamped);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      write(COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  return { heightPx, collapsed, setHeightPx, toggleCollapsed };
}
