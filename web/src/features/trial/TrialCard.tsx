import { useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVSList } from "@/features/vs/hooks";

import type { Trial, TrialVS } from "./api";
import {
  useDeleteTrial,
  useDeleteTrialGPX,
  usePatchTrial,
  usePutTrialVS,
  useTrialGPX,
  useTrialVS,
  useUploadTrialGPX,
} from "./hooks";

interface Props {
  trial: Trial;
  raceID: number;
}

export function TrialCard({ trial, raceID }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: trial.id });
  const [expanded, setExpanded] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className="rounded-md border border-slate-200 bg-white">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 p-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-slate-400 hover:text-slate-700"
          aria-label={`Déplacer épreuve ${trial.name}`}
        >
          ⋮⋮
        </button>
        <span className="min-w-0 truncate font-medium text-sm">
          #{trial.sequence + 1} · {trial.name}
        </span>
        <button
          className="text-xs text-slate-500 hover:text-slate-800"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Réduire" : "Modifier"}
        </button>
      </div>
      {expanded && <TrialForm trial={trial} raceID={raceID} />}
    </li>
  );
}

function TrialForm({ trial, raceID }: Props) {
  const patch = usePatchTrial(raceID);
  const del = useDeleteTrial(raceID);
  const gpx = useTrialGPX(trial.id);
  const upload = useUploadTrialGPX(raceID, trial.id);
  const delGPX = useDeleteTrialGPX(raceID, trial.id);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: trial.name,
    start_time: trial.start_time ?? "",
    front_pace: trial.front_pace,
    tail_pace: trial.tail_pace,
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    patch.mutate({
      id: trial.id,
      patch: {
        name: form.name,
        start_time: form.start_time || null,
        front_pace: form.front_pace,
        tail_pace: form.tail_pace,
      },
    });
  }

  async function onUpload() {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    await upload.mutateAsync(f);
    if (fileRef.current) fileRef.current.value = "";
  }

  const currentGPX = gpx.data?.[0];

  return (
    <div className="grid gap-3 border-t border-slate-100 p-3">
      <form onSubmit={onSubmit} className="grid gap-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Nom</span>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm">
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
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Allure tête (km/h)</span>
            <Input
              type="number"
              step="0.1"
              value={form.front_pace}
              onChange={(e) => setForm({ ...form, front_pace: Number(e.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Allure queue (km/h)</span>
            <Input
              type="number"
              step="0.1"
              value={form.tail_pace}
              onChange={(e) => setForm({ ...form, tail_pace: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={patch.isPending}>
            Enregistrer
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={del.isPending}
            onClick={() => del.mutate(trial.id)}
          >
            Supprimer l'épreuve
          </Button>
        </div>
      </form>

      <section className="grid gap-2">
        <h4 className="text-sm font-medium">Fichier GPX</h4>
        {currentGPX ? (
          <div className="flex items-center gap-2 text-sm">
            <code className="min-w-0 truncate text-xs text-slate-600">
              {currentGPX.file_path.split("/").pop()}
            </code>
            <span className="text-xs text-slate-500">
              {(currentGPX.total_distance_m / 1000).toFixed(2)} km
            </span>
            <button
              onClick={() => delGPX.mutate(currentGPX.id)}
              className="ml-auto shrink-0 text-xs text-red-700 hover:underline"
            >
              Supprimer
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Aucun GPX pour cette épreuve.</p>
        )}
        {!currentGPX && (
          <div className="grid gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".gpx,application/gpx+xml,application/xml"
              className="block w-full text-sm"
            />
            <Button size="sm" onClick={onUpload} disabled={upload.isPending} className="justify-self-start">
              {upload.isPending ? "Envoi…" : "Téléverser GPX"}
            </Button>
          </div>
        )}
      </section>

      <TrialVSChips trialID={trial.id} raceID={raceID} />
    </div>
  );
}

function TrialVSChips({ trialID, raceID }: { trialID: number; raceID: number }) {
  const trialVS = useTrialVS(trialID);
  const allVS = useVSList();
  const putTV = usePutTrialVS(raceID, trialID);

  const vsById = new Map((allVS.data ?? []).map((v) => [v.id, v]));

  if (!trialVS.data || trialVS.data.length === 0) {
    return <p className="text-xs text-slate-400">Aucun PB projeté sur cette épreuve.</p>;
  }

  return (
    <section className="grid gap-1">
      <h4 className="text-sm font-medium">Points bénévoles</h4>
      <ul className="grid gap-1">
        {trialVS.data.map((tv) => (
          <TrialVSChip key={tv.id} tv={tv} vsName={vsById.get(tv.vs_id)?.name ?? `PB ${tv.vs_id}`} onPut={putTV.mutate} />
        ))}
      </ul>
    </section>
  );
}

function sourceLabel(src: TrialVS["source"]): string {
  switch (src) {
    case "auto": return "auto";
    case "manual_include": return "inclus";
    case "manual_exclude": return "exclu";
  }
}

function nextSource(src: TrialVS["source"]): TrialVS["source"] {
  switch (src) {
    case "auto": return "manual_include";
    case "manual_include": return "manual_exclude";
    case "manual_exclude": return "auto";
  }
}

function TrialVSChip({
  tv,
  vsName,
  onPut,
}: {
  tv: TrialVS;
  vsName: string;
  onPut: (args: { id: number; patch: { source?: TrialVS["source"] } }) => void;
}) {
  const effFirst = tv.manual_first_in ?? tv.auto_first_in;
  const effLast = tv.manual_last_in ?? tv.auto_last_in;

  const srcColor =
    tv.source === "auto"
      ? "bg-emerald-100 text-emerald-800"
      : tv.source === "manual_include"
        ? "bg-blue-100 text-blue-800"
        : "bg-red-100 text-red-700";

  return (
    <li className="flex items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate font-medium">{vsName}</span>
      {tv.dist_in_trial_m != null && (
        <span className="text-slate-400">km {(tv.dist_in_trial_m / 1000).toFixed(2)}</span>
      )}
      {effFirst && (
        <span className="text-slate-500">{effFirst.slice(11, 16)}</span>
      )}
      {effLast && effLast !== effFirst && (
        <span className="text-slate-400">→ {effLast.slice(11, 16)}</span>
      )}
      <button
        className={`rounded px-1 py-0.5 text-xs font-medium ${srcColor}`}
        onClick={() => onPut({ id: tv.id, patch: { source: nextSource(tv.source) } })}
        title={`Source: ${tv.source} — cliquer pour basculer`}
      >
        {sourceLabel(tv.source)}
      </button>
    </li>
  );
}
