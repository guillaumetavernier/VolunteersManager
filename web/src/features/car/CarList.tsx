import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVolunteers } from "@/features/volunteer/hooks";
import { navigate } from "@/lib/router";
import { useCars, useCreateCar, useDeleteCar } from "./hooks";

interface CarListProps {
  onSelect?: (id: number) => void;
}

export function CarList({ onSelect }: CarListProps = {}) {
  const cars = useCars();
  const vols = useVolunteers("false");
  const create = useCreateCar();
  const del = useDeleteCar();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState(5);
  const [driverID, setDriverID] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  const drivers = (vols.data ?? []).filter((v) => v.can_drive);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        name: name.trim(),
        seats,
        default_driver_id: driverID === "" ? null : Number(driverID),
      });
      setName("");
      setSeats(5);
      setDriverID("");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Véhicules</h1>
      </header>
      <form onSubmit={onCreate} className="mb-6 grid grid-cols-[2fr_80px_1fr_auto] items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Nom</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nom du véhicule" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Places</span>
          <Input
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
            aria-label="Places"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Conducteur par défaut</span>
          <select
            className="input w-full"
            value={driverID}
            onChange={(e) => setDriverID(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Conducteur par défaut"
          >
            <option value="">— (aucun)</option>
            {drivers.map((v) => (
              <option key={v.id} value={v.id}>
                {v.first_name} {v.last_name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={create.isPending}>
          Ajouter
        </Button>
      </form>
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      {cars.isLoading && <p>Chargement…</p>}
      <ul className="divide-y divide-slate-200">
        {(cars.data ?? []).map((c) => {
          const driver = drivers.find((d) => d.id === c.default_driver_id);
          const open = () => {
            if (onSelect) onSelect(c.id);
            else navigate(`/ressources/vehicules/${c.id}`);
          };
          return (
            <li key={c.id} className="flex items-center justify-between py-3" data-car-id={c.id}>
              <button onClick={open} className="flex flex-col items-start text-left">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-slate-500">
                  {c.seats} places{driver ? ` · ${driver.first_name} ${driver.last_name}` : ""}
                </span>
              </button>
              <Button
                variant="link"
                size="sm"
                className="text-destructive"
                onClick={() => {
                  if (confirm(`Supprimer le véhicule "${c.name}" ?`)) del.mutate(c.id);
                }}
              >
                Supprimer
              </Button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
