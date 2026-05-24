import { useEffect, useMemo, useRef, useState } from "react";

import { navigate } from "@/lib/router";
import { KIND_LABEL } from "@/features/warnings/labels";
import type { Severity, Warning } from "@/features/warnings/api";

import { useTimelineCursor } from "./useTimelineCursor";
import { useTimelineSelection } from "./useTimelineSelection";
import { tripLegKey } from "./warningLookup";
import type { TimelineData } from "./useTimelineData";

const ROW_H = 22;
const BADGE_ROW_H = 12;
const HEADER_H = 28;
const LEFT_GUTTER = 140;
const TOOLTIP_W = 240;

type Row =
  | { kind: "race-badge"; raceID: number; label: string }
  | { kind: "race-front"; raceID: number; label: string; color: string }
  | { kind: "race-tail"; raceID: number; label: string; color: string }
  | { kind: "missions-vs"; vsID: number; label: string }
  | { kind: "trips-car"; carID: number; label: string };

function rowH(r: Row): number {
  return r.kind === "race-badge" ? BADGE_ROW_H : ROW_H;
}

export interface BarPayload {
  raceID?: number;
  fromVsID?: number;
  toVsID?: number;
  missionID?: number;
  tripID?: number;
  legIndex?: number;
}

export interface Bar {
  rowIndex: number;
  startMs: number;
  endMs: number;
  fill: string;
  stroke?: string;
  title: string;
  kind: "mission" | "trip-leg" | "race-front" | "race-tail" | "race-badge";
  payload?: BarPayload;
}

interface Props {
  data: TimelineData;
  height?: number;
  scrollY?: number;
  onContentHeightChange?: (px: number) => void;
}

