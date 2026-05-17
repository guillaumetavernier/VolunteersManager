import { useEffect, useMemo, useRef, useState } from "react";

import { useTimelineCursor } from "./useTimelineCursor";
import { useTimelineSelection } from "./useTimelineSelection";
import type { TimelineData } from "./useTimelineData";

const ROW_H = 22;
const HEADER_H = 28;
const LEFT_GUTTER = 140;

type Row =
  | { kind: "race-front"; raceID: number; label: string; color: string }
  | { kind: "race-tail"; raceID: number; label: string; color: string }
  | { kind: "missions-vs"; vsID: number; label: string }
  | { kind: "trips-car"; carID: number; label: string };

interface Bar {
  rowIndex: number;
  startMs: number;
  endMs: number;
  fill: string;
  stroke?: string;
  title: string;
  kind: "mission" | "trip-leg" | "race-front" | "race-tail";
  payload?: { raceID?: number; fromVsID?: number; toVsID?: number };
}

interface Props {
  data: TimelineData;
}

export function TimelineView({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const onscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 200 });
  const cursorMs = useTimelineCursor((s) => s.cursorTime);
  const seek = useTimelineCursor((s) => s.seek);
  const setSelected = useTimelineSelection((s) => s.setSelected);
  const visibleRaces = useTimelineSelection((s) => s.visibleRaces);

  const { rows, bars, timeBounds } = useMemo(() => buildRowsAndBars(data, visibleRaces), [data, visibleRaces]);
  const contentH = HEADER_H + rows.length * ROW_H;

  // Resize observer keeps the canvas in step with its parent.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const rect = e.contentRect;
        setSize({ w: Math.max(200, Math.floor(rect.width)), h: Math.max(120, contentH) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentH]);

  // Redraw off-screen on data/size change.
  useEffect(() => {
    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    const off = offscreenRef.current;
    const dpr = window.devicePixelRatio || 1;
    off.width = size.w * dpr;
    off.height = size.h * dpr;
    const g = off.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStatic(g, size.w, size.h, rows, bars, timeBounds);
    drawDynamic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, rows, bars, timeBounds]);

  // Redraw on cursor change (composite only).
  useEffect(() => {
    drawDynamic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorMs, size]);

  function drawDynamic() {
    const on = onscreenRef.current;
    const off = offscreenRef.current;
    if (!on || !off) return;
    const dpr = window.devicePixelRatio || 1;
    on.width = size.w * dpr;
    on.height = size.h * dpr;
    const g = on.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    g.drawImage(off, 0, 0, size.w, size.h);
    drawCursor(g, size.w, size.h, cursorMs, timeBounds);
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < LEFT_GUTTER) return;
    const rowI = Math.floor((y - HEADER_H) / ROW_H);
    if (rowI < 0 || rowI >= rows.length) return;
    const w = size.w - LEFT_GUTTER;
    const t = timeBounds.start + ((x - LEFT_GUTTER) / w) * (timeBounds.end - timeBounds.start);
    // Race-front row → select sub-segment under cursor.
    const row = rows[rowI];
    if (row.kind === "race-front") {
      const seg = bars.find(
        (b) =>
          b.rowIndex === rowI &&
          b.kind === "race-front" &&
          t >= b.startMs &&
          t <= b.endMs &&
          b.payload?.fromVsID != null &&
          b.payload?.toVsID != null,
      );
      if (seg && seg.payload?.fromVsID != null && seg.payload?.toVsID != null) {
        setSelected({
          raceID: row.raceID,
          fromVsID: seg.payload.fromVsID,
          toVsID: seg.payload.toVsID,
        });
        return;
      }
    }
    seek(t);
  }

  // Cursor drag handling.
  const dragging = useRef(false);
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (e.button !== 0) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < LEFT_GUTTER) return;
    dragging.current = true;
  }
  function onMouseUp() {
    dragging.current = false;
  }
  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!dragging.current) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < LEFT_GUTTER) return;
    const w = size.w - LEFT_GUTTER;
    const t = timeBounds.start + ((x - LEFT_GUTTER) / w) * (timeBounds.end - timeBounds.start);
    seek(t);
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: contentH }}>
      <canvas
        ref={onscreenRef}
        data-testid="timeline-canvas"
        style={{ width: size.w, height: size.h }}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onMouseMove={onMouseMove}
      />
    </div>
  );
}

