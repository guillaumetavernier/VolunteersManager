import { useMemo, useState } from "react";

import { useEvent } from "@/features/event/hooks";
import { useVSList } from "@/features/vs/hooks";

import type { Mission } from "./api";
import { useMissions } from "./hooks";

const BUCKET_MIN = 30;
const FIRST_HOUR = 6;
const LAST_HOUR = 24;

export function MissionsGrid() {
  const ev = useEvent();
  const vs = useVSList();
  const totalDays = useMemo(() => dayCount(ev.data?.start_date, ev.data?.end_date), [ev.data]);
  const [day, setDay] = useState(1);
  const missions = useMissions({ day });

  const vsList = (vs.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const buckets = useMemo(() => {
    const out: { label: string; hh: number; mm: number }[] = [];
    for (let h = FIRST_HOUR; h < LAST_HOUR; h++) {
      for (let m = 0; m < 60; m += BUCKET_MIN) {
        out.push({ label: `${pad(h)}:${pad(m)}`, hh: h, mm: m });
      }
    }
    return out;
  }, []);

  return (
    <main className="mx-auto max-w-[1500px] p-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Grille des missions</h1>
      </header>
      <nav className="mb-4 flex gap-2" role="tablist" aria-label="Jours">
        {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === day}
            data-day-tab={d}
            onClick={() => setDay(d)}
            className={`rounded-md px-3 py-1 text-sm ${
              d === day ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-700"
            }`}
          >
            Jour {d}
          </button>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full border-collapse text-xs" data-missions-grid>
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-2 py-1 text-left">VS</th>
              {buckets.map((b) => (
                <th key={b.label} className="px-1 py-1 text-left text-[10px] font-normal text-slate-500">
                  {b.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vsList.map((v) => {
              const rowMissions = (missions.data ?? []).filter((m) => m.vs_id === v.id);
              return (
                <tr key={v.id} className="border-t border-slate-100" data-vs-row={v.id}>
                  <th className="sticky left-0 z-10 bg-white px-2 py-1 text-left font-medium">{v.name}</th>
                  {buckets.map((b) => (
                    <td key={b.label} className="px-1 py-1 align-top">
                      {rowMissions
                        .filter((m) => coversBucket(m, b.hh, b.mm))
                        .map((m) => (
                          <Chip key={m.id} m={m} bucket={b} />
                        ))}
                    </td>
                  ))}
                </tr>
              );
            })}
            {vsList.length === 0 && (
              <tr>
                <td colSpan={buckets.length + 1} className="px-2 py-4 text-center text-sm text-slate-500">
                  Aucun VS encore.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function coversBucket(m: Mission, hh: number, mm: number): boolean {
  const start = hourMinFrom(m.start_time);
  const end = hourMinFrom(m.end_time);
  if (start == null || end == null) return false;
  const slot = hh * 60 + mm;
  return start <= slot && slot < end;
}

function hourMinFrom(iso: string): number | null {
  if (!iso || iso.length < 16) return null;
  const hh = Number(iso.slice(11, 13));
  const mm = Number(iso.slice(14, 16));
  if (isNaN(hh) || isNaN(mm)) return null;
  return hh * 60 + mm;
}

function Chip({ m, bucket }: { m: Mission; bucket: { hh: number; mm: number } }) {
  const showLabel = hourMinFrom(m.start_time) === bucket.hh * 60 + bucket.mm;
  const tone =
    m.status === "exact"
      ? "bg-emerald-100 text-emerald-900"
      : m.status === "over"
        ? "bg-amber-100 text-amber-900"
        : "bg-rose-100 text-rose-900";
  return (
    <span
      data-mission-chip={m.id}
      className={`mb-1 block rounded px-1 py-0.5 text-[10px] ${tone}`}
      title={`${m.role_type} ${m.start_time.slice(11, 16)}–${m.end_time.slice(11, 16)} ${m.assigned}/${m.needed}`}
    >
      {showLabel ? `${m.role_type} ${m.assigned}/${m.needed}` : ""}
    </span>
  );
}

function dayCount(start?: string, end?: string): number {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
  const days = Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
  return Math.max(1, days);
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
