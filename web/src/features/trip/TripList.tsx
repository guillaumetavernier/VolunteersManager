import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { useVSList } from "@/features/vs/hooks";
import { useVolunteers } from "@/features/volunteer/hooks";
import { useCars } from "@/features/car/hooks";
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
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Trajets</h1>
        <nav className="flex items-center gap-2 text-sm">
          <Button size="sm" onClick={() => navigate("/trips/new")}>
            Nouveau trajet
          </Button>
          <Button variant="link" size="sm" onClick={() => navigate("/travel-times")}>
            Matrice
          </Button>
          <Button variant="link" size="sm" onClick={() => navigate("/transport-needs")}>
            Besoins
          </Button>
        </nav>
      </header>
      {trips.isLoading && <p>Chargement…</p>}
      {!trips.isLoading && days.length === 0 && (
        <p className="text-sm text-slate-600">Aucun trajet pour le moment.</p>
      )}
      {days.map((d) => (
        <section key={d} className="mb-6" data-day={d}>
          <h2 className="mb-2 text-lg font-semibold">Jour {d}</h2>
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
            {(byDay.get(d) ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between p-3" data-trip-id={t.id}>
                <button
                  onClick={() => navigate(`/trips/${t.id}`)}
                  className="text-left"
                >
                  <div className="font-medium">
                    {volName(t.driver_id)} · {carName(t.car_id)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t.stops.map((s) => vsName(s.vs_id)).join(" → ")}
                  </div>
                </button>
                <button
                  onClick={() => {
                    if (confirm("Supprimer ce trajet ?")) del.mutate(t.id);
                  }}
                  className="text-sm text-red-700 hover:underline"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
