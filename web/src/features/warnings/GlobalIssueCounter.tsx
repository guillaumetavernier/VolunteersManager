import { topSeverity, useWarnings } from "./hooks";

const SEVERITY_CLASS: Record<string, string> = {
  error: "bg-red-600 text-white",
  warn: "bg-amber-500 text-white",
  info: "bg-blue-500 text-white",
};

export function GlobalIssueCounter() {
  const { data } = useWarnings();
  const ws = data ?? [];
  if (ws.length === 0) {
    return (
      <button
        onClick={() => (window.location.hash = "/issues")}
        className="rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-700"
        data-testid="global-issue-counter"
        data-count="0"
      >
        Aucun problème
      </button>
    );
  }
  const sev = topSeverity(ws) ?? "info";
  const cls = SEVERITY_CLASS[sev] ?? SEVERITY_CLASS.info;
  return (
    <button
      onClick={() => (window.location.hash = "/issues")}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${cls}`}
      data-testid="global-issue-counter"
      data-count={ws.length}
    >
      {ws.length} problème{ws.length > 1 ? "s" : ""}
    </button>
  );
}
