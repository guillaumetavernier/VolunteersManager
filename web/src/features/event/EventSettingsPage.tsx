import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { dateForDay, dayCount } from "./eventcal";
import { useEvent, useUpdateEvent } from "./hooks";

export function EventSettingsPage() {
  const event = useEvent();
  const update = useUpdateEvent();

  if (event.isLoading) {
    return <div className="p-4 text-sm text-slate-600">Chargement…</div>;
  }
  if (!event.data) {
    return <div className="p-4 text-sm text-red-700">Événement introuvable.</div>;
  }

  return <Inner event={event.data} update={update} />;
}

function Inner({
  event,
  update,
}: {
  event: ReturnType<typeof useEvent>["data"] extends infer T
    ? Exclude<T, null | undefined>
    : never;
  update: ReturnType<typeof useUpdateEvent>;
}) {
  const [name, setName] = useState(event.name);
  const [startDate, setStartDate] = useState(event.start_date);
  const [days, setDays] = useState<number>(dayCount(event));
  const [coordinatorName, setCoordinatorName] = useState(event.coordinator_name ?? "");
  const [coordinatorPhone, setCoordinatorPhone] = useState(event.coordinator_phone ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(event.name);
    setStartDate(event.start_date);
    setDays(dayCount(event));
    setCoordinatorName(event.coordinator_name ?? "");
    setCoordinatorPhone(event.coordinator_phone ?? "");
  }, [event]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    const safeDays = Math.max(1, Math.floor(days || 1));
    const end_date = dateForDay({ start_date: startDate }, safeDays);
    await update.mutateAsync({
      event,
      patch: {
        name: name.trim() || event.name,
        start_date: startDate,
        end_date,
        coordinator_name: coordinatorName.trim() || null,
        coordinator_phone: coordinatorPhone.trim() || null,
      },
    });
    setSaved(true);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto grid max-w-xl gap-4 p-4 text-sm"
      data-testid="event-settings"
    >
      <h2 className="text-lg font-semibold">Événement</h2>

      <label className="grid gap-1">
        <span className="font-medium">Nom</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nom"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="font-medium">Date de début</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Date de début"
          />
        </label>
        <label className="grid gap-1">
          <span className="font-medium">Nombre de jours</span>
          <Input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Nombre de jours"
            data-testid="event-days"
          />
        </label>
      </div>
      <p className="text-xs text-slate-500" data-testid="event-end-date">
        Fin&nbsp;: {dateForDay({ start_date: startDate }, Math.max(1, Math.floor(days || 1)))}
      </p>

      <label className="grid gap-1">
        <span className="font-medium">Coordinateur — nom</span>
        <Input
          value={coordinatorName}
          onChange={(e) => setCoordinatorName(e.target.value)}
          aria-label="Coordinateur — nom"
        />
      </label>
      <label className="grid gap-1">
        <span className="font-medium">Coordinateur — téléphone</span>
        <Input
          value={coordinatorPhone}
          onChange={(e) => setCoordinatorPhone(e.target.value)}
          aria-label="Coordinateur — téléphone"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={update.isPending} data-testid="event-save">
          {update.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {saved && !update.isPending && (
          <span className="text-xs text-emerald-700" data-testid="event-saved">
            Enregistré.
          </span>
        )}
        {update.isError && (
          <span role="alert" className="text-xs text-red-700">
            {(update.error as Error).message}
          </span>
        )}
      </div>
    </form>
  );
}
