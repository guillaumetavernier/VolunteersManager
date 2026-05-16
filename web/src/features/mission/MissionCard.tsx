import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";

import { useVolunteers } from "@/features/volunteer/hooks";
import {
  useAssignmentsForMission,
  useDeleteAssignment,
} from "@/features/assignment/hooks";
import { VolunteerPicker } from "@/features/assignment/VolunteerPicker";

import type { Mission } from "./api";
import { useDeleteMission } from "./hooks";

interface Props {
  mission: Mission;
}

export function MissionCard({ mission }: Props) {
  const vols = useVolunteers("false");
  const assignments = useAssignmentsForMission(mission.id);
  const del = useDeleteAssignment();
  const delMission = useDeleteMission();
  const [picker, setPicker] = useState(false);

  const { setNodeRef, isOver } = useDroppable({
    id: `mission-${mission.id}`,
    data: { missionID: mission.id },
  });

  const assignedIDs = (assignments.data ?? []).map((a) => a.volunteer_id);
  const volsByID = new Map(
    (vols.data ?? []).map((v) => [v.id, v] as const),
  );

  const status = mission.status;
  const badgeColor =
    status === "exact"
      ? "bg-emerald-100 text-emerald-900"
      : status === "over"
        ? "bg-amber-100 text-amber-900"
        : "bg-rose-100 text-rose-900";

  return (
    <article
      ref={setNodeRef}
      data-mission-id={mission.id}
      data-staffing-status={status}
      className={`grid gap-2 rounded-md border p-3 text-sm transition ${
        isOver ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">
            {mission.role_type}
            {mission.title ? ` · ${mission.title}` : ""}
          </div>
          <div className="text-xs text-slate-500">
            {fmtRange(mission.start_time, mission.end_time)}
          </div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeColor}`} data-staffing-badge>
          {mission.assigned}/{mission.needed}
        </span>
      </header>
      <div className="flex flex-wrap gap-1">
        {(assignments.data ?? []).map((a) => {
          const v = volsByID.get(a.volunteer_id);
          return (
            <span
              key={a.id}
              data-assignment-id={a.id}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs"
            >
              {v ? `${v.first_name} ${v.last_name}` : `#${a.volunteer_id}`}
              <button
                onClick={() => del.mutate(a.id)}
                className="text-slate-500 hover:text-rose-700"
                aria-label="Retirer l'affectation"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setPicker(true)}
          className="text-xs text-slate-700 underline"
          data-action="open-picker"
        >
          Ajouter un bénévole
        </button>
        <button
          onClick={() => {
            if (confirm("Supprimer cette mission ?")) delMission.mutate(mission.id);
          }}
          className="text-xs text-rose-700 hover:underline"
        >
          Supprimer
        </button>
      </div>
      {picker && (
        <VolunteerPicker mission={mission} assignedIDs={assignedIDs} onClose={() => setPicker(false)} />
      )}
    </article>
  );
}

function fmtRange(start: string, end: string): string {
  return `${start.slice(11, 16)}–${end.slice(11, 16)}`;
}
