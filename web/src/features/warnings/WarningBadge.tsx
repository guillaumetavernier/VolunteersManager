import { filterByEntity, topSeverity, useWarnings } from "./hooks";
import type { EntityRef } from "./api";

const SEVERITY_CLASS: Record<string, string> = {
  error: "bg-red-600 text-white",
  warn: "bg-amber-500 text-white",
  info: "bg-blue-500 text-white",
};

export interface WarningBadgeProps {
  entity: EntityRef;
  className?: string;
}

export function WarningBadge({ entity, className = "" }: WarningBadgeProps) {
  const { data } = useWarnings();
  const matches = filterByEntity(data, entity);
  if (matches.length === 0) return null;
  const sev = topSeverity(matches) ?? "info";
  const cls = SEVERITY_CLASS[sev] ?? SEVERITY_CLASS.info;
  return (
    <span
      data-testid="warning-badge"
      data-severity={sev}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold ${cls} ${className}`}
      title={matches.map((m) => m.message).join("\n")}
    >
      {matches.length}
    </span>
  );
}