interface TimeBounds {
  start: number;
  end: number;
}

function buildRowsAndBars(
  data: TimelineData,
  visibleRaces: Record<number, boolean>,
): { rows: Row[]; bars: Bar[]; timeBounds: TimeBounds } {
  const rows: Row[] = [];
  const bars: Bar[] = [];
  const start = data.startMs;
  const end = data.endMs;

  // Race rows (front + tail) for each race.
  for (const r of data.races) {
    const on = visibleRaces[r.id] ?? true;
    if (!on) continue;
    const tl = data.raceTimelines.get(r.id);
    const frontRow = rows.length;
    rows.push({ kind: "race-front", raceID: r.id, label: r.name + " (front)", color: r.color });
    const tailRow = rows.length;
    rows.push({ kind: "race-tail", raceID: r.id, label: r.name + " (queue)", color: r.color });
    if (!tl) continue;
    // Build front/tail segments using timing arrays.
    const prependFront: Array<{ t: number; vsID: number | null }> = [];
    const prependTail: Array<{ t: number; vsID: number | null }> = [];
    if (tl.start_ms != null) {
      prependFront.push({ t: tl.start_ms, vsID: null });
      prependTail.push({ t: tl.start_ms, vsID: null });
    }
    const frontPts = [...prependFront, ...tl.frontTimings.map((x) => ({ t: x.first_in_ms, vsID: x.vs_id }))];
    const tailPts = [...prependTail, ...tl.tailTimings.map((x) => ({ t: x.last_in_ms, vsID: x.vs_id }))];
    for (let i = 0; i < frontPts.length - 1; i++) {
      const a = frontPts[i];
      const b = frontPts[i + 1];
      const from = a.vsID;
      const to = b.vsID;
      if (from == null || to == null) {
        bars.push({
          rowIndex: frontRow,
          startMs: a.t,
          endMs: b.t,
          fill: r.color,
          title: `${r.name} front`,
          kind: "race-front",
        });
      } else {
        bars.push({
          rowIndex: frontRow,
          startMs: a.t,
          endMs: b.t,
          fill: r.color,
          title: `${r.name} front: PB ${from} → PB ${to}`,
          kind: "race-front",
          payload: { raceID: r.id, fromVsID: from, toVsID: to },
        });
      }
    }
    for (let i = 0; i < tailPts.length - 1; i++) {
      const a = tailPts[i];
      const b = tailPts[i + 1];
      bars.push({
        rowIndex: tailRow,
        startMs: a.t,
        endMs: b.t,
        fill: r.color,
        title: `${r.name} queue`,
        kind: "race-tail",
      });
    }
  }

  // VS rows for missions.
  const vsWithMissions = [...data.missionsByVS.entries()].sort((a, b) => a[0] - b[0]);
  for (const [vsID, missions] of vsWithMissions) {
    const vs = data.vsById.get(vsID);
    const row = rows.length;
    rows.push({ kind: "missions-vs", vsID, label: vs ? vs.name : `PB ${vsID}` });
    for (const m of missions) {
      const s = Date.parse(m.start_time);
      const e = Date.parse(m.end_time);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      const fill =
        m.status === "exact" ? "#10b981" : m.status === "over" ? "#f59e0b" : "#ef4444";
      bars.push({
        rowIndex: row,
        startMs: s,
        endMs: e,
        fill,
        title: `${m.role_type} ${m.assigned}/${m.needed}`,
        kind: "mission",
      });
    }
  }

  // Car rows for trips.
  const carsWithTrips = [...data.tripsByCar.entries()].sort((a, b) => a[0] - b[0]);
  for (const [carID, trips] of carsWithTrips) {
    const car = data.carsById.get(carID);
    const row = rows.length;
    rows.push({ kind: "trips-car", carID, label: car ? car.name : `Car ${carID}` });
    for (const tr of trips) {
      const stops = [...tr.stops].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
      for (let i = 0; i < stops.length - 1; i++) {
        const a = Date.parse(stops[i].time);
        const b = Date.parse(stops[i + 1].time);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        bars.push({
          rowIndex: row,
          startMs: a,
          endMs: b,
          fill: "#3b82f6",
          title: `Trip #${tr.id}: ${stops[i].vs_id} → ${stops[i + 1].vs_id}`,
          kind: "trip-leg",
        });
      }
    }
  }

  return { rows, bars, timeBounds: { start, end } };
}