export function TimelineView({ data, height, scrollY = 0, onContentHeightChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const onscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: height ?? 200 });
  const cursorMs = useTimelineCursor((s) => s.cursorTime);
  const seek = useTimelineCursor((s) => s.seek);
  const setSelected = useTimelineSelection((s) => s.setSelected);
  const visibleRaces = useTimelineSelection((s) => s.visibleRaces);

  const { rows, bars, rowOffsets, totalContentH, timeBounds } = useMemo(
    () => buildRowsAndBars(data, visibleRaces),
    [data, visibleRaces],
  );
  if (typeof window !== "undefined") {
    (window as unknown as { __vmTimelineLayout?: unknown }).__vmTimelineLayout = {
      rows,
      bars,
      rowOffsets,
      timeBounds,
    };
  }
  const contentH = HEADER_H + totalContentH;
  const viewportH = height ?? Math.max(120, contentH);

  const strandedPairs = useMemo(() => buildStrandedPairs(data), [data]);

  useEffect(() => {
    if (onContentHeightChange) onContentHeightChange(contentH);
  }, [contentH, onContentHeightChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const rect = e.contentRect;
        const w = Math.max(200, Math.floor(rect.width));
        setSize((prev) => {
          const h = height ?? Math.max(120, contentH);
          if (prev.w === w && prev.h === h) return prev;
          return { w, h };
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [contentH, height]);

  useEffect(() => {
    setSize((prev) => {
      const h = height ?? Math.max(120, contentH);
      if (prev.h === h) return prev;
      return { ...prev, h };
    });
  }, [height, contentH]);

  useEffect(() => {
    if (!offscreenRef.current) offscreenRef.current = document.createElement("canvas");
    const off = offscreenRef.current;
    const dpr = window.devicePixelRatio || 1;
    off.width = size.w * dpr;
    off.height = size.h * dpr;
    const g = off.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStatic(g, size.w, size.h, rows, rowOffsets, bars, timeBounds, {
      scrollY,
      warningsByMission: data.warningsByMission,
      warningsByTripLeg: data.warningsByTripLeg,
      strandedPairs,
    });
    drawDynamic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, rows, bars, timeBounds, rowOffsets, scrollY, data.warningsByMission, data.warningsByTripLeg, strandedPairs]);

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

  const dragging = useRef(false);

  const [hover, setHover] = useState<{
    barIndex: number;
    warnings: Warning[];
    mouseX: number;
    mouseY: number;
  } | null>(null);

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
  function onMouseLeave() {
    dragging.current = false;
    setHover(null);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (dragging.current) {
      if (x < LEFT_GUTTER) return;
      const w = size.w - LEFT_GUTTER;
      const t = timeBounds.start + ((x - LEFT_GUTTER) / w) * (timeBounds.end - timeBounds.start);
      seek(t);
      return;
    }
    if (x < LEFT_GUTTER || y < HEADER_H) {
      if (hover) setHover(null);
      return;
    }
    const innerW = size.w - LEFT_GUTTER;
    const hit = hitTest(rows, bars, rowOffsets, x, y, scrollY, timeBounds, innerW);
    if (hit == null) {
      if (hover) setHover(null);
      return;
    }
    const warnings = warningsForBar(bars[hit], data);
    setHover({ barIndex: hit, warnings, mouseX: x, mouseY: y });
  }

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < LEFT_GUTTER) return;
    const w = size.w - LEFT_GUTTER;
    const t = timeBounds.start + ((x - LEFT_GUTTER) / w) * (timeBounds.end - timeBounds.start);
    if (y < HEADER_H) {
      seek(t);
      return;
    }
    const innerW = size.w - LEFT_GUTTER;
    const hit = hitTest(rows, bars, rowOffsets, x, y, scrollY, timeBounds, innerW);
    if (hit == null) {
      seek(t);
      return;
    }
    const bar = bars[hit];
    const row = rows[bar.rowIndex];
    if (bar.kind === "mission" && bar.payload?.missionID != null && row.kind === "missions-vs") {
      setSelected({ kind: "mission", missionID: bar.payload.missionID });
      navigate(`/vs/${row.vsID}?mission=${bar.payload.missionID}`);
      return;
    }
    if (bar.kind === "trip-leg" && bar.payload?.tripID != null && bar.payload?.legIndex != null) {
      setSelected({ kind: "trip-leg", tripID: bar.payload.tripID, legIndex: bar.payload.legIndex });
      navigate(`/trajets/${bar.payload.tripID}`);
      return;
    }
    if (bar.kind === "race-front" && row.kind === "race-front") {
      const from = bar.payload?.fromVsID;
      const to = bar.payload?.toVsID;
      if (from != null && to != null) {
        setSelected({ kind: "race-seg", raceID: row.raceID, fromVsID: from, toVsID: to });
        return;
      }
    }
    seek(t);
  }

  const tooltipFlip = hover ? hover.mouseX > size.w - TOOLTIP_W - 24 : false;
  const tooltipLeft = hover
    ? tooltipFlip
      ? Math.max(0, hover.mouseX - TOOLTIP_W - 12)
      : hover.mouseX + 12
    : 0;
  const tooltipTop = hover ? hover.mouseY + 12 : 0;

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: viewportH }}>
      <canvas
        ref={onscreenRef}
        data-testid="timeline-canvas"
        style={{ width: size.w, height: size.h }}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
      />
      {hover && hover.warnings.length > 0 && (
        <div
          role="tooltip"
          data-testid="timeline-tooltip"
          className="pointer-events-none absolute z-10 max-w-xs rounded bg-slate-900 p-2 text-xs text-white shadow"
          style={{ left: tooltipLeft, top: tooltipTop, width: TOOLTIP_W }}
        >
          <ul className="space-y-1">
            {hover.warnings.map((w) => (
              <li key={w.id}>
                <span className="font-semibold">{KIND_LABEL[w.kind] ?? w.kind}</span>
                <span>: {w.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface TimeBounds {
  start: number;
  end: number;
}

function buildStrandedPairs(data: TimelineData): {
  rightEdgeOn: Set<number>;
  leftEdgeOn: Set<number>;
} {
  const rightEdgeOn = new Set<number>();
  const leftEdgeOn = new Set<number>();
  const missionById = new Map<number, { start: number }>();
  for (const m of data.missions) {
    const s = Date.parse(m.start_time);
    if (!Number.isFinite(s)) continue;
    missionById.set(m.id, { start: s });
  }
  const seen = new Set<string>();
  for (const arr of data.warningsByMission.values()) {
    for (const w of arr) {
      if (w.kind !== "stranded") continue;
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      const missionIds = w.entities.filter((e) => e.type === "mission").map((e) => e.id);
      if (missionIds.length < 2) continue;
      const enriched = missionIds
        .map((id) => ({ id, start: missionById.get(id)?.start ?? Number.POSITIVE_INFINITY }))
        .sort((a, b) => a.start - b.start);
      const from = enriched[0];
      const to = enriched[enriched.length - 1];
      if (from.id === to.id) continue;
      rightEdgeOn.add(from.id);
      leftEdgeOn.add(to.id);
    }
  }
  return { rightEdgeOn, leftEdgeOn };
}

function warningsForBar(bar: Bar, data: TimelineData): Warning[] {
  if (bar.kind === "mission" && bar.payload?.missionID != null) {
    return data.warningsByMission.get(bar.payload.missionID) ?? [];
  }
  if (bar.kind === "trip-leg" && bar.payload?.tripID != null && bar.payload?.legIndex != null) {
    return data.warningsByTripLeg.get(tripLegKey(bar.payload.tripID, bar.payload.legIndex)) ?? [];
  }
  return [];
}

function buildRowsAndBars(
  data: TimelineData,
  visibleRaces: Record<number, boolean>,
): { rows: Row[]; bars: Bar[]; rowOffsets: number[]; totalContentH: number; timeBounds: TimeBounds } {
  const rows: Row[] = [];
  const bars: Bar[] = [];
  const start = data.startMs;
  const end = data.endMs;

  for (const r of data.races) {
    const on = visibleRaces[r.id] ?? true;
    if (!on) continue;
    const tl = data.raceTimelines.get(r.id);
    const badges = data.trialBadgesByRace.get(r.id) ?? [];

    const badgeRow = rows.length;
    rows.push({ kind: "race-badge", raceID: r.id, label: "" });
    for (const b of badges) {
      if (b.startMs == null) continue;
      const eMs = b.endMs ?? b.startMs;
      bars.push({
        rowIndex: badgeRow,
        startMs: b.startMs,
        endMs: eMs,
        fill: b.color,
        title: b.name,
        kind: "race-badge",
      });
    }

    const frontRow = rows.length;
    rows.push({ kind: "race-front", raceID: r.id, label: r.name + " (front)", color: r.color });
    const tailRow = rows.length;
    rows.push({ kind: "race-tail", raceID: r.id, label: r.name + " (queue)", color: r.color });
    if (!tl) continue;
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
        payload: { missionID: m.id },
      });
    }
  }

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
          payload: { tripID: tr.id, legIndex: i },
        });
      }
    }
  }

  const rowOffsets: number[] = [];
  let cum = 0;
  for (const r of rows) {
    rowOffsets.push(cum);
    cum += rowH(r);
  }

  return { rows, bars, rowOffsets, totalContentH: cum, timeBounds: { start, end } };
}

