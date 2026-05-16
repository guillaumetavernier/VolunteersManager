import { useMemo, useState } from "react";

import { useVolunteers } from "@/features/volunteer/hooks";
import { useMissions } from "@/features/mission/hooks";
import type { Mission } from "@/features/mission/api";
import type { Volunteer } from "@/features/volunteer/api";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api";

import { useCreateAssignment } from "./hooks";
import { isCompatible, type MissionLite } from "./compat";

interface Props {
  mission: Mission;
  assignedIDs: number[];
  onClose: () => void;
}

export function VolunteerPicker({ mission, assignedIDs, onClose }: Props) {
  const vols = useVolunteers("false");
  const allMissions = useMissions();
  const create = useCreateAssignment();
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");

  const missionsByID = useMemo(() => {
    const map = new Map<number, Mission>();
    for (const m of allMissions.data ?? []) map.set(m.id, m);
    return map;
  }, [allMissions.data]);

  const candidates = useMemo(() => {
    const list = (vols.data ?? []).filter((v) => !assignedIDs.includes(v.id));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter((v) => `${v.first_name} ${v.last_name}`.toLowerCase().includes(q))
      : list;
    return filtered.map((v) => {
      const busy = busyMissionsFor(v, missionsByID);
      const score = isCompatible(v, mission, busy);
      return { volunteer: v, score };
    });
  }, [vols.data, missionsByID, mission, assignedIDs, query]);

  const compat = candidates.filter((c) => c.score.compatible);
  const other = candidates.filter((c) => !c.score.compatible);

  async function assign(v: Volunteer) {
    try {
      await create.mutateAsync({ mission_id: mission.id, volunteer_id: v.id });
      toast(`${v.first_name} ${v.last_name} affecté(e)`);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast(`${v.first_name} ${v.last_name} est déjà affecté(e) à cette mission`, "error");
      } else {
        toast("Erreur lors de l'affectation", "error");
      }
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Choisir un bénévole"
      className="fixed inset-0 z-30 grid place-items-center bg-slate-900/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="grid w-full max-w-2xl gap-3 rounded-md bg-white p-4 shadow-xl">
        <header className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Affecter un bénévole</h3>
            <p className="text-xs text-slate-500">
              {mission.role_type} · jour {mission.day} · {fmtRange(mission.start_time, mission.end_time)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900" aria-label="Fermer">
            ×
          </button>
        </header>
        <div className="flex items-center gap-3">
          <input
            className="input flex-1"
            placeholder="Rechercher un bénévole…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher un bénévole"
          />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Tout afficher
          </label>
        </div>
        <div className="grid max-h-96 gap-2 overflow-y-auto">
          {compat.length === 0 && !showAll && (
            <p className="text-xs text-slate-500">Aucun bénévole compatible. Cochez « Tout afficher ».</p>
          )}
          {compat.map(({ volunteer: v }) => (
            <Row key={v.id} v={v} compatible onClick={() => assign(v)} />
          ))}
          {showAll && other.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
              Bénévoles non recommandés
            </div>
          )}
          {showAll &&
            other.map(({ volunteer: v, score }) => (
              <Row
                key={v.id}
                v={v}
                compatible={false}
                hint={hintFor(score)}
                onClick={() => assign(v)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function Row({
  v,
  compatible,
  hint,
  onClick,
}: {
  v: Volunteer;
  compatible: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-volunteer-id={v.id}
      className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
        compatible ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div>
        <div className="font-medium">
          {v.first_name} {v.last_name}
        </div>
        <div className="text-xs text-slate-500">
          {v.role_types.length > 0 ? v.role_types.join(" · ") : "—"}
        </div>
      </div>
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </button>
  );
}

function hintFor(s: { roleMatch: boolean; availabilityMatch: boolean; notBusy: boolean }): string {
  const why: string[] = [];
  if (!s.roleMatch) why.push("rôle");
  if (!s.availabilityMatch) why.push("dispo");
  if (!s.notBusy) why.push("conflit");
  return why.length ? `(${why.join(", ")})` : "";
}

function fmtRange(start: string, end: string): string {
  return `${start.slice(11, 16)}–${end.slice(11, 16)}`;
}

function busyMissionsFor(
  v: Volunteer,
  missionsByID: Map<number, Mission>,
): MissionLite[] {
  // We don't have the per-volunteer schedule pre-loaded here; the
  // not-busy check works against assignments fetched separately. Until that
  // wire-up, treat the volunteer as never busy. We still surface role and
  // availability mismatches, which is the primary filter.
  void v;
  void missionsByID;
  return [];
}
