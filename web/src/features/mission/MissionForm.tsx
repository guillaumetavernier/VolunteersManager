import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DayChips } from "@/features/event/DayChips";
import { useEvent } from "@/features/event/hooks";
import { composeISO, extractHHMM } from "@/features/event/eventcal";
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
  const event = useEvent();
  const create = useCreateMission(vsID);
  const patch = usePatchMission(existing?.id ?? 0);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      day: existing?.day ?? 1,
      start_time: extractHHMM(existing?.start_time) || "08:00",
      end_time: extractHHMM(existing?.end_time) || "12:00",
      role_type: existing?.role_type ?? "",
      headcount: existing?.headcount ?? 1,
      title: existing?.title ?? "",
      description: existing?.description ?? "",
      tagged_race_ids: existing?.tagged_race_ids ?? [],
    },
  });

  async function onSubmit(values: Values) {
    if (!event.data) return;
    const payload = {
      day: values.day,
      start_time: composeISO(event.data, values.day, values.start_time),
      end_time: composeISO(event.data, values.day, values.end_time),
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
      <Field label="Jour" error={form.formState.errors.day?.message}>
        <Controller
          name="day"
          control={form.control}
          render={({ field }) => (
            <DayChips
              value={field.value}
              onChange={(d) => field.onChange(d ?? 1)}
              testidPrefix="mission-day"
            />
          )}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Effectif" error={form.formState.errors.headcount?.message}>
          <Input className="w-full min-w-0" type="number" min={1} {...form.register("headcount")} aria-label="Effectif" />
        </Field>
        <Field label="Rôle" error={form.formState.errors.role_type?.message}>
          <Input
            className="w-full min-w-0"
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
          <Input className="w-full min-w-0" type="time" {...form.register("start_time")} aria-label="Début" />
        </Field>
        <Field label="Fin" error={form.formState.errors.end_time?.message}>
          <Input className="w-full min-w-0" type="time" {...form.register("end_time")} aria-label="Fin" />
        </Field>
      </div>
      <Field label="Titre">
        <Input className="w-full" {...form.register("title")} />
      </Field>
      <Field label="Description">
        <Textarea className="min-h-16 w-full" {...form.register("description")} />
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
                      active ? "border-primary bg-primary text-primary-foreground" : "border-slate-300 bg-white"
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
        <Button type="submit" disabled={create.isPending || patch.isPending}>
          {existing ? "Enregistrer" : "Créer la mission"}
        </Button>
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
