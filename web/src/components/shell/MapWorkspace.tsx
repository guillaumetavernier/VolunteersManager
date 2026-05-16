import { useEffect, useMemo, useState } from "react";

import { Sidebar } from "./Sidebar";
import { LayersControl } from "./LayersControl";
import { rememberTool, type Tool, type MapSub } from "./routes";

import { useTileDownloadStatus } from "@/features/event/hooks";
import { MapView } from "@/features/map/MapView";
import { ChronologieToolSidebar } from "@/features/map/tools/ChronologieToolSidebar";
import { CoursesToolSidebar } from "@/features/map/tools/CoursesToolSidebar";
import { TrajetsToolSidebar } from "@/features/map/tools/TrajetsToolSidebar";
import { VSToolSidebar, type VSToolFrame } from "@/features/map/tools/VSToolSidebar";
import { usePushStack } from "@/components/sidebar/usePushStack";
import { TimelineMap } from "@/features/timeline/TimelineMap";
import { TimelineView } from "@/features/timeline/TimelineView";
import { useTimelineData } from "@/features/timeline/useTimelineData";
import type { VS } from "@/features/vs/api";
import { makeDraft } from "@/features/vs/VSForm";
import { navigate } from "@/lib/router";

interface Props {
  region: string;
  tool: Tool;
  sub: MapSub | undefined;
}

export function MapWorkspace({ region, tool, sub }: Props) {
  useEffect(() => {
    rememberTool(tool);
  }, [tool]);

  const [raceVisibility, setRaceVisibility] = useState<Record<number, boolean>>({});
  const onToggleRace = (id: number, visible: boolean) =>
    setRaceVisibility((s) => ({ ...s, [id]: visible }));

  if (tool === "chronologie") {
    return <ChronologieWorkspace region={region} />;
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-h-0 flex-1">
        <ToolMap
          region={region}
          tool={tool}
          sub={sub}
          raceVisibility={raceVisibility}
        />
        <LayersControl
          raceVisibility={raceVisibility}
          onToggleRace={onToggleRace}
        />
        <TileDownloadBadge />
      </div>
      <Sidebar>
        <ToolSidebar tool={tool} sub={sub} />
      </Sidebar>
    </div>
  );
}

function ToolMap({
  region,
  tool,
  sub,
  raceVisibility,
}: {
  region: string;
  tool: Tool;
  sub: MapSub | undefined;
  raceVisibility: Record<number, boolean>;
}) {
  const selectedVSID = useMemo(() => {
    if (sub?.tool === "vs" && sub.sub === "detail") return sub.id;
    return null;
  }, [sub]);

  function onClickEmpty(loc: { lat: number; lon: number }) {
    if (tool === "vs") {
      // Open the draft in the sidebar via state, but since each frame is
      // URL-driven we use the URL for stable selection. Drafts have no ID, so
      // we hold them in a window-scoped fallback: easier to stash in a state
      // up here via a custom event.
      window.dispatchEvent(
        new CustomEvent<{ lat: number; lon: number }>("vm:vs-draft", {
          detail: loc,
        }),
      );
    }
  }

  function onClickVS(vs: VS) {
    if (tool === "vs") {
      navigate(`/vs/${vs.id}`);
    } else if (tool === "trajets") {
      window.dispatchEvent(
        new CustomEvent<{ id: number }>("vm:trajets-vs-click", {
          detail: { id: vs.id },
        }),
      );
    } else if (tool === "courses") {
      // Courses tool: marker click doesn't navigate; the click panel is on the
      // race line itself. Fall through to a noop.
    }
  }

  return (
    <MapView
      region={region}
      onClickEmpty={onClickEmpty}
      onClickVS={onClickVS}
      selectedVSID={selectedVSID}
      raceVisibility={raceVisibility}
    />
  );
}

function ToolSidebar({ tool, sub }: { tool: Tool; sub: MapSub | undefined }) {
  if (tool === "vs") return <VSSidebarController sub={sub} />;
  if (tool === "trajets")
    return (
      <TrajetsToolSidebar
        frame={
          sub?.tool === "trajets" && sub.sub === "new"
            ? { kind: "new" }
            : sub?.tool === "trajets" && sub.sub === "detail"
              ? { kind: "detail", id: sub.id }
              : { kind: "list" }
        }
      />
    );
  if (tool === "courses")
    return (
      <CoursesToolSidebar
        frame={
          sub?.tool === "courses" && sub.sub === "detail"
            ? { kind: "detail", id: sub.id }
            : { kind: "list" }
        }
      />
    );
  return null;
}

function VSSidebarController({ sub }: { sub: MapSub | undefined }) {
  const stack = usePushStack<VSToolFrame>([]);

  // Sync URL → top of stack.
  useEffect(() => {
    if (sub?.tool === "vs" && sub.sub === "detail") {
      stack.reset([{ kind: "detail", id: sub.id }]);
    } else if (sub?.tool === "vs" && sub.sub === "list") {
      stack.reset([{ kind: "list" }]);
    } else {
      stack.reset([{ kind: "list" }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub?.tool === "vs" ? `${sub.sub}-${"id" in sub ? sub.id : "x"}` : "list"]);

  // Empty-click → push a draft frame.
  useEffect(() => {
    const onDraft = (e: Event) => {
      const ce = e as CustomEvent<{ lat: number; lon: number }>;
      stack.push({ kind: "draft", draft: makeDraft(null, ce.detail) });
    };
    window.addEventListener("vm:vs-draft", onDraft as EventListener);
    return () => window.removeEventListener("vm:vs-draft", onDraft as EventListener);
  }, [stack]);

  const top = stack.stack[stack.stack.length - 1] ?? { kind: "list" as const };

  return (
    <VSToolSidebar
      frame={top}
      onPush={stack.push}
      onPop={() => {
        if (top.kind === "detail") navigate("/vs");
        else if (top.kind === "missions") stack.pop();
        else if (top.kind === "draft") stack.pop();
      }}
      onReset={() => navigate("/vs")}
    />
  );
}

function ChronologieWorkspace({ region }: { region: string }) {
  const data = useTimelineData();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          {data.loading ? (
            <div className="grid h-full place-items-center text-sm text-slate-500">
              Chargement de la chronologie…
            </div>
          ) : (
            <TimelineMap region={region} data={data} />
          )}
          <TileDownloadBadge />
        </div>
        <Sidebar>
          <ChronologieToolSidebar data={data} />
        </Sidebar>
      </div>
      {!data.loading && (
        <div className="border-t border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <TimelineView data={data} />
          </div>
        </div>
      )}
    </div>
  );
}

function TileDownloadBadge() {
  const status = useTileDownloadStatus(true);
  if (status.data?.state !== "downloading") return null;
  return (
    <div className="pointer-events-none absolute bottom-4 right-4 rounded-md bg-slate-900/90 px-4 py-2 text-sm text-white shadow">
      Downloading tiles… {fmtBytes(status.data.bytes_downloaded)}
      {status.data.bytes_total > 0 ? ` / ${fmtBytes(status.data.bytes_total)}` : ""}
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
