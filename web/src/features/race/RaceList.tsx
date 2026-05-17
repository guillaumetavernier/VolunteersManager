import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    onSelect?.(id);
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
    <div className="grid gap-3">
      <form onSubmit={onCreate} className="flex gap-2">
        <Input
          className="flex-1"
          placeholder="Nom de la nouvelle course"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={create.isPending}>
          Ajouter
        </Button>
      </form>
      {create.isError && (
        <p role="alert" className="text-sm text-red-600">
          {(create.error as Error).message}
        </p>
      )}
      {races.isLoading && <p className="text-sm">Chargement…</p>}
      {races.data && races.data.length === 0 && (
        <p className="text-sm text-slate-600">Aucune course pour l'instant.</p>
      )}
      <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
        {races.data?.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 p-2 text-sm">
            <button
              onClick={() => goToRace(r.id)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              data-race-row={r.id}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-slate-300"
                style={{ backgroundColor: r.color }}
                aria-label={`couleur ${r.color}`}
              />
              <span className="truncate font-medium">{r.name}</span>
            </button>
            <button
              onClick={() => {
                if (confirm(`Supprimer la course "${r.name}" ?`)) del.mutate(r.id);
              }}
              className="shrink-0 text-xs text-red-700 hover:underline"
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
