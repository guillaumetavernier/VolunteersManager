import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { navigate } from "@/lib/router";
import { useCars } from "@/features/car/hooks";
import { useMatrix } from "@/features/travelMatrix/hooks";
import { useVSList } from "@/features/vs/hooks";
import { useVolunteers } from "@/features/volunteer/hooks";
import { useCreateTrip, useDeleteTrip, useReplaceTrip, useTrip } from "./hooks";
import type { TripInput } from "./api";

interface EditorStop {
  vs_id: number;
  time: string;
  leg_time_source: "auto" | "manual";
  board: number[];
  alight: number[];
}

interface InitialFromNeed {
  day?: number;
  from?: number;
  to?: number;
  vol?: number;
  from_time?: string;
  to_time?: string;
}

function readInitial(): InitialFromNeed {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash.replace(/^#/, "");
  const q = hash.split("?")[1];
  if (!q) return {};
  const p = new URLSearchParams(q);
  const intOr = (k: string) => {
    const v = p.get(k);
    return v != null && /^\d+$/.test(v) ? Number(v) : undefined;
  };
  return {
    day: intOr("day"),
    from: intOr("from"),
    to: intOr("to"),
    vol: intOr("vol"),
    from_time: p.get("from_time") ?? undefined,
    to_time: p.get("to_time") ?? undefined,
  };
}

export function TripEditor({ id }: { id?: number }) {
  const isNew = id == null;
  const trip = useTrip(isNew ? -1 : id!);
  const vs = useVSList();
  const vols = useVolunteers("all");
  const cars = useCars();
  const matrix = useMatrix();
  const create = useCreateTrip();
  const replace = useReplaceTrip(id ?? 0);
  const del = useDeleteTrip();

  const initial = useMemo(readInitial, []);
  const [day, setDay] = useState<number>(initial.day ?? 1);
  const [driverID, setDriverID] = useState<number>(0);
  const [carID, setCarID] = useState<number>(0);
  const [mode, setMode] = useState<"drive" | "walk">("drive");
  const [notes, setNotes] = useState("");
  const [stops, setStops] = useState<EditorStop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Seed initial state from the loaded trip or from URL params.
  useEffect(() => {
    if (loaded) return;
    if (!isNew && trip.data) {
      setDay(trip.data.day);
      setDriverID(trip.data.driver_id);
      setCarID(trip.data.car_id);
      setMode(trip.data.mode);
      setNotes(trip.data.notes ?? "");
      setStops(
        trip.data.stops.map((s) => ({
          vs_id: s.vs_id,
          time: s.time,
          leg_time_source: s.leg_time_source,
          board: s.board ?? [],
          alight: s.alight ?? [],
        })),
      );
      setLoaded(true);
      return;
    }
    if (isNew) {
      const fromTime = initial.from_time ?? "08:00";
      const toTime = initial.to_time ?? "09:00";
      setStops([
        {
          vs_id: initial.from ?? 0,
          time: fromTime,
          leg_time_source: "auto",
          board: initial.vol ? [initial.vol] : [],
          alight: [],
        },
        {
          vs_id: initial.to ?? 0,
          time: toTime,
          leg_time_source: "auto",
          board: [],
          alight: initial.vol ? [initial.vol] : [],
        },
      ]);
      setLoaded(true);
    }
  }, [isNew, trip.data, initial, loaded]);

  const drivers = (vols.data ?? []).filter((v) => v.can_drive);

  function matrixSec(fromVS: number, toVS: number): number | null {
    if (!fromVS || !toVS) return null;
    const c = matrix.data?.find((x) => x.from_vs === fromVS && x.to_vs === toVS && x.mode === mode);
    return c ? c.seconds : null;
  }

  function applyAutoFill(next: EditorStop[]): EditorStop[] {
    // Walk forward: for each stop i>0 with leg_time_source=auto, compute from
    // previous time + matrix(prev.vs, this.vs, mode).
    const out = next.map((s) => ({ ...s }));
    for (let i = 1; i < out.length; i++) {
      const cur = out[i];
      if (cur.leg_time_source !== "auto") continue;
      const prev = out[i - 1];
      const sec = matrixSec(prev.vs_id, cur.vs_id);
      if (sec == null) continue;
      // Add HH:MM math when prev.time looks like HH:MM, else fall back to ISO.
      out[i].time = addSeconds(prev.time, sec);
    }
    return out;
  }

  function setStopVS(i: number, vsID: number) {
    setStops((prev) => applyAutoFill(prev.map((s, idx) => (idx === i ? { ...s, vs_id: vsID } : s))));
  }
  function setStopTime(i: number, time: string) {
    setStops((prev) => {
      const next = prev.map((s, idx) => (idx === i ? { ...s, time, leg_time_source: "manual" as const } : s));
      return applyAutoFill(next);
    });
  }
  function revertStopTime(i: number) {
    setStops((prev) => applyAutoFill(prev.map((s, idx) => (idx === i ? { ...s, leg_time_source: "auto" as const } : s))));
  }
  function addStop() {
    setStops((prev) => [...prev, { vs_id: 0, time: "", leg_time_source: "auto", board: [], alight: [] }]);
  }
  function removeStop(i: number) {
    setStops((prev) => applyAutoFill(prev.filter((_, idx) => idx !== i)));
  }
  function toggleBoard(i: number, volID: number) {
    setStops((prev) =>
      prev.map((s, idx) =>
        idx === i
          ? { ...s, board: s.board.includes(volID) ? s.board.filter((v) => v !== volID) : [...s.board, volID] }
          : s,
      ),
    );
  }
  function toggleAlight(i: number, volID: number) {
    setStops((prev) =>
      prev.map((s, idx) =>
        idx === i
          ? { ...s, alight: s.alight.includes(volID) ? s.alight.filter((v) => v !== volID) : [...s.alight, volID] }
          : s,
      ),
    );
  }

  // Per-leg validation chips.
  const legWarnings = useMemo(() => {
    const out: string[] = [];
    const car = cars.data?.find((c) => c.id === carID);
    if (car) {
      const onboard = new Set<number>();
      for (let i = 0; i < stops.length - 1; i++) {
        for (const v of stops[i].board) onboard.add(v);
        for (const v of stops[i].alight) onboard.delete(v);
        if (onboard.size > car.seats) {
          out.push(`Étape ${i + 1} → ${i + 2}: ${onboard.size} passagers > ${car.seats} places.`);
        }
      }
    }
    // Board without alight check.
    const seen = new Map<number, number>();
    for (let i = 0; i < stops.length; i++) {
      for (const v of stops[i].board) if (!seen.has(v)) seen.set(v, i);
      for (const v of stops[i].alight) seen.delete(v);
    }
    if (seen.size > 0) {
      out.push("Au moins un passager monte mais ne descend pas.");
    }
    // Mismatch between manual & matrix-implied.
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].leg_time_source !== "manual") continue;
      const sec = matrixSec(stops[i - 1].vs_id, stops[i].vs_id);
      if (sec == null) continue;
      const got = diffSeconds(stops[i - 1].time, stops[i].time);
      if (got == null) continue;
      if (Math.abs(got - sec) > 5 * 60) {
        out.push(`Étape ${i}: temps manuel s'écarte de la matrice (~${Math.round(sec / 60)} min).`);
      }
    }
    return out;
  }, [stops, cars.data, carID, matrix.data, mode]);

  async function onSave() {
    setError(null);
    const cleanStops = stops.filter((s) => s.vs_id > 0 && s.time);
    if (cleanStops.length < 2 || driverID <= 0 || carID <= 0) {
      setError("Renseignez conducteur, véhicule et au moins 2 arrêts.");
      return;
    }
    const input: TripInput = {
      day,
      driver_id: driverID,
      car_id: carID,
      mode,
      notes,
      stops: cleanStops.map((s) => ({
        vs_id: s.vs_id,
        time: s.time,
        leg_time_source: s.leg_time_source,
        board: s.board,
        alight: s.alight,
      })),
    };
    try {
      if (isNew) {
        const t = await create.mutateAsync(input);
        navigate(`/trips/${t.id}`);
      } else {
        await replace.mutateAsync(input);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function onDelete() {
    if (id == null) return;
    if (!confirm("Supprimer ce trajet ?")) return;
    await del.mutateAsync(id);
    navigate("/trips");
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {isNew ? "Nouveau trajet" : `Trajet n°${id}`}
        </h1>
        <nav className="flex items-center gap-2 text-sm">
          <Button variant="link" size="sm" onClick={() => navigate("/trips")}>
            Retour
          </Button>
        </nav>
      </header>
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
      <div className="grid gap-4 md:grid-cols-[1fr_2fr_1fr]">
        <section className="space-y-3" aria-label="Métadonnées du trajet">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Jour</span>
            <Input
              type="number"
              min={1}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              aria-label="Jour"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Conducteur</span>
            <select
              className="input w-full"
              value={driverID}
              onChange={(e) => setDriverID(Number(e.target.value))}
              aria-label="Conducteur"
            >
              <option value={0}>— Choisir —</option>
              {drivers.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.first_name} {v.last_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Véhicule</span>
            <select
              className="input w-full"
              value={carID}
              onChange={(e) => setCarID(Number(e.target.value))}
              aria-label="Véhicule"
            >
              <option value={0}>— Choisir —</option>
              {(cars.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.seats} places)
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Mode</span>
            <select
              className="input w-full"
              value={mode}
              onChange={(e) => setMode(e.target.value as "drive" | "walk")}
              aria-label="Mode"
            >
              <option value="drive">Voiture</option>
              <option value="walk">Marche</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Notes</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </label>
        </section>

        <section aria-label="Arrêts" data-testid="stops">
          <ol className="space-y-3">
            {stops.map((st, i) => (
              <li key={i} className="rounded-md border border-slate-200 p-3" data-stop-index={i}>
                <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto]">
                  <label className="grid gap-1 text-sm">
                    <span>Arrêt {i + 1} · VS</span>
                    <select
                      className="input w-full"
                      value={st.vs_id}
                      onChange={(e) => setStopVS(i, Number(e.target.value))}
                      aria-label={`VS arrêt ${i + 1}`}
                    >
                      <option value={0}>— Choisir —</option>
                      {(vs.data ?? []).map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>Heure</span>
                    <Input
                      type="text"
                      value={st.time}
                      onChange={(e) => setStopTime(i, e.target.value)}
                      placeholder="HH:MM"
                      aria-label={`Heure arrêt ${i + 1}`}
                      data-stop-time={i}
                    />
                    <span
                      className={`mt-0.5 inline-block w-fit rounded px-1 text-xs ${
                        st.leg_time_source === "manual"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-emerald-100 text-emerald-900"
                      }`}
                      data-time-source={st.leg_time_source}
                    >
                      {st.leg_time_source === "manual" ? "manuel" : "auto"}
                    </span>
                    {st.leg_time_source === "manual" && i > 0 && (
                      <button
                        type="button"
                        onClick={() => revertStopTime(i)}
                        className="text-xs text-blue-700 underline"
                        data-revert-time={i}
                      >
                        Restaurer auto
                      </button>
                    )}
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => removeStop(i)}
                      className="text-sm text-red-700 hover:underline"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <fieldset className="rounded border border-slate-100 p-2">
                    <legend className="text-xs font-medium">Montent ici</legend>
                    {(vols.data ?? []).map((v) => (
                      <label key={v.id} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={st.board.includes(v.id)}
                          onChange={() => toggleBoard(i, v.id)}
                          aria-label={`Monter ${v.first_name} ${v.last_name}`}
                        />
                        {v.first_name} {v.last_name}
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className="rounded border border-slate-100 p-2">
                    <legend className="text-xs font-medium">Descendent ici</legend>
                    {(vols.data ?? []).map((v) => (
                      <label key={v.id} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={st.alight.includes(v.id)}
                          onChange={() => toggleAlight(i, v.id)}
                          aria-label={`Descendre ${v.first_name} ${v.last_name}`}
                        />
                        {v.first_name} {v.last_name}
                      </label>
                    ))}
                  </fieldset>
                </div>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addStop}
            className="mt-2"
          >
            + Ajouter un arrêt
          </Button>
        </section>

        <aside aria-label="Validation" data-testid="warnings">
          <h2 className="mb-2 text-sm font-semibold">Validation</h2>
          {legWarnings.length === 0 ? (
            <p className="text-xs text-slate-500">Aucun problème détecté.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {legWarnings.map((w, i) => (
                <li
                  key={i}
                  className="rounded bg-amber-100 px-2 py-1 text-amber-900"
                  data-warning-index={i}
                >
                  {w}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      <footer className="mt-6 flex items-center gap-3">
        <Button onClick={onSave} data-testid="save-trip">
          {isNew ? "Créer" : "Enregistrer"}
        </Button>
        {!isNew && (
          <Button
            variant="outline"
            onClick={onDelete}
            className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-700"
          >
            Supprimer
          </Button>
        )}
      </footer>
    </main>
  );
}

// addSeconds: accepts either "HH:MM" or an ISO datetime; returns same kind.
function addSeconds(time: string, seconds: number): string {
  if (/^\d{2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    const total = h * 60 + m + Math.round(seconds / 60);
    const hh = Math.floor(((total % (24 * 60)) + 24 * 60) % (24 * 60) / 60);
    const mm = ((total % 60) + 60) % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const d = new Date(time);
  if (Number.isFinite(d.getTime())) {
    d.setSeconds(d.getSeconds() + seconds);
    return d.toISOString();
  }
  return time;
}

// diffSeconds: returns b - a in seconds when both parse, otherwise null.
function diffSeconds(a: string, b: string): number | null {
  if (/^\d{2}:\d{2}$/.test(a) && /^\d{2}:\d{2}$/.test(b)) {
    const [ha, ma] = a.split(":").map(Number);
    const [hb, mb] = b.split(":").map(Number);
    return (hb * 60 + mb - (ha * 60 + ma)) * 60;
  }
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return null;
  return Math.round((db - da) / 1000);
}
