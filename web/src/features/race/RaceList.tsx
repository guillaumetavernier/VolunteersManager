import { useState } from "react";

import { navigate } from "@/lib/router";
import { useCreateRace, useDeleteRace, useRaces } from "./hooks";

export function RaceList() {
  const races = useRaces();
  const create = useCreateRace();
  const del = useDeleteRace();
  const [name, setName] = useState("");

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const r = await create.mutateAsync({ name: name.trim() });
      setName("");
      navigate(`/races/${r.id}`);
    } catch {
      // Surfaced by mutation error below.
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Races</h1>
        <button onClick={() => navigate("/")} className="text-sm text-slate-600 underline">
          Back to map
        </button>
      </header>
      <form onSubmit={onCreate} className="mb-6 flex gap-2">
        <input
          className="input flex-1"
          placeholder="New race name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-2 text-white" disabled={create.isPending}>
          Add race
        </button>
      </form>
      {create.isError && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {(create.error as Error).message}
        </p>
      )}
      {races.isLoading && <p>Loading…</p>}
      {races.data && races.data.length === 0 && (
        <p className="text-sm text-slate-600">No races yet. Add the first one above.</p>
      )}
      <ul className="divide-y divide-slate-200">
        {races.data?.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-3">
            <button
              onClick={() => navigate(`/races/${r.id}`)}
              className="flex items-center gap-3 text-left"
            >
              <span
                className="h-4 w-4 rounded-full border border-slate-300"
                style={{ backgroundColor: r.color }}
                aria-label={`color ${r.color}`}
              />
              <span className="font-medium">{r.name}</span>
              <span className="text-xs text-slate-500">
                front {r.front_pace} km/h · tail {r.tail_pace} km/h
              </span>
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete race "${r.name}"?`)) del.mutate(r.id);
              }}
              className="text-sm text-red-700 hover:underline"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
