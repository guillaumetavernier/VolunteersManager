import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { useVSList } from "@/features/vs/hooks";
import { useMatrix, usePatchCell, useRecomputeMatrix, type MatrixCell } from "./hooks";
import type { TravelMode, TravelSource } from "./api";

function fmt(seconds: number): string {
  if (seconds <= 0) return "0 s";
  if (seconds < 60) return `${seconds} s`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function sourceLabel(s: TravelSource): string {
  if (s === "manual") return "manuel";
  if (s === "auto") return "auto";
  return "estimé";
}

export function MatrixView() {
  const vs = useVSList();
  const matrix = useMatrix();
  const patch = usePatchCell();
  const recompute = useRecomputeMatrix();
  const [mode, setMode] = useState<TravelMode>("drive");
  const cells = matrix.data ?? [];
  const byKey = useMemo(() => {
    const map = new Map<string, MatrixCell>();
    for (const c of cells) map.set(`${c.from_vs}-${c.to_vs}-${c.mode}`, c);
    return map;
  }, [cells]);

  const vsList = vs.data ?? [];

  async function onEdit(c: MatrixCell) {
    const raw = prompt(
      `Durée (en minutes) ${c.mode} pour ce trajet`,
      String(Math.round(c.seconds / 60)),
    );
    if (raw == null) return;
    const mins = Number(raw);
    if (!Number.isFinite(mins) || mins < 0) return;
    await patch.mutateAsync({
      from_vs: c.from_vs,
      to_vs: c.to_vs,
      mode: c.mode,
      seconds: Math.round(mins * 60),
    });
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Matrice de trajets</h1>
        <nav className="flex items-center gap-2 text-sm">
          <Button variant="link" size="sm" onClick={() => navigate("/trips")}>
            Trajets
          </Button>
          <Button variant="link" size="sm" onClick={() => navigate("/")}>
            Carte
          </Button>
        </nav>
      </header>
      <div className="mb-4 flex items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span>Mode</span>
          <select
            className="input w-full"
            value={mode}
            onChange={(e) => setMode(e.target.value as TravelMode)}
            aria-label="Mode"
          >
            <option value="drive">Voiture</option>
            <option value="walk">Marche</option>
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => recompute.mutate()}
          data-testid="recompute-matrix"
        >
          Recalculer
        </Button>
      </div>
      {matrix.isLoading && <p>Chargement…</p>}
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm" data-testid="matrix-table">
          <thead>
            <tr>
              <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">Depuis / Vers</th>
              {vsList.map((v) => (
                <th key={v.id} className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">
                  {v.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vsList.map((from) => (
              <tr key={from.id}>
                <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left">
                  {from.name}
                </th>
                {vsList.map((to) => {
                  const c = byKey.get(`${from.id}-${to.id}-${mode}`);
                  if (!c) {
                    return (
                      <td key={to.id} className="border border-slate-200 px-2 py-1 text-slate-400">
                        —
                      </td>
                    );
                  }
                  return (
                    <td
                      key={to.id}
                      className="border border-slate-200 px-2 py-1"
                      data-cell={`${from.id}-${to.id}-${mode}`}
                      data-source={c.source}
                    >
                      <button
                        onClick={() => onEdit(c)}
                        className="flex w-full flex-col items-start text-left"
                        aria-label={`Cellule ${from.name} → ${to.name}`}
                      >
                        <span>{fmt(c.seconds)}</span>
                        <span
                          className={`mt-0.5 inline-block rounded px-1 text-xs ${
                            c.source === "manual"
                              ? "bg-amber-100 text-amber-900"
                              : c.source === "auto"
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {sourceLabel(c.source)}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
