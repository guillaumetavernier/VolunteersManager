import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
            <Input
              type="number"
              min={1}
              value={w.day}
              onChange={(e) => setAt(i, { day: Number(e.target.value) })}
            />
          </label>
          <label className="text-xs">
            Début
            <Input
              type="time"
              value={w.start}
              onChange={(e) => setAt(i, { start: e.target.value })}
            />
          </label>
          <label className="text-xs">
            Fin
            <Input
              type="time"
              value={w.end}
              onChange={(e) => setAt(i, { end: e.target.value })}
            />
          </label>
          <Button type="button" variant="link" size="sm" onClick={() => remove(i)} className="text-destructive">
            Retirer
          </Button>
        </div>
      ))}
      <Button type="button" variant="link" size="sm" onClick={add} className="self-start">
        + Ajouter une plage
      </Button>
    </div>
  );
}
