import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useVolunteers } from "@/features/volunteer/hooks";

import { useCar, usePatchCar } from "./hooks";

interface CarDetailProps {
  id: number;
  onBack?: () => void;
}

export function CarDetail({ id, onBack }: CarDetailProps) {
  const q = useCar(id);
  const vols = useVolunteers("false");
  const patch = usePatchCar(id);

  const [name, setName] = useState("");
  const [seats, setSeats] = useState(5);
  const [driverID, setDriverID] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setSeats(q.data.seats);
      setDriverID(q.data.default_driver_id ?? "");
      setNotes(q.data.notes ?? "");
    }
  }, [q.data]);

  if (q.isLoading) return <main className="p-6">Chargement…</main>;
  if (!q.data)
    return (
      <main className="p-6 text-sm text-red-700">
        Véhicule introuvable.{" "}
        {onBack && (
          <Button variant="link" size="sm" onClick={onBack}>
            Retour
          </Button>
        )}
      </main>
    );

  const drivers = (vols.data ?? []).filter((v) => v.can_drive);
  const driver = drivers.find((d) => d.id === q.data!.default_driver_id);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await patch.mutateAsync({
        name: name.trim(),
        seats,
        default_driver_id: driverID === "" ? null : Number(driverID),
        notes: notes.trim() === "" ? null : notes,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6" data-car-id={id}>
      <h1 className="mb-1 text-2xl font-semibold">{q.data.name}</h1>
      <p className="mb-6 text-sm text-slate-600">
        {q.data.seats} places{driver ? ` · ${driver.first_name} ${driver.last_name}` : ""}
      </p>
      <form onSubmit={onSave} className="grid gap-4">
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
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Notes</span>
          <Textarea
            className="min-h-20"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            aria-label="Notes"
          />
        </label>
        <div className="flex items-center justify-end gap-3">
          {onBack && (
            <Button type="button" variant="link" onClick={onBack}>
              Retour
            </Button>
          )}
          <Button type="submit" disabled={patch.isPending}>
            Enregistrer
          </Button>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
