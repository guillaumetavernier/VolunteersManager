import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { navigate } from "@/lib/router";
import { useCreateRace, useDeleteRace, useRaces } from "./hooks";

interface RaceListProps {
  onSelect?: (id: number) => void;
}

export function RaceList({ onSelect }: RaceListProps = {}) {
  const races = useRaces();
  const create = useCreateRace();
  const del = useDeleteRace();
  const [name, setName] = useState("");

  function goToRace(id: number) {
    if (onSelect) onSelect(id);
    else navigate(`/races/${id}`);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const r = await create.mutateAsync({ name: name.trim() });
      setName("");
      goToRace(r.id);
    } catch {
      // Surfaced by mutation error below.
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Courses</h1>
      </header>
      <form onSubmit={onCreate} className="mb-6 flex gap-2">
        <Input
          className="flex-1"
          placeholder="Nom de la nouvelle course"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Ajouter une course
        </Button>
      </form>
      {create.isError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {(create.error as Error).message}
        </p>
      )}
      {races.isLoading && <p>Chargement…</p>}
      {races.data && races.data.length === 0 && (
        <p className="text-sm text-slate-600">Aucune course pour l'instant. Ajoutez la première ci-dessus.</p>
      )}
      <ul className="divide-y divide-slate-200">
        {races.data?.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-3">
            <button
              onClick={() => goToRace(r.id)}
              className="flex items-center gap-3 text-left"
            >
              <span
                className="h-4 w-4 rounded-full border border-slate-300"
                style={{ backgroundColor: r.color }}
                aria-label={`couleur ${r.color}`}
              />
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-slate-500">
                tête {r.front_pace} km/h · queue {r.tail_pace} km/h
              </span>
            </button>
            <button
              onClick={() => {
                if (confirm(`Supprimer la course "${r.name}" ?`)) del.mutate(r.id);
              }}
              className="text-sm text-red-700 hover:underline"
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
