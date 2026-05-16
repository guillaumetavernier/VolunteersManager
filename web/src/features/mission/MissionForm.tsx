import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useRoleTypes } from "@/features/volunteer/hooks";
import { useRaces } from "@/features/race/hooks";
import { useCreateMission, usePatchMission } from "./hooks";
import type { Mission } from "./api";

const schema = z.object({
  day: z.coerce.number().int().min(1, "Jour requis"),
  start_time: z.string().min(1, "Heure de début requise"),
  end_time: z.string().min(1, "Heure de fin requise"),
  role_type: z.string().min(1, "Rôle requis"),
  headcount: z.coerce.number().int().min(1, "Au moins 1"),
  title: z.string().optional(),
  description: z.string().optional(),
  tagged_race_ids: z.array(z.number()).default([]),
});

type Values = z.infer<typeof schema>;

interface Props {
  vsID: number;
  existing?: Mission | null;
  onSaved?: () => void;
  onCancel?: () => void;
}

export function MissionForm({ vsID, existing, onSaved, onCancel }: Props) {
  const roleTypes = useRoleTypes();
  const races = useRaces();
  const create = useCreateMission(vsID);
  const patch = usePatchMission(existing?.id ?? 0);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      day: existing?.day ?? 1,
      start_time: existing?.start_time ?? "",
      end_time: existing?.end_time ?? "",
      role_type: existing?.role_type ?? "",
      headcount: existing?.headcount ?? 1,
      title: existing?.title ?? "",
      description: existing?.description ?? "",
      tagged_race_ids: existing?.tagged_race_ids ?? [],
    },
  });

  async function onSubmit(values: Values) {
    const payload = {
      day: values.day,
      start_time: values.start_time,
      end_time: values.end_time,
      role_type: values.role_type,
      headcount: values.headcount,
      title: values.title || null,
      description: values.description || null,
      tagged_race_ids: values.tagged_race_ids,
    };
    if (existing) {
      await patch.mutateAsync(payload);
    } else {
      await create.mutateAsync(payload);
    }
    onSaved?.();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid min-w-0 gap-3 rounded-md border border-slate-200 p-3 text-sm" data-mission-form>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Jour" error={form.formState.errors.day?.message}>
          <input className="input w-full min-w-0" type="number" min={1} {...form.register("day")} aria-label="Jour" />
        </Field>
        <Field label="Effectif" error={form.formState.errors.headcount?.message}>
          <input className="input w-full min-w-0" type="number" min={1} {...form.register("headcount")} aria-label="Effectif" />
        </Field>
        <Field label="Rôle" error={form.formState.errors.role_type?.message}>
          <input
            className="input w-full min-w-0"
            list="mission-role-types"
            {...form.register("role_type")}
            aria-label="Rôle"
          />
          <datalist id="mission-role-types">
            {(roleTypes.data ?? []).map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Début" error={form.formState.errors.start_time?.message}>
          <input className="input w-full min-w-0" type="datetime-local" {...form.register("start_time")} aria-label="Début" />
        </Field>
        <Field label="Fin" error={form.formState.errors.end_time?.message}>
          <input className="input w-full min-w-0" type="datetime-local" {...form.register("end_time")} aria-label="Fin" />
        </Field>
      </div>
      <Field label="Titre">
        <input className="input w-full" {...form.register("title")} />
      </Field>
      <Field label="Description">
        <textarea className="input min-h-16 w-full" {...form.register("description")} />
      </Field>
      <Field label="Courses associées">
        <Controller
          name="tagged_race_ids"
          control={form.control}
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {(races.data ?? []).map((r) => {
                const active = field.value.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      field.onChange(
                        active ? field.value.filter((x) => x !== r.id) : [...field.value, r.id],
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
                    }`}
                  >
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: r.color }}
                    />
                    {r.name}
                  </button>
                );
              })}
              {(races.data ?? []).length === 0 && (
                <span className="text-xs text-slate-500">Aucune course pour l'instant.</span>
              )}
            </div>
          )}
        />
      </Field>
      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-slate-600 underline">
            Annuler
          </button>
        )}
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={create.isPending || patch.isPending}
        >
          {existing ? "Enregistrer" : "Créer la mission"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}