interface DrawCtx {
  scrollY: number;
  warningsByMission: Map<number, Warning[]>;
  warningsByTripLeg: Map<string, Warning[]>;
  strandedPairs: { rightEdgeOn: Set<number>; leftEdgeOn: Set<number> };
}

function drawStatic(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  rows: Row[],
  rowOffsets: number[],
  bars: Bar[],
  tb: TimeBounds,
  ctx: DrawCtx,
) {
  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();

  g.fillStyle = "#fafafa";
  g.fillRect(0, 0, w, h);

  const innerW = w - LEFT_GUTTER;
  const range = tb.end - tb.start;
  if (range <= 0) {
    g.restore();
    return;
  }

  const dayMs = 86_400_000;
  const firstDay = Math.floor(tb.start / dayMs) * dayMs;

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

  g.strokeStyle = "#94a3b8";
  g.lineWidth = 1;
  for (let d = firstDay; d <= tb.end; d += dayMs) {
    if (d < tb.start) continue;
    const x = LEFT_GUTTER + ((d - tb.start) / range) * innerW;
    g.beginPath();
    g.moveTo(x, HEADER_H);
    g.lineTo(x, h);
    g.stroke();
  }

  g.fillStyle = "#fff";
  g.fillRect(0, HEADER_H, LEFT_GUTTER, h - HEADER_H);
  g.strokeStyle = "#e2e8f0";
  g.beginPath();
  g.moveTo(LEFT_GUTTER, HEADER_H);
  g.lineTo(LEFT_GUTTER, h);
  g.stroke();

  g.font = "11px system-ui, sans-serif";
  for (let i = 0; i < rows.length; i++) {
    const baseY = HEADER_H + rowOffsets[i];
    const y = baseY - ctx.scrollY;
    const rh = rowH(rows[i]);
    if (y + rh < HEADER_H || y > h) continue;
    if (rows[i].kind !== "race-badge") {
      g.fillStyle = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      g.fillRect(LEFT_GUTTER, y, innerW, rh);
      g.fillStyle = "#0f172a";
      g.fillText(rows[i].label.slice(0, 22), 6, y + 14);
    } else {
      g.fillStyle = "#f1f5f9";
      g.fillRect(LEFT_GUTTER, y, innerW, rh);
    }
  }

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const baseY = HEADER_H + rowOffsets[b.rowIndex];
    const y = baseY - ctx.scrollY;
    const rh = rowH(rows[b.rowIndex]);
    if (y + rh < HEADER_H || y > h) continue;
    const x0 = LEFT_GUTTER + ((b.startMs - tb.start) / range) * innerW;
    const x1 = LEFT_GUTTER + ((b.endMs - tb.start) / range) * innerW;
    const minBw = b.kind === "mission" || b.kind === "trip-leg" ? 6 : 2;
    const bw = Math.max(minBw, x1 - x0);

    if (b.kind === "race-badge") {
      g.fillStyle = b.fill;
      g.globalAlpha = 0.75;
      g.fillRect(x0, y + 1, bw, rh - 2);
      if (bw > 30) {
        g.globalAlpha = 1;
        g.fillStyle = "#ffffff";
        g.font = "9px system-ui, sans-serif";
        g.fillText(b.title.slice(0, Math.floor(bw / 6)), x0 + 2, y + rh - 2);
      }
      g.globalAlpha = 1;
    } else {
      g.fillStyle = b.fill;
      g.globalAlpha = b.kind === "race-tail" ? 0.55 : 0.85;
      g.fillRect(x0, y + 3, bw, rh - 6);
      g.globalAlpha = 1;
    }

    const warnings = warningsForBarLookup(b, ctx);
    if (warnings.length > 0 && bw >= 4) {
      drawWarningBorder(g, b, warnings, x0, y, bw, rh);
    }

    if (b.kind === "mission" && b.payload?.missionID != null) {
      const mid = b.payload.missionID;
      const midY = y + rh / 2;
      if (ctx.strandedPairs.rightEdgeOn.has(mid)) {
        drawTriangle(g, x1, midY, "right");
      }
      if (ctx.strandedPairs.leftEdgeOn.has(mid)) {
        drawTriangle(g, x0, midY, "left");
      }
    }
  }

  g.restore();

  g.save();
  g.beginPath();
  g.rect(0, 0, w, h);
  g.clip();
  g.fillStyle = "#f1f5f9";
  g.fillRect(0, 0, w, HEADER_H);
  g.font = "11px system-ui, sans-serif";
  g.fillStyle = "#334155";
  for (let d = firstDay; d <= tb.end; d += dayMs) {
    if (d < tb.start) continue;
    const x = LEFT_GUTTER + ((d - tb.start) / range) * innerW;
    g.strokeStyle = "#94a3b8";
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, HEADER_H);
    g.stroke();
    const label = new Date(d).toISOString().slice(0, 10);
    g.fillText(label, x + 4, 14);
  }
  g.strokeStyle = "#e2e8f0";
  g.beginPath();
  g.moveTo(0, HEADER_H);
  g.lineTo(w, HEADER_H);
  g.stroke();
  g.restore();
}

