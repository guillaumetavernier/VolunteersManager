import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { dayForDate, extractHHMM } from "@/features/event/eventcal";
import { useEvent } from "@/features/event/hooks";
import { navigate } from "@/lib/router";
import { useVSList } from "@/features/vs/hooks";
import { useVolunteers } from "@/features/volunteer/hooks";
import type { Event } from "@/features/event/api";
import { useTransportNeeds } from "./hooks";
import type { TransportNeed } from "./api";

export function TransportNeedsList({ day }: { day?: number } = {}) {
  const needs = useTransportNeeds(day);
  const vs = useVSList();
  const vols = useVolunteers("all");
  const event = useEvent();

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
    <div className="grid min-w-0 gap-3" data-testid="transport-needs-list">
      {needs.isLoading && <p className="text-sm">Chargement…</p>}
      {!needs.isLoading && (needs.data?.length ?? 0) === 0 && (
        <div className="grid gap-1 text-sm text-slate-600">
          <p>Aucun besoin de transport.</p>
          <p className="text-xs text-slate-500">
            Cette liste affiche les bénévoles affectés à deux missions consécutives
            sur des PB différents qu&apos;aucun trajet ne couvre. Pour signaler les
            missions en sous-effectif, voir l&apos;icône ⚠ de l&apos;en-tête.
          </p>
        </div>
      )}
      {Array.from(grouped.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([d, list]) => (
          <section key={d} className="grid min-w-0 gap-1" data-day={d}>
            <h3 className="text-sm font-semibold">Jour {d}</h3>
            <ul className="min-w-0 divide-y divide-slate-200 rounded-md border border-slate-200">
              {list.map((n, idx) => (
                <li
                  key={`${n.volunteer_id}-${n.from_vs}-${n.to_vs}-${idx}`}
                  className="grid min-w-0 gap-2 p-3"
                  data-need={`${n.volunteer_id}-${n.from_vs}-${n.to_vs}`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{volName(n.volunteer_id)}</div>
                    <div className="truncate text-xs text-slate-500">
                      {formatLeg(event.data, n.from_time)} {vsName(n.from_vs)} →{" "}
                      {formatLeg(event.data, n.to_time)} {vsName(n.to_vs)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="justify-self-start"
                    onClick={() => {
                      const params = new URLSearchParams({
                        day: String(n.day),
                        from: String(n.from_vs),
                        to: String(n.to_vs),
                        vol: String(n.volunteer_id),
                        from_time: n.from_time,
                        to_time: n.to_time,
                      });
                      navigate(`/trajets/new?${params.toString()}`);
                    }}
                  >
                    Créer un trajet
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

// formatLeg shows just HH:MM, prefixed with J{day} when the leg's date falls
// outside the section's grouping day (cross-midnight pair). Leading the line
// with the time also reads more naturally than place-then-time.
function formatLeg(event: Event | null | undefined, t: string): string {
  const hhmm = extractHHMM(t) || t;
  if (!event) return hhmm;
  const d = dayForDate(event, t);
  return d != null ? `J${d} ${hhmm}` : hhmm;
}
