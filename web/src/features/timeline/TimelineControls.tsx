import { useEffect, useRef } from "react";
import { Pause, Play } from "lucide-react";

import { SPEEDS, useTimelineCursor, type Speed } from "./useTimelineCursor";
import { useTimelineSelection } from "./useTimelineSelection";
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

  // Initialize cursor to event start once data lands.
  useEffect(() => {
    if (cursor === 0 && data.startMs > 0) seek(data.startMs);
  }, [data.startMs, cursor, seek]);

  const dayBoundaries = computeDayBoundaries(data.startMs, data.totalDays);
  const currentDay = Math.min(
    data.totalDays,
    Math.max(1, Math.floor((cursor - data.startMs) / 86_400_000) + 1),
  );

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 text-sm">
      <button
        onClick={toggle}
        data-testid="timeline-toggle-play"
        aria-label={playing ? "Pause" : "Lecture"}
        className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-white"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
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
      <label className="flex items-center gap-1">
        Jour&nbsp;:
        <select
          data-testid="timeline-day"
          value={currentDay}
          onChange={(e) => {
            const idx = Number(e.target.value) - 1;
            seek(dayBoundaries[idx]?.ms ?? data.startMs);
          }}
          className="rounded border border-slate-300 px-1 py-0.5"
        >
          {dayBoundaries.map((d, i) => (
            <option key={i} value={i + 1}>{`J${i + 1} — ${d.label}`}</option>
          ))}
        </select>
      </label>
      <span className="text-slate-500" data-testid="timeline-cursor-label">
        {new Date(cursor).toISOString().slice(0, 16).replace("T", " ")} UTC
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {data.races.map((r) => (
          <button
            key={r.id}
            onClick={() => toggleRace(r.id)}
            data-testid={`timeline-race-toggle-${r.id}`}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              isVisible(r.id) ? "border-slate-300 bg-white" : "border-slate-200 bg-slate-100 text-slate-400"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
            {r.name}
          </button>
        ))}
        <button
          onClick={() => setSelected(null)}
          data-testid="timeline-clear-segment"
          className="rounded border border-slate-300 px-2 py-0.5 text-xs"
        >
          Effacer segment
        </button>
      </div>
    </div>
  );
}

function computeDayBoundaries(startMs: number, totalDays: number): Array<{ ms: number; label: string }> {
  const out: Array<{ ms: number; label: string }> = [];
  for (let i = 0; i < totalDays; i++) {
    const ms = startMs + i * 86_400_000;
    out.push({ ms, label: new Date(ms).toISOString().slice(0, 10) });
  }
  return out;
}
