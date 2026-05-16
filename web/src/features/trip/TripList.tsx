import { useVSList } from "@/features/vs/hooks";
import { useVolunteers } from "@/features/volunteer/hooks";
import { useCars } from "@/features/car/hooks";
import { navigate } from "@/lib/router";
import { useDeleteTrip, useTrips } from "./hooks";
import type { Trip } from "./api";

export function TripList() {
  const trips = useTrips();
  const vs = useVSList();
  const vols = useVolunteers("all");
  const cars = useCars();
  const del = useDeleteTrip();

  const vsName = (id: number) => vs.data?.find((v) => v.id === id)?.name ?? `VS ${id}`;
  const volName = (id: number) => {
    const v = vols.data?.find((x) => x.id === id);
    return v ? `${v.first_name} ${v.last_name}` : `Bénévole ${id}`;
  };
  const carName = (id: number) => cars.data?.find((c) => c.id === id)?.name ?? `Véhicule ${id}`;

  const byDay = new Map<number, Trip[]>();
  for (const t of trips.data ?? []) {
    const arr = byDay.get(t.day) ?? [];
    arr.push(t);
    byDay.set(t.day, arr);
  }
  const days = Array.from(byDay.keys()).sort((a, b) => a - b);

  return (
    <div className="grid gap-3" data-testid="trip-list">
      {trips.isLoading && <p className="text-sm">Chargement…</p>}
      {!trips.isLoading && days.length === 0 && (
        <p className="text-sm text-slate-600">Aucun trajet pour le moment.</p>
      )}
      {days.map((d) => (
        <section key={d} className="grid gap-1" data-day={d}>
          <h3 className="text-sm font-semibold">Jour {d}</h3>
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {(byDay.get(d) ?? []).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 p-3"
                data-trip-id={t.id}
              >
                <button onClick={() => navigate(`/trajets/${t.id}`)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium">
                    {volName(t.driver_id)} · {carName(t.car_id)}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {t.stops.map((s) => vsName(s.vs_id)).join(" → ")}
                  </div>
                </button>
                <button
                  onClick={() => {
                    if (confirm("Supprimer ce trajet ?")) del.mutate(t.id);
                  }}
                  className="shrink-0 text-xs text-red-700 hover:underline"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
