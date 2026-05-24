import { describe, expect, it, vi } from "vitest";

import type { Warning } from "@/features/warnings/api";

import { drawWarningBorder, type Bar } from "../TimelineView";

interface StrokeCall {
  x: number;
  y: number;
  w: number;
  h: number;
}

function fakeCtx() {
  const strokes: StrokeCall[] = [];
  const styles: string[] = [];
  const widths: number[] = [];
  const ctx = {
    set strokeStyle(v: string) {
      styles.push(v);
    },
    get strokeStyle() {
      return styles[styles.length - 1] ?? "";
    },
    set lineWidth(v: number) {
      widths.push(v);
    },
    get lineWidth() {
      return widths[widths.length - 1] ?? 0;
    },
    strokeRect: vi.fn((x: number, y: number, w: number, h: number) => {
      strokes.push({ x, y, w, h });
    }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokes, styles, widths };
}

function warning(kind: Warning["kind"], severity: Warning["severity"], id = kind): Warning {
  return { id, kind, severity, message: "", entities: [] };
}

const missionBar: Bar = {
  rowIndex: 0,
  startMs: 0,
  endMs: 1,
  fill: "#10b981",
  title: "",
  kind: "mission",
  payload: { missionID: 1 },
};

describe("drawWarningBorder", () => {
  it("uses red for error severity and strokes inside the bar", () => {
    const { ctx, strokes, styles, widths } = fakeCtx();
    drawWarningBorder(ctx, missionBar, [warning("stranded", "error")], 100, 50, 40, 22);
    expect(strokes).toHaveLength(1);
    expect(styles).toContain("#dc2626");
    expect(widths).toContain(2);
    expect(strokes[0]).toEqual({ x: 101, y: 54, w: 38, h: 14 });
  });

  it("uses amber for warn severity", () => {
    const { ctx, styles } = fakeCtx();
    drawWarningBorder(ctx, missionBar, [warning("insufficient_travel", "warn")], 0, 0, 20, 22);
    expect(styles).toContain("#f59e0b");
  });

  it("uses blue for info severity", () => {
    const { ctx, styles } = fakeCtx();
    drawWarningBorder(ctx, missionBar, [warning("no_break", "info")], 0, 0, 20, 22);
    expect(styles).toContain("#2563eb");
  });

  it("picks the strongest severity in the list", () => {
    const { ctx, styles } = fakeCtx();
    drawWarningBorder(
      ctx,
      missionBar,
      [warning("no_break", "info"), warning("stranded", "error"), warning("double_booking", "warn")],
      0,
      0,
      20,
      22,
    );
    expect(styles).toContain("#dc2626");
  });

  it("does not stroke when the only warnings are understaffed/overstaffed", () => {
    const { ctx, strokes } = fakeCtx();
    drawWarningBorder(
      ctx,
      missionBar,
      [warning("understaffed", "error"), warning("overstaffed", "warn")],
      0,
      0,
      20,
      22,
    );
    expect(strokes).toHaveLength(0);
  });

  it("strokes using the max severity over non-staffing warnings only", () => {
    const { ctx, strokes, styles } = fakeCtx();
    drawWarningBorder(
      ctx,
      missionBar,
      [warning("understaffed", "error"), warning("no_break", "info")],
      0,
      0,
      20,
      22,
    );
    expect(strokes).toHaveLength(1);
    expect(styles).toContain("#2563eb");
  });
});
