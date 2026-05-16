import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useInitializeEvent } from "./hooks";

const REGIONS = [
  "europe-france",
  "europe-france-iv",
  "europe-belgium",
  "europe-italy",
  "europe-spain",
  "europe-germany",
  "europe-uk",
] as const;

const schema = z.object({
  name: z.string().min(1, "name required"),
  start_date: z.string().min(1, "start date required"),
  end_date: z.string().min(1, "end date required"),
  timezone: z.string().min(1),
  country_code: z.string().min(2).max(2),
  region: z.enum(REGIONS),
});

export type WizardValues = z.infer<typeof schema>;

const defaults: WizardValues = {
  name: "",
  start_date: "",
  end_date: "",
  timezone: "Europe/Paris",
  country_code: "FR",
  region: "europe-france",
};

export function EventInitWizard() {
  const init = useInitializeEvent();
  const form = useForm<WizardValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const onSubmit = form.handleSubmit((values) => {
    init.mutate(values);
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Initialize event</h1>
      <form className="grid gap-4" onSubmit={onSubmit} aria-label="event-init">
        <Field label="Event name" error={form.formState.errors.name?.message}>
          <input className="input" {...form.register("name")} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date" error={form.formState.errors.start_date?.message}>
            <input type="date" className="input" {...form.register("start_date")} />
          </Field>
          <Field label="End date" error={form.formState.errors.end_date?.message}>
            <input type="date" className="input" {...form.register("end_date")} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Timezone" error={form.formState.errors.timezone?.message}>
            <input className="input" {...form.register("timezone")} />
          </Field>
          <Field label="Country code" error={form.formState.errors.country_code?.message}>
            <input className="input" maxLength={2} {...form.register("country_code")} />
          </Field>
        </div>
        <Field label="Map region (for tile download)" error={form.formState.errors.region?.message}>
          <select className="input" {...form.register("region")}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={init.isPending}
        >
          {init.isPending ? "Saving…" : "Create event"}
        </button>
        {init.isError && (
          <p role="alert" className="text-sm text-red-600">
            {(init.error as Error).message}
          </p>
        )}
      </form>
    </main>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="text-red-600">{error}</span>}
    </label>
  );
}
