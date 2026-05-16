import { SidebarFrame } from "@/components/sidebar/SidebarFrame";
import { Button } from "@/components/ui/button";
import { MissionsForVSView } from "@/features/mission/MissionsForVSView";
import { useRaces } from "@/features/race/hooks";
import { useVSList } from "@/features/vs/hooks";
import { makeDraft, VSForm, type DraftVS } from "@/features/vs/VSForm";
import { navigate } from "@/lib/router";

export type VSToolFrame =
  | { kind: "list" }
  | { kind: "detail"; id: number }
  | { kind: "missions"; id: number }
  | { kind: "draft"; draft: DraftVS };

interface Props {
  frame: VSToolFrame;
  onPush: (f: VSToolFrame) => void;
  onPop: () => void;
  onReset: () => void;
}

export function VSToolSidebar({ frame, onPush, onPop, onReset }: Props) {
  if (frame.kind === "list") {
    return <ListFrame onSelect={(id) => navigate(`/vs/${id}`)} />;
  }
  if (frame.kind === "draft") {
    return (
      <SidebarFrame title="Nouveau PB" onBack={onPop} testid="sidebar-vs-draft">
        <VSForm
          draft={frame.draft}
          onSaved={(v) => navigate(`/vs/${v.id}`)}
          onCancel={onReset}
        />
      </SidebarFrame>
    );
  }
  if (frame.kind === "missions") {
    return <MissionsFrame id={frame.id} onBack={onPop} />;
  }
  return <DetailFrame id={frame.id} onBack={() => navigate("/vs")} onPush={onPush} />;
}

function ListFrame({ onSelect }: { onSelect: (id: number) => void }) {
  const vs = useVSList();
  const races = useRaces();

  return (
    <SidebarFrame title="Points bénévoles" testid="sidebar-vs-list">
      <div className="grid gap-2 p-3">
        <p className="text-xs text-slate-500">
          Cliquez sur la carte pour créer un PB, ou sur un marker pour l'éditer.
        </p>
        {vs.isLoading && <p className="text-sm">Chargement…</p>}
        {!vs.isLoading && (vs.data?.length ?? 0) === 0 && (
          <p className="text-sm text-slate-600">Aucun PB pour l'instant.</p>
        )}
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {(vs.data ?? [])
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() => onSelect(v.id)}
                  data-vs-row={v.id}
                >
                  <span className="font-medium">{v.name}</span>
                  <span className="text-xs text-slate-500">
                    {v.lat.toFixed(4)}, {v.lon.toFixed(4)}
                  </span>
                </button>
              </li>
            ))}
        </ul>
        {races.data && races.data.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {races.data.length} course{races.data.length > 1 ? "s" : ""} dans cet événement.
          </p>
        )}
      </div>
    </SidebarFrame>
  );
}

function DetailFrame({
  id,
  onBack,
  onPush,
}: {
  id: number;
  onBack: () => void;
  onPush: (f: VSToolFrame) => void;
}) {
  const vs = useVSList();
  const v = (vs.data ?? []).find((x) => x.id === id);
  if (!v) {
    return (
      <SidebarFrame title={`PB #${id}`} onBack={onBack} testid="sidebar-vs-detail">
        <p className="p-4 text-sm text-slate-500">Chargement…</p>
      </SidebarFrame>
    );
  }
  return (
    <SidebarFrame
      title={v.name}
      onBack={onBack}
      testid="sidebar-vs-detail"
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onPush({ kind: "missions", id: v.id })}
          data-action="open-missions"
        >
          Missions
        </Button>
      }
    >
      <VSForm draft={makeDraft(v)} onDeleted={onBack} />
    </SidebarFrame>
  );
}

function MissionsFrame({ id, onBack }: { id: number; onBack: () => void }) {
  const vs = useVSList();
  const v = (vs.data ?? []).find((x) => x.id === id);
  if (!v) {
    return (
      <SidebarFrame title={`Missions PB #${id}`} onBack={onBack} testid="sidebar-vs-missions">
        <p className="p-4 text-sm text-slate-500">Chargement…</p>
      </SidebarFrame>
    );
  }
  return (
    <SidebarFrame
      title={`Missions · ${v.name}`}
      onBack={onBack}
      testid="sidebar-vs-missions"
    >
      <MissionsForVSView vs={v} />
    </SidebarFrame>
  );
}
