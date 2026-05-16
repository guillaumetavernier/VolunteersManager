import { SidebarFrame } from "@/components/sidebar/SidebarFrame";
import { TimelineControls } from "@/features/timeline/TimelineControls";
import type { TimelineData } from "@/features/timeline/useTimelineData";

interface Props {
  data: TimelineData;
}

export function ChronologieToolSidebar({ data }: Props) {
  return (
    <SidebarFrame title="Chronologie" testid="sidebar-chronologie">
      {data.loading ? (
        <p className="p-4 text-sm text-slate-500">Chargement de la chronologie…</p>
      ) : (
        <div className="grid gap-3 p-3">
          <TimelineControls data={data} />
          <p className="text-xs text-slate-500">
            Les bénévoles, coureurs et véhicules animent sur la carte au fil du curseur.
          </p>
        </div>
      )}
    </SidebarFrame>
  );
}
