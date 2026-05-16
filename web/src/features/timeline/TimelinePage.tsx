import { TimelineControls } from "./TimelineControls";
import { TimelineMap } from "./TimelineMap";
import { TimelineView } from "./TimelineView";
import { useTimelineData } from "./useTimelineData";

interface Props {
  region: string;
}

export function TimelinePage({ region }: Props) {
  const data = useTimelineData();
  if (data.loading) {
    return (
      <main className="grid h-[80vh] place-items-center text-slate-500">Chargement de la chronologie…</main>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <TimelineControls data={data} />
      <div className="flex-1">
        <TimelineMap region={region} data={data} />
      </div>
      <div className="overflow-x-auto border-t border-slate-200 bg-white">
        <TimelineView data={data} />
      </div>
    </div>
  );
}
