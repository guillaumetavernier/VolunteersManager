import { useEffect, useMemo, useRef, useState } from "react";
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

import type { Race, RaceVSEntry } from "./api";

import {
  useDeleteRaceGPX,
  useOverrideRaceVSTimes,
  useClearRaceVSManual,
  usePatchRace,
  useRace,
  useRaceGPX,
  useRaceVS,
  useReplaceRaceVS,
  useUploadRaceGPX,
} from "./hooks";

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
      <GPXSection raceID={raceID} />
      <VSListSection raceID={raceID} />
    </div>
  );
}

function RaceForm({ race }: { race: Race }) {
  const patch = usePatchRace(race.id);
  const [form, setForm] = useState({
    name: race.name,
    color: race.color,
    front_pace: race.front_pace,
    tail_pace: race.tail_pace,
    start_time: race.start_time ?? "",
  });

  useEffect(() => {
    setForm({
      name: race.name,
      color: race.color,
      front_pace: race.front_pace,
      tail_pace: race.tail_pace,
      start_time: race.start_time ?? "",
    });
  }, [race.id, race.name, race.color, race.front_pace, race.tail_pace, race.start_time]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    patch.mutate({
      name: form.name,
      color: form.color,
      front_pace: form.front_pace,
      tail_pace: form.tail_pace,
      start_time: form.start_time || null,
    });
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
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="font-medium">Allure tête (km/h)</span>
          <Input
            type="number"
            step="0.1"
            value={form.front_pace}
            onChange={(e) => setForm({ ...form, front_pace: Number(e.target.value) })}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          <span className="font-medium">Allure queue (km/h)</span>
          <Input
            type="number"
            step="0.1"
            value={form.tail_pace}
            onChange={(e) => setForm({ ...form, tail_pace: Number(e.target.value) })}
          />
        </label>
      </div>
      <label className="grid min-w-0 gap-1 text-sm">
        <span className="font-medium">Heure de départ</span>
        <Input
          type="datetime-local"
          value={form.start_time.slice(0, 16)}
          onChange={(e) =>
            setForm({
              ...form,
              start_time: e.target.value ? new Date(e.target.value).toISOString() : "",
            })
          }
        />
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

function GPXSection({ raceID }: { raceID: number }) {
  const gpx = useRaceGPX(raceID);
  const upload = useUploadRaceGPX(raceID);
  const del = useDeleteRaceGPX(raceID);
  const fileRef = useRef<HTMLInputElement>(null);
  const [day, setDay] = useState<string>("");

  async function onUpload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    await upload.mutateAsync({ file: f, day: day ? Number(day) : null });
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <section className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-3">
      <h2 className="text-lg font-semibold">Fichiers GPX</h2>
      <div className="grid min-w-0 gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".gpx,application/gpx+xml,application/xml"
          className="block w-full text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center text-sm text-slate-600">
            Jour&nbsp;
            <Input className="w-16" type="number" min={1} value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
          <Button onClick={onUpload} size="sm" disabled={upload.isPending}>
            {upload.isPending ? "Envoi…" : "Téléverser"}
          </Button>
        </div>
        {upload.isError && (
          <span role="alert" className="text-sm text-red-600">
            {(upload.error as Error).message}
          </span>
        )}
      </div>
      {gpx.data && gpx.data.length === 0 && <p className="text-sm text-slate-500">Aucun GPX importé pour l'instant.</p>}
      <ul className="grid min-w-0 divide-y divide-slate-200 text-sm">
        {gpx.data?.map((g) => (
          <li key={g.id} className="grid min-w-0 gap-1 py-2">
            <code
              className="block min-w-0 truncate text-xs text-slate-700"
              title={g.file_path.split("/").pop()}
            >
              {g.file_path.split("/").pop()}
            </code>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-slate-500">
                {(g.total_distance_m / 1000).toFixed(2)} km
                {g.day != null && ` · jour ${g.day}`}
              </span>
              <button
                onClick={() => del.mutate(g.id)}
                className="shrink-0 text-xs text-red-700 hover:underline"
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
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
        <p className="text-sm text-slate-500">Aucun PB pour l'instant. Ajoutez-en un via le sélecteur ci-dessous.</p>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={data.map((e) => e.vs_id)} strategy={verticalListSortingStrategy}>
          <ul className="grid gap-2">
            {data.map((entry) => (
              <SortableRow
                key={entry.vs_id}
                entry={entry}
                vsName={vsByID.get(entry.vs_id)?.name ?? `PB ${entry.vs_id}`}
                raceID={raceID}
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

function SortableRow({
  entry,
  vsName,
  raceID,
  onRemove,
}: {
  entry: RaceVSEntry;
  vsName: string;
  raceID: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.vs_id,
  });
  const override = useOverrideRaceVSTimes(raceID);
  const clear = useClearRaceVSManual(raceID);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
  };

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
      <div className="grid min-w-0 gap-1">
        <div className="min-w-0 truncate font-medium">
          #{entry.sequence + 1} · {vsName}
          {entry.projected_dist_m != null && (
            <span className="ml-2 text-xs text-slate-500">
              km {(entry.projected_dist_m / 1000).toFixed(2)}
            </span>
          )}
        </div>
        <div className="grid gap-2 text-xs">
          <TimeEditor
            label="premier passage"
            auto={entry.auto_first_in}
            manual={entry.manual_first_in}
            onSet={(v) => override.mutate({ vsID: entry.vs_id, patch: { manual_first_in: v } })}
            onClear={() => clear.mutate({ vsID: entry.vs_id, fields: { first: true } })}
          />
          <TimeEditor
            label="dernier passage"
            auto={entry.auto_last_in}
            manual={entry.manual_last_in}
            onSet={(v) => override.mutate({ vsID: entry.vs_id, patch: { manual_last_in: v } })}
            onClear={() => clear.mutate({ vsID: entry.vs_id, fields: { last: true } })}
          />
        </div>
      </div>
      <button onClick={onRemove} className="text-sm text-red-700 hover:underline">
        Retirer
      </button>
    </li>
  );
}

function TimeEditor({
  label,
  auto,
  manual,
  onSet,
  onClear,
}: {
  label: string;
  auto: string | null;
  manual: string | null;
  onSet: (iso: string) => void;
  onClear: () => void;
}) {
  const effective = manual ?? auto;
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-slate-500">
        {label} {manual ? "(manuel)" : "(auto)"}
      </span>
      <Input
        className="text-xs"
        type="datetime-local"
        value={effective ? effective.slice(0, 16) : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          onSet(new Date(v).toISOString());
        }}
      />
      {manual && (
        <button onClick={onClear} className="justify-self-start text-xs text-slate-500 underline">
          réinitialiser
        </button>
      )}
    </div>
  );
}
