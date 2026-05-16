import type { AvailabilityWindow } from "./api";

interface Props {
  value: AvailabilityWindow[];
  onChange: (next: AvailabilityWindow[]) => void;
}

export function AvailabilityEditor({ value, onChange }: Props) {
  function setAt(idx: number, patch: Partial<AvailabilityWindow>) {
    onChange(value.map((w, i) => (i === idx ? { ...w, ...patch } : w)));
  }
  function add() {
    onChange([...value, { day: 1, start: "08:00", end: "18:00" }]);
  }
  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }
  return (
    <div className="grid gap-2">
      {value.map((w, i) => (
        <div key={i} className="grid grid-cols-[80px_1fr_1fr_auto] items-center gap-2">
          <label className="text-xs">
            Jour
            <input
              className="input w-full"
              type="number"
              min={1}
              value={w.day}
              onChange={(e) => setAt(i, { day: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs">
            Début
            <input
              className="input w-full"
              type="time"
              value={w.start}
              onChange={(e) => setAt(i, { start: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Fin
            <input
              className="input w-full"
              type="time"
              value={w.end}
              onChange={(e) => setAt(i, { end: e.target.value })}
            />
          </label>
          <button type="button" onClick={() => remove(i)} className="text-sm text-red-700 hover:underline">
            Retirer
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="self-start text-sm text-slate-700 underline">
        + Ajouter une plage
      </button>
    </div>
  );
}
