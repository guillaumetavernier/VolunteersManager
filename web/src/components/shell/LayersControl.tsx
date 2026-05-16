import { useState } from "react";
import { Layers } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRaces } from "@/features/race/hooks";

interface Props {
  raceVisibility: Record<number, boolean>;
  onToggleRace: (raceID: number, visible: boolean) => void;
}

export function LayersControl({ raceVisibility, onToggleRace }: Props) {
  const [open, setOpen] = useState(false);
  const races = useRaces();
  const visibleFor = (id: number) => raceVisibility[id] ?? true;

  return (
    <div className="absolute left-4 top-4 z-10">
      <Button
        type="button"
        size="sm"
        variant="default"
        onClick={() => setOpen((v) => !v)}
        data-testid="layers-control-toggle"
        aria-expanded={open}
        className="h-9 w-9 rounded-full p-0 shadow"
        aria-label="Couches"
      >
        <Layers className="h-4 w-4" />
      </Button>
      {open && (
        <div
          className="mt-2 grid w-64 gap-2 rounded-md border border-slate-200 bg-white/95 p-3 text-sm shadow"
          data-testid="layers-control-popover"
        >
          <strong className="text-xs uppercase text-slate-500">Courses</strong>
          {races.data && races.data.length === 0 && (
            <p className="text-xs text-slate-500">Aucune course.</p>
          )}
          <ul className="grid gap-1">
            {races.data?.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={visibleFor(r.id)}
                  onChange={(e) => onToggleRace(r.id, e.target.checked)}
                  aria-label={`Toggle ${r.name}`}
                  data-race-toggle={r.id}
                />
                <span
                  className="h-3 w-3 rounded-full border border-slate-300"
                  style={{ backgroundColor: r.color }}
                />
                <span className="truncate">{r.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
