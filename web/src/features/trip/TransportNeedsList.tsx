import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { useVSList } from "@/features/vs/hooks";
import { useVolunteers } from "@/features/volunteer/hooks";
import { useTransportNeeds } from "./hooks";
import type { TransportNeed } from "./api";

export function TransportNeedsList({ day }: { day?: number }) {
  const needs = useTransportNeeds(day);
  const vs = useVSList();
  const vols = useVolunteers("all");

  const vsName = (id: number) => vs.data?.find((v) => v.id === id)?.name ?? `VS ${id}`;
  const volName = (id: number) => {
    const v = vols.data?.find((x) => x.id === id);
    return v ? `${v.first_name} ${v.last_name}` : `Bénévole ${id}`;
  };

  const grouped = useMemo(() => {
    const out = new Map<number, TransportNeed[]>();
    for (const n of needs.data ?? []) {
      const arr = out.get(n.day) ?? [];
      arr.push(n);
      out.set(n.day, arr);
    }
    return out;
  }, [needs.data]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Besoins de transport</h1>
        <nav className="flex items-center gap-2 text-sm">
          <Button variant="link" size="sm" onClick={() => navigate("/trips")}>
            Trajets
          </Button>
        </nav>
      </header>
      {needs.isLoading && <p>Chargement…</p>}
      {!needs.isLoading && (needs.data?.length ?? 0) === 0 && (
        <p className="text-sm text-slate-600">Aucun besoin actuel.</p>
      )}
      {Array.from(grouped.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([d, list]) => (
          <section key={d} className="mb-6" data-day={d}>
            <h2 className="mb-2 text-lg font-semibold">Jour {d}</h2>
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
              {list.map((n, idx) => (
                <li
                  key={`${n.volunteer_id}-${n.from_vs}-${n.to_vs}-${idx}`}
                  className="flex items-center justify-between p-3"
                  data-need={`${n.volunteer_id}-${n.from_vs}-${n.to_vs}`}
                >
                  <div>
                    <div className="font-medium">{volName(n.volunteer_id)}</div>
                    <div className="text-xs text-slate-500">
                      {vsName(n.from_vs)} ({n.from_time}) → {vsName(n.to_vs)} ({n.to_time})
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      const params = new URLSearchParams({
                        day: String(n.day),
                        from: String(n.from_vs),
                        to: String(n.to_vs),
                        vol: String(n.volunteer_id),
                        from_time: n.from_time,
                        to_time: n.to_time,
                      });
                      navigate(`/trips/new?${params.toString()}`);
                    }}
                  >
                    Créer un trajet
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}
