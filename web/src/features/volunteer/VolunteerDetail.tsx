import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { useAssignmentsForVolunteer } from "@/features/assignment/hooks";
import type { Assignment } from "@/features/assignment/api";
import { useMissions } from "@/features/mission/hooks";
import type { Mission } from "@/features/mission/api";
import { useVSList } from "@/features/vs/hooks";

import { useVolunteer } from "./hooks";
import { VolunteerForm } from "./VolunteerForm";

export function VolunteerDetail({ id, onBack }: { id: number; onBack?: () => void }) {
  const q = useVolunteer(id);
  const assignments = useAssignmentsForVolunteer(id);
  const missions = useMissions();
  const vs = useVSList();

  if (q.isLoading) return <main className="p-6">Chargement…</main>;
  if (!q.data)
    return (
      <main className="p-6 text-sm text-red-700">
        Introuvable.{" "}
        {onBack && (
          <Button variant="link" size="sm" onClick={onBack}>
            Retour
          </Button>
        )}
      </main>
    );

  const missionByID = new Map((missions.data ?? []).map((m) => [m.id, m] as const));
  const vsByID = new Map((vs.data ?? []).map((v) => [v.id, v] as const));
  const sched: { assignment: Assignment; mission: Mission }[] = [];
  for (const a of assignments.data ?? []) {
    const m = missionByID.get(a.mission_id);
    if (m) sched.push({ assignment: a, mission: m });
  }
  sched.sort((a, b) => a.mission.start_time.localeCompare(b.mission.start_time));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">
        {q.data.first_name} {q.data.last_name}
      </h1>
      <section className="mb-6 rounded-md border border-slate-200 p-4" data-assignments-section>
        <h2 className="mb-2 text-lg font-semibold">Planning</h2>
        {sched.length === 0 && (
          <p className="text-sm text-slate-500">Aucune mission pour l'instant.</p>
        )}
        <ul className="grid gap-1 text-sm">
          {sched.map(({ assignment, mission }) => {
            const v = vsByID.get(mission.vs_id);
            return (
              <li key={assignment.id} className="flex items-center justify-between rounded border border-slate-100 px-2 py-1" data-assignment-id={assignment.id}>
                <span>
                  J{mission.day} · {mission.start_time.slice(11, 16)}–{mission.end_time.slice(11, 16)} ·{" "}
                  <strong>{mission.role_type}</strong>
                  {v ? ` · ${v.name}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <VolunteerForm existing={q.data} onSaved={() => navigate("/volunteers")} />
    </main>
  );
}
