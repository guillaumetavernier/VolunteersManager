import { useWarnings } from "./hooks";
import type { EntityRef, Warning, WarningKind } from "./api";

const KIND_LABEL: Record<WarningKind, string> = {
  double_booking: "Double affectation",
  role_mismatch: "Rôle non conforme",
  availability_violation: "Hors disponibilité",
  excessive_duty: "Service trop long",
  no_break: "Sans pause",
  understaffed: "Sous-staffé",
  overstaffed: "Sur-staffé",
  unassigned: "Sans mission",
  missing_phone_with_assignments: "Téléphone manquant",
  stranded: "Sans transport",
  insufficient_travel: "Temps de trajet insuffisant",
  capacity_exceeded: "Capacité dépassée",
  driver_double_book: "Conducteur occupé",
  passenger_double_book: "Passager occupé",
  board_without_alight: "Monte sans descendre",
  alight_before_board: "Descend avant de monter",
};

const SEVERITY_BADGE: Record<string, string> = {
  error: "bg-red-600 text-white",
  warn: "bg-amber-500 text-white",
  info: "bg-blue-500 text-white",
};

export function IssuesPanel() {
  const { data, isLoading, error } = useWarnings();
  if (isLoading) return <main className="p-6">Chargement…</main>;
  if (error) return <main className="p-6 text-red-700">Erreur de chargement.</main>;
  const ws = data ?? [];

  const grouped = new Map<WarningKind, Warning[]>();
  for (const w of ws) {
    const arr = grouped.get(w.kind) ?? [];
    arr.push(w);
    grouped.set(w.kind, arr);
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Problèmes ({ws.length})</h1>
        <button
          onClick={() => (window.location.hash = "/")}
          className="text-sm underline"
        >
          Retour
        </button>
      </header>
      {ws.length === 0 && (
        <p className="text-slate-600">Aucun problème détecté.</p>
      )}
      {Array.from(grouped.entries()).map(([kind, items]) => (
        <section key={kind} className="mb-6" data-testid={`group-${kind}`}>
          <h2 className="mb-2 text-sm font-semibold uppercase text-slate-600">
            {KIND_LABEL[kind] ?? kind} ({items.length})
          </h2>
          <ul className="divide-y rounded-md border bg-white">
            {items.map((w) => (
              <li
                key={w.id}
                className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-slate-50"
                onClick={() => navigateTo(w.entities)}
                data-testid={`warning-${w.id}`}
                data-kind={w.kind}
              >
                <span className="text-sm">{w.message}</span>
                <span
                  className={`ml-3 rounded-full px-2 py-0.5 text-xs ${SEVERITY_BADGE[w.severity] ?? ""}`}
                >
                  {w.severity}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

function navigateTo(ents: EntityRef[]) {
  // Prefer the first volunteer ref, otherwise first mission, otherwise nothing.
  const vol = ents.find((e) => e.type === "volunteer");
  if (vol) {
    window.location.hash = `/volunteers/${vol.id}`;
    return;
  }
  const miss = ents.find((e) => e.type === "mission");
  if (miss) {
    window.location.hash = `/missions/grid`;
    return;
  }
}
