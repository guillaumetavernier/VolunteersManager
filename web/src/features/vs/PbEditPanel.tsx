import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";

import {
  useCreateVS,
  useDeleteVS,
  usePatchVS,
  useUploadVSPhoto,
} from "./hooks";
import type { VS } from "./api";

export interface DraftVS {
  id: number | null; // null => create
  name: string;
  lat: number;
  lon: number;
  notes: string;
  what3words: string;
  photo_path: string | null;
}

export function makeDraft(v?: VS | null, fallback?: { lat: number; lon: number }): DraftVS {
  return {
    id: v?.id ?? null,
    name: v?.name ?? "",
    lat: v?.lat ?? fallback?.lat ?? 0,
    lon: v?.lon ?? fallback?.lon ?? 0,
    notes: v?.notes ?? "",
    what3words: v?.what3words ?? "",
    photo_path: v?.photo_path ?? null,
  };
}

interface Props {
  draft: DraftVS;
  onClose: () => void;
  onOpenMissions?: (v: VS) => void;
}

export function PbEditPanel({ draft, onClose, onOpenMissions }: Props) {
  const [form, setForm] = useState<DraftVS>(draft);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeps, setPendingDeps] = useState<{ missions: number; assignments: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Re-sync when the parent swaps to a different VS without unmounting.
  useEffect(() => setForm(draft), [draft]);

  const create = useCreateVS();
  const patch = usePatchVS();
  const del = useDeleteVS();
  const upload = useUploadVSPhoto();

  const isNew = form.id == null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (isNew) {
        const created = await create.mutateAsync({
          name: form.name,
          lat: form.lat,
          lon: form.lon,
          notes: form.notes || null,
          what3words: form.what3words || null,
        });
        if (fileRef.current?.files?.[0]) {
          await upload.mutateAsync({ id: created.id, file: fileRef.current.files[0] });
        }
      } else {
        await patch.mutateAsync({
          id: form.id!,
          patch: {
            name: form.name,
            lat: form.lat,
            lon: form.lon,
            notes: form.notes || null,
            what3words: form.what3words || null,
          },
        });
        if (fileRef.current?.files?.[0]) {
          await upload.mutateAsync({ id: form.id!, file: fileRef.current.files[0] });
        }
      }
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function attemptDelete(force: boolean) {
    if (form.id == null) return;
    try {
      await del.mutateAsync({ id: form.id, force });
      setPendingDeps(null);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const body = err.body as { dependents?: { missions: number; assignments: number } } | null;
        if (body?.dependents) {
          setPendingDeps(body.dependents);
          return;
        }
      }
      setError((err as Error).message);
    }
  }

  async function onDelete() {
    if (form.id == null) return;
    if (!confirm(`Supprimer le PB «${form.name}» ?`)) return;
    await attemptDelete(false);
  }

  return (
    <aside
      className="fixed right-0 top-0 z-20 flex h-full w-96 flex-col gap-4 overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-lg"
      aria-label={isNew ? "Créer un PB" : `Modifier le PB ${form.name}`}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isNew ? "Nouveau point bénévole" : form.name}</h2>
        <button onClick={onClose} className="text-slate-500 hover:text-slate-800" aria-label="Fermer">
          ×
        </button>
      </header>
      {!isNew && onOpenMissions && (
        <button
          type="button"
          onClick={() =>
            onOpenMissions({
              id: form.id!,
              name: form.name,
              lat: form.lat,
              lon: form.lon,
              notes: form.notes || null,
              photo_path: form.photo_path,
              what3words: form.what3words || null,
              created_at: "",
              updated_at: "",
            })
          }
          className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          data-action="open-missions"
        >
          Missions à ce PB
        </button>
      )}
      <form className="grid gap-3" onSubmit={onSubmit}>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Nom</span>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Latitude</span>
            <Input
              type="number"
              step="0.000001"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Longitude</span>
            <Input
              type="number"
              step="0.000001"
              value={form.lon}
              onChange={(e) => setForm({ ...form, lon: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Notes</span>
          <Textarea
            className="min-h-24"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">what3words</span>
          <Input
            value={form.what3words}
            onChange={(e) => setForm({ ...form, what3words: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Photo</span>
          <input ref={fileRef} aria-label="Photo" className="text-sm" type="file" accept="image/jpeg,image/png" />
        </label>
        {form.photo_path && (
          <img
            src={form.photo_path}
            alt={`${form.name} photo`}
            className="max-h-48 w-full rounded-md object-cover"
          />
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          {!isNew && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              className="text-red-700 hover:bg-red-50 hover:text-red-700"
            >
              Supprimer
            </Button>
          )}
          <Button
            type="submit"
            disabled={create.isPending || patch.isPending}
          >
            {isNew ? "Créer" : "Enregistrer"}
          </Button>
        </div>
      </form>
      {pendingDeps && (
        <div
          role="dialog"
          aria-label="Confirmer la suppression"
          data-cascade-confirm
          className="fixed inset-0 z-30 grid place-items-center bg-black/40 p-4"
        >
          <div className="grid w-full max-w-md gap-3 rounded-md bg-white p-4 shadow-xl">
            <h3 className="text-lg font-semibold">Supprimer ce PB ?</h3>
            <p className="text-sm text-slate-700">
              Ce PB a {pendingDeps.missions} mission{pendingDeps.missions === 1 ? "" : "s"} et
              {" "}{pendingDeps.assignments} affectation{pendingDeps.assignments === 1 ? "" : "s"}.
              Tout sera supprimé en cascade.
            </p>
            <div className="flex items-center justify-end gap-3">
              <Button
                variant="link"
                onClick={() => setPendingDeps(null)}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={() => attemptDelete(true)}
                data-action="confirm-cascade-delete"
              >
                Tout supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