function warningsForBarLookup(b: Bar, ctx: DrawCtx): Warning[] {
  if (b.kind === "mission" && b.payload?.missionID != null) {
    return ctx.warningsByMission.get(b.payload.missionID) ?? [];
  }
  if (b.kind === "trip-leg" && b.payload?.tripID != null && b.payload?.legIndex != null) {
    return ctx.warningsByTripLeg.get(tripLegKey(b.payload.tripID, b.payload.legIndex)) ?? [];
  }
  return [];
}

export function drawWarningBorder(
  g: CanvasRenderingContext2D,
  bar: Bar,
  warnings: Warning[],
  x0: number,
  y: number,
  bw: number,
  rh: number,
): void {
  const filtered = warnings.filter(
    (w) => w.kind !== "understaffed" && w.kind !== "overstaffed",
  );
  if (filtered.length === 0) return;
  const sev = maxSeverity(filtered);
  if (!sev) return;
  const color = sev === "error" ? "#dc2626" : sev === "warn" ? "#f59e0b" : "#2563eb";
  g.strokeStyle = color;
  g.lineWidth = 2;
  if (bar.kind === "race-badge") {
    g.strokeRect(x0 + 1, y + 2, Math.max(0, bw - 2), Math.max(0, rh - 4));
  } else {
    g.strokeRect(x0 + 1, y + 4, Math.max(0, bw - 2), Math.max(0, rh - 8));
  }
}

