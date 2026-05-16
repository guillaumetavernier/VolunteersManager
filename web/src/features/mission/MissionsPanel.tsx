import { useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";

import { useEvent } from "@/features/event/hooks";
import type { VS } from "@/features/vs/api";
import { useVolunteers } from "@/features/volunteer/hooks";
import { ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { VolunteerDragItem } from "@/features/assignment/VolunteerDragItem";
import { useCreateAssignment } from "@/features/assignment/hooks";

import { useMissionsForVS } from "./hooks";
import { MissionCard } from "./MissionCard";
import { MissionForm } from "./MissionForm";

interface Props {
  vs: VS;
  onClose: () => void;
}

export function MissionsPanel({ vs, onClose }: Props) {
  const ev = useEvent();
  const totalDays = useMemo(() => dayCount(ev.data?.start_date, ev.data?.end_date), [ev.data]);
  const [day, setDay] = useState(1);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const missions = useMissionsForVS(vs.id, day);
  const vols = useVolunteers("false");
  const create = useCreateAssignment();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const filteredVols = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = vols.data ?? [];
    if (!q) return list;
    return list.filter((v) => `${v.first_name} ${v.last_name}`.toLowerCase().includes(q));
  }, [vols.data, query]);

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const overData = over.data.current as { missionID?: number } | undefined;
    const activeData = active.data.current as { volunteerID?: number } | undefined;
    if (!overData?.missionID || !activeData?.volunteerID) return;
    try {
      await create.mutateAsync({
        mission_id: overData.missionID,
        volunteer_id: activeData.volunteerID,
      });
      toast("Affectation créée");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast("Ce bénévole est déjà affecté à cette mission", "error");
      } else {
        toast("Erreur lors de l'affectation", "error");
      }
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <aside
        className="fixed right-0 top-0 z-20 flex h-full w-[36rem] max-w-[100vw] flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-4 shadow-xl"
        aria-label={`Missions pour ${vs.name}`}
        data-missions-panel
      >
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{vs.name}</h2>
            <p className="text-xs text-slate-500">Missions par jour</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900" aria-label="Fermer">
            ×
          </button>
        </header>
        <nav className="flex flex-wrap gap-1" role="tablist" aria-label="Jours">
          {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
            <button
              key={d}
              role="tab"
              aria-selected={d === day}
              data-day-tab={d}
              onClick={() => setDay(d)}
              className={`rounded-md px-3 py-1 text-xs ${
                d === day ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              J{d}
            </button>
          ))}
        </nav>
        <div className="grid grid-cols-[1fr_180px] gap-3">
          <div className="grid gap-2">
            {(missions.data ?? []).map((m) => (
              <MissionCard key={m.id} mission={m} />
            ))}
            {(missions.data ?? []).length === 0 && !adding && (
              <p className="text-xs text-slate-500">Aucune mission ce jour.</p>
            )}
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-700 hover:border-slate-500"
                data-action="add-mission"
              >
                + Ajouter une mission
              </button>
            )}
            {adding && (
              <MissionForm
                vsID={vs.id}
                onSaved={() => setAdding(false)}
                onCancel={() => setAdding(false)}
              />
            )}
          </div>
          <div className="grid h-fit gap-2 rounded-md border border-slate-200 p-2" data-volunteer-pool>
            <h3 className="text-xs font-semibold uppercase text-slate-500">Bénévoles</h3>
            <input
              className="input"
              placeholder="Rechercher…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher un bénévole"
            />
            <div className="grid max-h-[60vh] gap-1 overflow-y-auto">
              {filteredVols.map((v) => (
                <VolunteerDragItem key={v.id} volunteer={v} />
              ))}
            </div>
          </div>
        </div>
      </aside>
    </DndContext>
  );
}

function dayCount(start?: string, end?: string): number {
  if (!start || !end) return 1;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
  const days = Math.floor((e.getTime() - s.getTime()) / 86_400_000) + 1;
  return Math.max(1, days);
}
