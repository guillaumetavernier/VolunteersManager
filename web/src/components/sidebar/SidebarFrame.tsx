import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

interface Props {
  title: ReactNode;
  onBack?: () => void;
  actions?: ReactNode;
  children: ReactNode;
  testid?: string;
}

export function SidebarFrame({ title, onBack, actions, children, testid }: Props) {
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      data-testid={testid ?? "sidebar-frame"}
    >
      <header className="flex items-center gap-2 border-b border-slate-200 px-3 py-2">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            data-testid="sidebar-back"
          >
            ← Retour
          </Button>
        )}
        <h2 className="flex-1 truncate text-sm font-semibold text-slate-700">{title}</h2>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
    </section>
  );
}