function maxSeverity(warnings: Warning[]): Severity | null {
  let best: Severity | null = null;
  for (const w of warnings) {
    if (w.severity === "error") return "error";
    if (w.severity === "warn") best = "warn";
    else if (w.severity === "info" && best == null) best = "info";
  }
  return best;
}

function drawTriangle(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  dir: "left" | "right",
): void {
  g.fillStyle = "#dc2626";
  g.beginPath();
  if (dir === "right") {
    g.moveTo(x, y - 3);
    g.lineTo(x + 6, y);
    g.lineTo(x, y + 3);
  } else {
    g.moveTo(x, y - 3);
    g.lineTo(x - 6, y);
    g.lineTo(x, y + 3);
  }
  g.closePath();
  g.fill();
}

export function hitTest(
  rows: Row[],
  bars: Bar[],
  rowOffsets: number[],
  mouseX: number,
  mouseY: number,
  scrollY: number,
  tb: TimeBounds,
  innerW: number,
): number | null {
  if (mouseX < LEFT_GUTTER || mouseY < HEADER_H) return null;
  const relY = mouseY - HEADER_H + scrollY;
  let rowI = -1;
  for (let i = 0; i < rowOffsets.length; i++) {
    const h = rowH(rows[i]);
    if (relY >= rowOffsets[i] && relY < rowOffsets[i] + h) {
      rowI = i;
      break;
    }
  }
  if (rowI < 0) return null;
  const range = tb.end - tb.start;
  if (range <= 0) return null;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (b.rowIndex !== rowI) continue;
    const x0 = LEFT_GUTTER + ((b.startMs - tb.start) / range) * innerW;
    const x1 = LEFT_GUTTER + ((b.endMs - tb.start) / range) * innerW;
    const minBw = b.kind === "mission" || b.kind === "trip-leg" ? 6 : 2;
    const bw = Math.max(minBw, x1 - x0);
    if (mouseX >= x0 && mouseX <= x0 + bw) return i;
  }
  return null;
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
  g.moveTo(x, HEADER_H);
  g.lineTo(x, h);
  g.stroke();
  const label = new Date(cursorMs).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  g.fillStyle = "#dc2626";
  g.font = "11px system-ui, sans-serif";
  const tw = g.measureText(label).width + 8;
  g.fillRect(Math.min(w - tw, Math.max(LEFT_GUTTER, x - tw / 2)), 0, tw, 16);
  g.fillStyle = "#ffffff";
  g.fillText(label, Math.min(w - tw, Math.max(LEFT_GUTTER, x - tw / 2)) + 4, 12);
}
