import { useEffect, useRef } from "react";
import { Pause, Play } from "lucide-react";

import { Button } from "@/components/ui/button";

import { SPEEDS, useTimelineCursor, type Speed } from "./useTimelineCursor";
import { useTimelineSelection } from "./useTimelineSelection";
import { effectiveTimeBounds, useTimelineWindow } from "./useTimelineWindow";
import type { TimelineData } from "./useTimelineData";

interface Props {
  data: TimelineData;
}

export function TimelineControls({ data }: Props) {
  const playing = useTimelineCursor((s) => s.playing);
  const cursor = useTimelineCursor((s) => s.cursorTime);
  const speed = useTimelineCursor((s) => s.speed);
  const toggle = useTimelineCursor((s) => s.toggle);
  const setSpeed = useTimelineCursor((s) => s.setSpeed);
  const seek = useTimelineCursor((s) => s.seek);
  const tick = useTimelineCursor((s) => s.tick);
  const setSelected = useTimelineSelection((s) => s.setSelected);
  const toggleRace = useTimelineSelection((s) => s.toggleRace);
  const isVisible = useTimelineSelection((s) => s.isVisible);
  const window = useTimelineWindow((s) => s.window);
  const setWindow = useTimelineWindow((s) => s.setWindow);

  // RAF loop — 30 fps throttle, deltas in real ms; cursor advances scaled.
  const last = useRef<number>(0);
  useEffect(() => {
    let raf = 0;
    let acc = 0;
    const FRAME_MS = 1000 / 30;
    const loop = (now: number) => {
      if (last.current === 0) last.current = now;
      const dt = now - last.current;
      last.current = now;
      acc += dt;
      while (acc >= FRAME_MS) {
        tick(FRAME_MS);
        acc -= FRAME_MS;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      last.current = 0;
    };
  }, [tick]);

  // Initialize cursor to the window start once data lands; also re-seek if
  // the cursor is sitting on a previous auto-seek target that has since
  // shifted — e.g. trial/race timings land after trip stops, shrinking the
  // window leftward so cursor < newStartMs is *false* but the cursor is now
  // stuck a full day past the new start. Tracking the last auto-target lets
  // us distinguish "user hasn't scrubbed yet" from "user picked this value."
  const lastAutoSeekRef = useRef<number | null>(null);
  useEffect(() => {
    if (data.startMs <= 0) return;
    const isAutoState =
      cursor === 0 || cursor === lastAutoSeekRef.current || cursor < data.startMs;
    if (isAutoState && cursor !== data.startMs) {
      seek(data.startMs);
      lastAutoSeekRef.current = data.startMs;
    }
  }, [data.startMs, cursor, seek]);

  useEffect(() => {
    if (data.dataStartMs <= 0) return;
    const { startMs, endMs } = effectiveTimeBounds(window, data.dataStartMs, data.dataEndMs);
    if (cursor < startMs || cursor > endMs) {
      seek(startMs);
      lastAutoSeekRef.current = startMs;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window, data.dataStartMs, data.dataEndMs]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggle();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const next = Math.max(data.startMs, useTimelineCursor.getState().cursorTime - 15 * 60_000);
        seek(next);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(data.endMs, useTimelineCursor.getState().cursorTime + 15 * 60_000);
        seek(next);
        return;
      }
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [toggle, seek, data.startMs, data.endMs]);

  const activeDayIndex = window.kind === "day" ? window.dayIndex : -1;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm">
      <Button
        type="button"
        size="icon"
        onClick={toggle}
        data-testid="timeline-toggle-play"
        aria-label={playing ? "Pause" : "Lecture"}
        className="h-8 w-8 rounded-full"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </Button>
      <label className="flex items-center gap-1">
        Vitesse&nbsp;:
        <select
          data-testid="timeline-speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value) as Speed)}
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{`${s}×`}</option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1" role="group" aria-label="Fenêtre temporelle">
        <button
          type="button"
          data-testid="timeline-window-tout"
          onClick={() => setWindow({ kind: "all" })}
          className={`rounded px-2 py-0.5 text-xs ${
            window.kind === "all"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          Tout
        </button>
        {Array.from({ length: data.totalDays }, (_, i) => (
          <button
            key={i}
            type="button"
            data-testid={`timeline-window-day-${i + 1}`}
            onClick={() => setWindow({ kind: "day", dayIndex: i })}
            className={`rounded px-2 py-0.5 text-xs ${
              activeDayIndex === i
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {`J${i + 1}`}
          </button>
        ))}
      </div>
      <span className="text-slate-500" data-testid="timeline-cursor-label">
        {new Date(cursor).toISOString().slice(0, 16).replace("T", " ")} UTC
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {data.races.map((r) => (
          <Button
            key={r.id}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleRace(r.id)}
            data-testid={`timeline-race-toggle-${r.id}`}
            className={`h-auto gap-1 rounded-full px-2 py-0.5 text-xs ${
              isVisible(r.id) ? "" : "bg-slate-100 text-slate-400"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
            {r.name}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSelected(null)}
          data-testid="timeline-clear-segment"
          className="h-auto rounded px-2 py-0.5 text-xs"
        >
          Effacer segment
        </Button>
      </div>
    </div>
  );
}
