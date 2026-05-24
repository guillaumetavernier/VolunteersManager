import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { Sidebar } from "./Sidebar";
import { LayersControl } from "./LayersControl";
import { rememberTool, type Tool, type MapSub } from "./routes";
import { useMapLayers } from "./useMapLayers";

import { useTileDownloadStatus } from "@/features/event/hooks";
import type { TileSource } from "@/features/map/style";
import { MapView } from "@/features/map/MapView";
import { ChronologieToolSidebar } from "@/features/map/tools/ChronologieToolSidebar";
import { CoursesToolSidebar } from "@/features/map/tools/CoursesToolSidebar";
import { TrajetsToolSidebar } from "@/features/map/tools/TrajetsToolSidebar";
import { VSToolSidebar, type VSToolFrame } from "@/features/map/tools/VSToolSidebar";
import { usePushStack } from "@/components/sidebar/usePushStack";
import { TimelineMap } from "@/features/timeline/TimelineMap";
import { TimelineView } from "@/features/timeline/TimelineView";
import { useGanttHeight } from "@/features/timeline/useGanttHeight";
import { useTimelineData } from "@/features/timeline/useTimelineData";
import type { VS } from "@/features/vs/api";
import { makeDraft } from "@/features/vs/VSForm";
import { navigate } from "@/lib/router";

const HANDLE_H = 4;

interface Props {
  source: TileSource;
  tool: Tool;
  sub: MapSub | undefined;
}

export function MapWorkspace({ source, tool, sub }: Props) {
  useEffect(() => {
    rememberTool(tool);
  }, [tool]);

  const raceVisibility = useMapLayers((s) => s.raceVisibility);
  const onToggleRace = useMapLayers((s) => s.toggleRace);

  if (tool === "chronologie") {
    return <ChronologieWorkspace source={source} />;
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-h-0 flex-1">
        <ToolMap
          source={source}
          tool={tool}
          sub={sub}
          raceVisibility={raceVisibility}
        />
        <LayersControl
          raceVisibility={raceVisibility}
          onToggleRace={onToggleRace}
        />
        {source.kind === "pmtiles" && <TileDownloadBadge />}
      </div>
      <Sidebar>
        <ToolSidebar tool={tool} sub={sub} />
      </Sidebar>
    </div>
  );
}

function ToolMap({
  source,
  tool,
  sub,
  raceVisibility,
}: {
  source: TileSource;
  tool: Tool;
  sub: MapSub | undefined;
  raceVisibility: Record<number, boolean>;
}) {
  const selectedVSID = useMemo(() => {
    if (sub?.tool === "vs" && sub.sub === "detail") return sub.id;
    return null;
  }, [sub]);
  const selectedRaceID = useMemo(() => {
    if (sub?.tool === "courses" && sub.sub === "detail") return sub.id;
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
      source={source}
      onClickEmpty={onClickEmpty}
      onClickVS={onClickVS}
      selectedVSID={selectedVSID}
      selectedRaceID={selectedRaceID}
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

function ChronologieWorkspace({ source }: { source: TileSource }) {
  const data = useTimelineData();
  const { heightPx, collapsed, setHeightPx, toggleCollapsed } = useGanttHeight();
  const effective = collapsed ? 80 : heightPx;
  const [contentH, setContentH] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          {data.loading ? (
            <div className="grid h-full place-items-center text-sm text-slate-500">
              Chargement de la chronologie…
            </div>
          ) : (
            <TimelineMap source={source} data={data} />
          )}
          {source.kind === "pmtiles" && <TileDownloadBadge />}
        </div>
        <Sidebar>
          <ChronologieToolSidebar data={data} />
        </Sidebar>
      </div>
      {!data.loading && (
        <ResizableTimelineContainer
          heightPx={effective}
          onResize={setHeightPx}
          onToggleCollapse={toggleCollapsed}
        >
          <ScrollableArea
            height={effective - HANDLE_H}
            contentH={contentH}
            onScroll={setScrollY}
          >
            <TimelineView
              data={data}
              height={effective - HANDLE_H}
              scrollY={scrollY}
              onContentHeightChange={setContentH}
            />
          </ScrollableArea>
        </ResizableTimelineContainer>
      )}
    </div>
  );
}

function ResizableTimelineContainer({
  heightPx,
  onResize,
  onToggleCollapse,
  children,
}: {
  heightPx: number;
  onResize: (px: number) => void;
  onToggleCollapse: () => void;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      dragRef.current = { startY: e.clientY, startH: heightPx };
      setDragging(true);
    },
    [heightPx],
  );

  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      onResize(d.startH + (d.startY - ev.clientY));
    }
    function onUp() {
      dragRef.current = null;
      setDragging(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, onResize]);

  return (
    <div
      style={{ height: heightPx }}
      className="flex flex-col border-t border-slate-200 bg-white"
    >
      <div
        data-testid="timeline-resize-handle"
        className="h-1 w-full cursor-row-resize bg-slate-200 hover:bg-slate-400"
        onMouseDown={onMouseDown}
        onDoubleClick={onToggleCollapse}
      />
      {children}
    </div>
  );
}

function ScrollableArea({
  height,
  contentH,
  onScroll,
  children,
}: {
  height: number;
  contentH: number;
  onScroll: (y: number) => void;
  children: ReactNode;
}) {
  return (
    <div
      data-testid="timeline-scroll"
      className="relative"
      style={{ height, overflow: "auto" }}
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
    >
      <div style={{ height: Math.max(height, contentH) }}>{children}</div>
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
