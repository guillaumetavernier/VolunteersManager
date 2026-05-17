import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVSList } from "@/features/vs/hooks";
import type { VS } from "@/features/vs/api";
import { TrialCard } from "@/features/trial/TrialCard";
import { useTrials, useCreateTrial, useReorderTrials } from "@/features/trial/hooks";

import type { Race, RaceVSEntry } from "./api";
import { usePatchRace, useRace, useRaceVS, useReplaceRaceVS } from "./hooks";

interface Props {
  raceID: number;
  onBack?: () => void;
}

export function RaceDetail({ raceID, onBack }: Props) {
  const race = useRace(raceID);
  if (race.isLoading) return <div className="p-4 text-sm">Chargement…</div>;
  if (race.error)
    return (
      <div className="p-4 text-sm text-red-700">
        Course introuvable.{" "}
        {onBack && (
          <button className="underline" onClick={onBack}>
            Retour
          </button>
        )}
      </div>
    );
  if (!race.data) return null;
  return <Inner race={race.data} raceID={raceID} />;
}

function Inner({ race, raceID }: { race: Race; raceID: number }) {
  return (
    <div className="grid min-w-0 gap-3 p-3">
      <RaceForm race={race} />
      <TrialsSection raceID={raceID} />
      <VSListSection raceID={raceID} />
    </div>
  );
}

function RaceForm({ race }: { race: Race }) {
  const patch = usePatchRace(race.id);
  const [form, setForm] = useState({ name: race.name, color: race.color });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    patch.mutate({ name: form.name, color: form.color });
  }

  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-3">
      <h2 className="text-lg font-semibold">Paramètres de la course</h2>
      <label className="grid min-w-0 gap-1 text-sm">
        <span className="font-medium">Nom</span>
        <div className="flex min-w-0 items-center gap-2">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="color"
            aria-label="Couleur"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
          />
        </div>
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={patch.isPending}>
          Enregistrer
        </Button>
        {patch.isError && (
          <span role="alert" className="text-sm text-red-600">
            {(patch.error as Error).message}
          </span>
        )}
      </div>
    </form>
  );
}

function TrialsSection({ raceID }: { raceID: number }) {
  const trials = useTrials(raceID);
  const create = useCreateTrial(raceID);
  const reorder = useReorderTrials(raceID);

  const sensors = useSensors(useSensor(PointerSensor));
  const data = trials.data ?? [];

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = data.map((t) => t.id);
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(data, from, to);
    reorder.mutate(next.map((t, i) => ({ trial_id: t.id, sequence: i })));
  }

  function addTrial() {
    create.mutate({
      name: `Épreuve ${data.length + 1}`,
      sequence: data.length,
      front_pace: 12,
      tail_pace: 5,
    });
  }

  return (
    <section className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-3">
      <h2 className="text-lg font-semibold">Épreuves</h2>
      {data.length === 0 && (
        <p className="text-sm text-slate-500">Aucune épreuve. Ajoutez-en une pour définir les allures et GPX.</p>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={data.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <ul className="grid min-w-0 gap-2">
            {data.map((tr) => (
              <TrialCard key={tr.id} trial={tr} raceID={raceID} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <Button size="sm" onClick={addTrial} disabled={create.isPending} className="justify-self-start">
        {create.isPending ? "Ajout…" : "Ajouter une épreuve"}
      </Button>
    </section>
  );
}

function VSListSection({ raceID }: { raceID: number }) {
  const entries = useRaceVS(raceID);
  const allVS = useVSList();
  const replace = useReplaceRaceVS(raceID);

  const data = entries.data ?? [];
  const vsByID = useMemo(() => {
    const m = new Map<number, VS>();
    for (const v of allVS.data ?? []) m.set(v.id, v);
    return m;
  }, [allVS.data]);

  const sensors = useSensors(useSensor(PointerSensor));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = data.map((x) => x.vs_id);
    const from = ids.indexOf(Number(active.id));
    const to = ids.indexOf(Number(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    replace.mutate(next.map((vs_id, sequence) => ({ vs_id, sequence })));
  }

  function addVS(vsID: number) {
    if (data.find((e) => e.vs_id === vsID)) return;
    const ids = [...data.map((x) => x.vs_id), vsID];
    replace.mutate(ids.map((vs_id, sequence) => ({ vs_id, sequence })));
  }

  function removeVS(vsID: number) {
    const ids = data.map((x) => x.vs_id).filter((id) => id !== vsID);
    replace.mutate(ids.map((vs_id, sequence) => ({ vs_id, sequence })));
  }

  const candidates = (allVS.data ?? []).filter((v) => !data.find((e) => e.vs_id === v.id));

  return (
    <section className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-3">
      <h2 className="text-lg font-semibold">Points bénévoles le long de la course</h2>
      {data.length === 0 && (
        <p className="text-sm text-slate-500">Aucun PB. Ajoutez-en un via le sélecteur ci-dessous.</p>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={data.map((e) => e.vs_id)} strategy={verticalListSortingStrategy}>
          <ul className="grid gap-2">
            {data.map((entry) => (
              <SortableVSRow
                key={entry.vs_id}
                entry={entry}
                vsName={vsByID.get(entry.vs_id)?.name ?? `PB ${entry.vs_id}`}
                onRemove={() => removeVS(entry.vs_id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {candidates.length > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
          <span>Ajouter un PB :</span>
          <select className="input w-full" defaultValue="" onChange={(e) => e.target.value && addVS(Number(e.target.value))}>
            <option value="" disabled>
              Choisir un PB…
            </option>
            {candidates.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  );
}

function SortableVSRow({
  entry,
  vsName,
  onRemove,
}: {
  entry: RaceVSEntry;
  vsName: string;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.vs_id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

  const effFirst = entry.earliest_first_in;
  const effLast = entry.latest_last_in;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-slate-200 bg-white p-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 hover:text-slate-700"
        aria-label={`Déplacer ${vsName}`}
      >
        ⋮⋮
      </button>
      <div className="grid min-w-0 gap-0.5">
        <div className="min-w-0 truncate font-medium text-sm">
          #{entry.sequence + 1} · {vsName}
        </div>
        <div className="flex gap-3 text-xs text-slate-500">
          {effFirst && <span>1er passage : {effFirst.slice(11, 16)}</span>}
          {effLast && <span>dernier : {effLast.slice(11, 16)}</span>}
        </div>
      </div>
      <button onClick={onRemove} className="text-sm text-red-700 hover:underline">
        Retirer
      </button>
    </li>
  );
}
