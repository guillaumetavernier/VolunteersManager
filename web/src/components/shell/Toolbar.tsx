import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";

import { rememberTool, toolRoot, type Tool } from "./routes";

interface Props {
  active: Tool;
}

const TABS: { id: Tool; label: string }[] = [
  { id: "vs", label: "PB" },
  { id: "trajets", label: "Trajets" },
  { id: "chronologie", label: "Chronologie" },
  { id: "courses", label: "Courses" },
];

export function Toolbar({ active }: Props) {
  return (
    <nav
      className="flex items-center justify-center gap-1 border-b border-slate-200 bg-white px-4 py-1 text-sm"
      data-testid="map-toolbar"
      role="tablist"
      aria-label="Outil carte"
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Button
            key={t.id}
            type="button"
            role="tab"
            variant={isActive ? "default" : "ghost"}
            size="sm"
            aria-selected={isActive}
            data-tool={t.id}
            data-active={isActive ? "true" : undefined}
            onClick={() => {
              rememberTool(t.id);
              navigate(toolRoot(t.id));
            }}
          >
            {t.label}
          </Button>
        );
      })}
    </nav>
  );
}
