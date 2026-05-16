import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";

import { ApiError } from "@/lib/api";
import { useEvent } from "@/features/event/hooks";
import { useVSList } from "@/features/vs/hooks";
import { useCreateVolunteer, usePatchVolunteer } from "./hooks";
import type { Volunteer, VolunteerInput } from "./api";
import { PhoneInput } from "./PhoneInput";
import { RoleTagInput } from "./RoleTagInput";
import { AvailabilityEditor } from "./AvailabilityEditor";

const schema = z.object({
  first_name: z.string().min(1, "Prénom requis"),
  last_name: z.string().min(1, "Nom requis"),
  phone: z.string().min(1, "Téléphone requis"),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  emergency_contact_name: z.string().optional(),
  emergency_contact_phone: z.string().optional(),
  general_info: z.string().optional(),
  customizable_message: z.string().optional(),
  role_types: z.array(z.string()).default([]),
  availability: z.array(z.object({ day: z.number().min(1), start: z.string(), end: z.string() })).default([]),
  default_vs_id: z.number().nullable().optional(),
  can_drive: z.boolean().default(false),
  license_type: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  existing?: Volunteer | null;
  onSaved?: (v: Volunteer) => void;
  onCancel?: () => void;
}

export function VolunteerForm({ existing, onSaved, onCancel }: Props) {
  const ev = useEvent();
  const vs = useVSList();
  const create = useCreateVolunteer();
  const patch = usePatchVolunteer(existing?.id ?? 0);

  const defaultCountry = countryFromEvent(ev.data);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: existing?.first_name ?? "",
      last_name: existing?.last_name ?? "",
      phone: existing?.phone ?? "",
      email: existing?.email ?? "",
      emergency_contact_name: existing?.emergency_contact_name ?? "",
      emergency_contact_phone: existing?.emergency_contact_phone ?? "",
      general_info: existing?.general_info ?? "",
      customizable_message: existing?.customizable_message ?? "",
      role_types: existing?.role_types ?? [],
      availability: existing?.availability ?? [],
      default_vs_id: existing?.default_vs_id ?? null,
      can_drive: existing?.can_drive ?? false,
      license_type: existing?.license_type ?? "",
      notes: existing?.notes ?? "",
    },
  });

  useEffect(() => {
    if (existing) {
      form.reset({
        first_name: existing.first_name,
        last_name: existing.last_name,
        phone: existing.phone,
        email: existing.email ?? "",
        emergency_contact_name: existing.emergency_contact_name ?? "",
        emergency_contact_phone: existing.emergency_contact_phone ?? "",
        general_info: existing.general_info ?? "",
        customizable_message: existing.customizable_message ?? "",
        role_types: existing.role_types,
        availability: existing.availability,
        default_vs_id: existing.default_vs_id,
        can_drive: existing.can_drive,
        license_type: existing.license_type ?? "",
        notes: existing.notes ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  async function onSubmit(values: FormValues) {
    const payload: VolunteerInput = {
      ...values,
      email: values.email || null,
      emergency_contact_name: values.emergency_contact_name || null,
      emergency_contact_phone: values.emergency_contact_phone || null,
      general_info: values.general_info || null,
      customizable_message: values.customizable_message || null,
      license_type: values.license_type || null,
      notes: values.notes || null,
      default_vs_id: values.default_vs_id ?? null,
    };
    const result = existing ? await patch.mutateAsync(payload) : await create.mutateAsync(payload);
    onSaved?.(result);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Prénom" error={form.formState.errors.first_name?.message}>
          <input className="input" {...form.register("first_name")} aria-label="Prénom" />
        </Field>
        <Field label="Nom" error={form.formState.errors.last_name?.message}>
          <input className="input" {...form.register("last_name")} aria-label="Nom" />
        </Field>
      </div>
      <Field label="Téléphone" error={form.formState.errors.phone?.message}>
        <Controller
          name="phone"
          control={form.control}
          render={({ field }) => (
            <PhoneInput value={field.value} onChange={field.onChange} defaultCountry={defaultCountry} required />
          )}
        />
      </Field>
      <Field label="Email" error={form.formState.errors.email?.message}>
        <input className="input" type="email" {...form.register("email")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Contact d'urgence (nom)">
          <input className="input" {...form.register("emergency_contact_name")} />
        </Field>
        <Field label="Contact d'urgence (téléphone)">
          <Controller
            name="emergency_contact_phone"
            control={form.control}
            render={({ field }) => (
              <PhoneInput value={field.value ?? ""} onChange={field.onChange} defaultCountry={defaultCountry} />
            )}
          />
        </Field>
      </div>
      <Field label="Infos générales">
        <textarea className="input min-h-20" {...form.register("general_info")} />
      </Field>
      <Field label="Message personnalisable">
        <textarea className="input min-h-20" {...form.register("customizable_message")} />
      </Field>
      <Field label="Rôles">
        <Controller
          name="role_types"
          control={form.control}
          render={({ field }) => <RoleTagInput value={field.value} onChange={field.onChange} />}
        />
      </Field>
      <Field label="Disponibilités">
        <Controller
          name="availability"
          control={form.control}
          render={({ field }) => <AvailabilityEditor value={field.value} onChange={field.onChange} />}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="VS par défaut">
          <Controller
            name="default_vs_id"
            control={form.control}
            render={({ field }) => (
              <select
                className="input"
                value={field.value ?? ""}
                onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">—</option>
                {(vs.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          />
        </Field>
        <Field label="Type de permis">
          <input className="input" {...form.register("license_type")} placeholder="B, BE, C…" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...form.register("can_drive")} /> Peut conduire
      </label>
      <Field label="Notes">
        <textarea className="input min-h-20" {...form.register("notes")} />
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
          {existing ? "Enregistrer" : "Créer"}
        </button>
      </div>
      {(create.isError || patch.isError) && (
        <p role="alert" className="text-sm text-red-600">
          {formatError(create.error ?? patch.error)}
        </p>
      )}
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

const ERROR_FR: Record<string, string> = {
  missing_fields: "Prénom, nom et téléphone sont obligatoires.",
  phone_invalid: "Le numéro de téléphone n'est pas valide (format E.164).",
  bad_request: "Requête invalide.",
  internal: "Erreur interne du serveur.",
};

function formatError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { code?: string; message?: string } | null;
    if (body?.code && ERROR_FR[body.code]) return ERROR_FR[body.code];
    if (body?.message) return body.message;
    return err.message;
  }
  return String(err);
}

function countryFromEvent(ev: { country_code?: string } | null | undefined): string {
  if (!ev?.country_code) return "FR";
  return ev.country_code.toUpperCase();
}
