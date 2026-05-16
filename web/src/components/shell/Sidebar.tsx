import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function Sidebar({ children }: Props) {
  return (
    <aside
      className="flex h-full w-[380px] shrink-0 flex-col border-l border-slate-200 bg-white"
      data-testid="map-sidebar"
    >
      {children}
    </aside>
  );
}
