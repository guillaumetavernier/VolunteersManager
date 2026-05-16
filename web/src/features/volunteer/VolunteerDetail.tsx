import { navigate } from "@/lib/router";
import { useVolunteer } from "./hooks";
import { VolunteerForm } from "./VolunteerForm";

export function VolunteerDetail({ id }: { id: number }) {
  const q = useVolunteer(id);
  if (q.isLoading) return <main className="p-6">Chargement…</main>;
  if (!q.data)
    return (
      <main className="p-6 text-sm text-red-700">
        Introuvable.{" "}
        <button className="underline" onClick={() => navigate("/volunteers")}>
          Retour à la liste
        </button>
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate("/volunteers")} className="text-sm text-slate-600 underline">
          ← Tous les bénévoles
        </button>
      </header>
      <h1 className="mb-4 text-2xl font-semibold">
        {q.data.first_name} {q.data.last_name}
      </h1>
      <VolunteerForm existing={q.data} onSaved={() => navigate("/volunteers")} />
    </main>
  );
}
