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

import { navigate } from "@/lib/router";
import { useVSList } from "@/features/vs/hooks";
import type { VS } from "@/features/vs/api";

import type { Race, RaceVSEntry } from "./api";

const RACES_PATH = "/races";
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
  if (race.isLoading) return <main className="p-6">Loading…</main>;
  if (race.error)
    return (
      <main className="p-6 text-sm text-red-700">
        Race not found.{" "}
        <button className="underline" onClick={() => (onBack ? onBack() : navigate(RACES_PATH))}>
          Back to list
        </button>
      </main>
    );
  if (!race.data) return null;
  return <Inner race={race.data} raceID={raceID} onBack={onBack} />;
}

function Inner({ race, raceID, onBack }: { race: Race; raceID: number; onBack?: () => void }) {
  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center justify-between">
        {onBack ? (
          <button onClick={onBack} className="text-sm text-slate-600 underline">
            ← Retour
          </button>
        ) : (
          <>
            <button onClick={() => navigate(RACES_PATH)} className="text-sm text-slate-600 underline">
              ← All races
            </button>
            <button onClick={() => navigate("/")} className="text-sm text-slate-600 underline">
              Map
            </button>
          </>
        )}
      </header>
      <RaceForm race={race} />
      <GPXSection raceID={raceID} />
      <VSListSection raceID={raceID} />
    </main>
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
    <form onSubmit={onSubmit} className="mb-8 grid gap-4 rounded-md border border-slate-200 p-4">
      <h2 className="text-lg font-semibold">Race settings</h2>
      <div className="grid grid-cols-2 gap-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Color</span>
          <input
            className="input"
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
          />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Front pace (km/h)</span>
          <input
            className="input"
            type="number"
            step="0.1"
            value={form.front_pace}
            onChange={(e) => setForm({ ...form, front_pace: Number(e.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Tail pace (km/h)</span>
          <input
            className="input"
            type="number"
            step="0.1"
            value={form.tail_pace}
            onChange={(e) => setForm({ ...form, tail_pace: Number(e.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Start time</span>
          <input
            className="input"
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
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={patch.isPending}
        >
          Save
        </button>
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
    <section className="mb-8 grid gap-3 rounded-md border border-slate-200 p-4">
      <h2 className="text-lg font-semibold">GPX files</h2>
      <div className="flex items-center gap-2">
        <input ref={fileRef} type="file" accept=".gpx,application/gpx+xml,application/xml" className="text-sm" />
        <label className="text-sm text-slate-600">
          Day&nbsp;
          <input className="input w-16" type="number" min={1} value={day} onChange={(e) => setDay(e.target.value)} />
        </label>
        <button
          onClick={onUpload}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={upload.isPending}
        >
          {upload.isPending ? "Uploading…" : "Upload"}
        </button>
        {upload.isError && (
          <span role="alert" className="text-sm text-red-600">
            {(upload.error as Error).message}
          </span>
        )}
      </div>
      {gpx.data && gpx.data.length === 0 && <p className="text-sm text-slate-500">No GPX uploaded yet.</p>}
      <ul className="divide-y divide-slate-200 text-sm">
        {gpx.data?.map((g) => (
          <li key={g.id} className="flex items-center justify-between py-2">
            <span>
              <code>{g.file_path.split("/").pop()}</code>
              {" — "}
              {(g.total_distance_m / 1000).toFixed(2)} km
              {g.day != null && ` · day ${g.day}`}
            </span>
            <button onClick={() => del.mutate(g.id)} className="text-red-700 hover:underline">
              Delete
            </button>
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
    <section className="grid gap-3 rounded-md border border-slate-200 p-4">
      <h2 className="text-lg font-semibold">Volunteer spots along the race</h2>
      {data.length === 0 && (
        <p className="text-sm text-slate-500">No VS yet. Add one from the picker below.</p>
      )}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={data.map((e) => e.vs_id)} strategy={verticalListSortingStrategy}>
          <ul className="grid gap-2">
            {data.map((entry) => (
              <SortableRow
                key={entry.vs_id}
                entry={entry}
                vsName={vsByID.get(entry.vs_id)?.name ?? `VS ${entry.vs_id}`}
                raceID={raceID}
                onRemove={() => removeVS(entry.vs_id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {candidates.length > 0 && (
        <div className="flex items-center gap-2 border-t border-slate-100 pt-3 text-sm">
          <span>Add VS:</span>
          <select className="input" defaultValue="" onChange={(e) => e.target.value && addVS(Number(e.target.value))}>
            <option value="" disabled>
              Pick a VS…
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
      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-slate-200 bg-white p-3"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-slate-400 hover:text-slate-700"
        aria-label={`Drag ${vsName}`}
      >
        ⋮⋮
      </button>
      <div className="grid gap-1">
        <div className="font-medium">
          #{entry.sequence + 1} · {vsName}
          {entry.projected_dist_m != null && (
            <span className="ml-2 text-xs text-slate-500">
              km {(entry.projected_dist_m / 1000).toFixed(2)}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <TimeEditor
            label="first-in"
            auto={entry.auto_first_in}
            manual={entry.manual_first_in}
            onSet={(v) => override.mutate({ vsID: entry.vs_id, patch: { manual_first_in: v } })}
            onClear={() => clear.mutate({ vsID: entry.vs_id, fields: { first: true } })}
          />
          <TimeEditor
            label="last-in"
            auto={entry.auto_last_in}
            manual={entry.manual_last_in}
            onSet={(v) => override.mutate({ vsID: entry.vs_id, patch: { manual_last_in: v } })}
            onClear={() => clear.mutate({ vsID: entry.vs_id, fields: { last: true } })}
          />
        </div>
      </div>
      <button onClick={onRemove} className="text-sm text-red-700 hover:underline">
        Remove
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
    <div className="grid gap-1">
      <span className="text-slate-500">
        {label} {manual ? "(override)" : "(auto)"}
      </span>
      <div className="flex items-center gap-1">
        <input
          className="input text-xs"
          type="datetime-local"
          value={effective ? effective.slice(0, 16) : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return;
            onSet(new Date(v).toISOString());
          }}
        />
        {manual && (
          <button onClick={onClear} className="text-xs text-slate-500 underline">
            reset
          </button>
        )}
      </div>
    </div>
  );
}