function drawStatic(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  rows: Row[],
  bars: Bar[],
  tb: TimeBounds,
) {
  g.fillStyle = "#fafafa";
  g.fillRect(0, 0, w, h);
  // Header background.
  g.fillStyle = "#f1f5f9";
  g.fillRect(0, 0, w, HEADER_H);

  const innerW = w - LEFT_GUTTER;
  const range = tb.end - tb.start;
  if (range <= 0) return;

  // Day boundaries (major). Use UTC midnight to keep it deterministic.
  const dayMs = 86_400_000;
  const firstDay = Math.floor(tb.start / dayMs) * dayMs;
  g.strokeStyle = "#94a3b8";
  g.lineWidth = 1;
  g.font = "11px system-ui, sans-serif";
  g.fillStyle = "#334155";
  for (let d = firstDay; d <= tb.end; d += dayMs) {
    if (d < tb.start) continue;
    const x = LEFT_GUTTER + ((d - tb.start) / range) * innerW;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
    const label = new Date(d).toISOString().slice(0, 10);
    g.fillText(label, x + 4, 14);
  }
  // Hour minor gridlines — only when zoom level shows few enough days.
  const daysVisible = range / dayMs;
  if (daysVisible <= 7) {
    g.strokeStyle = "#e2e8f0";
    g.lineWidth = 1;
    for (let t = firstDay; t <= tb.end; t += 3_600_000) {
      const x = LEFT_GUTTER + ((t - tb.start) / range) * innerW;
      if (x < LEFT_GUTTER) continue;
      g.beginPath();
      g.moveTo(x, HEADER_H);
      g.lineTo(x, h);
      g.stroke();
    }
  }

  // Row labels gutter.
  g.fillStyle = "#fff";
  g.fillRect(0, HEADER_H, LEFT_GUTTER, h - HEADER_H);
  g.strokeStyle = "#e2e8f0";
  g.beginPath();
  g.moveTo(LEFT_GUTTER, 0);
  g.lineTo(LEFT_GUTTER, h);
  g.stroke();

  g.font = "11px system-ui, sans-serif";
  g.fillStyle = "#0f172a";
  for (let i = 0; i < rows.length; i++) {
    const y = HEADER_H + i * ROW_H;
    g.fillStyle = i % 2 === 0 ? "#ffffff" : "#f8fafc";
    g.fillRect(LEFT_GUTTER, y, innerW, ROW_H);
    g.fillStyle = "#0f172a";
    g.fillText(rows[i].label.slice(0, 22), 6, y + 14);
  }

  // Bars.
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const y = HEADER_H + b.rowIndex * ROW_H + 3;
    const x0 = LEFT_GUTTER + ((b.startMs - tb.start) / range) * innerW;
    const x1 = LEFT_GUTTER + ((b.endMs - tb.start) / range) * innerW;
    const bw = Math.max(2, x1 - x0);
    g.fillStyle = b.fill;
    g.globalAlpha = b.kind === "race-tail" ? 0.55 : 0.85;
    g.fillRect(x0, y, bw, ROW_H - 6);
    g.globalAlpha = 1;
  }
}

function drawCursor(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  cursorMs: number,
  tb: TimeBounds,
) {
  const innerW = w - LEFT_GUTTER;
  const range = tb.end - tb.start;
  if (range <= 0) return;
  const x = LEFT_GUTTER + ((cursorMs - tb.start) / range) * innerW;
  g.strokeStyle = "#dc2626";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, 0);
  g.lineTo(x, h);
  g.stroke();
  // Cursor label.
  const label = new Date(cursorMs).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  g.fillStyle = "#dc2626";
  g.font = "11px system-ui, sans-serif";
  const tw = g.measureText(label).width + 8;
  g.fillRect(Math.min(w - tw, Math.max(LEFT_GUTTER, x - tw / 2)), 0, tw, 16);
  g.fillStyle = "#ffffff";
  g.fillText(label, Math.min(w - tw, Math.max(LEFT_GUTTER, x - tw / 2)) + 4, 12);
}
