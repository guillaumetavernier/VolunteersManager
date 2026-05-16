import { SidebarFrame } from "@/components/sidebar/SidebarFrame";
import { RaceDetail } from "@/features/race/RaceDetail";
import { RaceList } from "@/features/race/RaceList";
import { useRaces } from "@/features/race/hooks";
import { navigate } from "@/lib/router";

export type CoursesFrame = { kind: "list" } | { kind: "detail"; id: number };

interface Props {
  frame: CoursesFrame;
}

export function CoursesToolSidebar({ frame }: Props) {
  if (frame.kind === "detail") return <DetailFrame id={frame.id} />;
  return (
    <SidebarFrame title="Courses" testid="sidebar-courses-list">
      <div className="p-3">
        <RaceList onSelect={(id) => navigate(`/courses/${id}`)} />
      </div>
    </SidebarFrame>
  );
}

function DetailFrame({ id }: { id: number }) {
  const races = useRaces();
  const r = (races.data ?? []).find((x) => x.id === id);
  return (
    <SidebarFrame
      title={r?.name ?? `Course #${id}`}
      onBack={() => navigate("/courses")}
      testid="sidebar-courses-detail"
    >
      <RaceDetail raceID={id} onBack={() => navigate("/courses")} />
    </SidebarFrame>
  );
}
