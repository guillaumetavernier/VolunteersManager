import { Button } from "@/components/ui/button";
import { CarDetail } from "@/features/car/CarDetail";
import { CarList } from "@/features/car/CarList";
import { useCars } from "@/features/car/hooks";
import { MissionsGrid } from "@/features/mission/MissionsGrid";
import { RaceDetail } from "@/features/race/RaceDetail";
import { RaceList } from "@/features/race/RaceList";
import { VolunteerDetail } from "@/features/volunteer/VolunteerDetail";
import { VolunteerList } from "@/features/volunteer/VolunteerList";
import { useRaces } from "@/features/race/hooks";
import { useVolunteers } from "@/features/volunteer/hooks";

export type MapDrawerTab = "races" | "volunteers" | "cars" | "missions";

export type DrawerFrame =
  | { kind: "list"; tab: MapDrawerTab }
  | { kind: "race"; id: number }
  | { kind: "volunteer"; id: number }
  | { kind: "car"; id: number };

export interface MapDrawerProps {
  stack: DrawerFrame[];
  onPush: (f: DrawerFrame) => void;
  onPop: () => void;
  onSwitchTab: (tab: MapDrawerTab) => void;
  onClose: () => void;
}

const TAB_LABELS: Record<MapDrawerTab, string> = {
  races: "Courses",
  volunteers: "Bénévoles",
  cars: "Véhicules",
  missions: "Grille",
};

export function MapDrawer({ stack, onPush, onPop, onSwitchTab, onClose }: MapDrawerProps) {
  const top = stack[stack.length - 1];
  if (!top) return null;

  return (
    <aside
      data-testid="map-drawer"
      className="absolute right-0 top-0 z-10 flex h-full w-[480px] max-w-full flex-col border-l border-slate-200 bg-white shadow-lg"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        {top.kind === "list" ? (
          <nav className="flex flex-wrap gap-1" role="tablist" aria-label="Vue">
            {(Object.keys(TAB_LABELS) as MapDrawerTab[]).map((tab) => (
              <Button
                key={tab}
                role="tab"
                variant={top.tab === tab ? "default" : "ghost"}
                size="sm"
                data-active={top.tab === tab ? "true" : undefined}
                data-drawer-tab={tab}
                aria-selected={top.tab === tab}
                onClick={() => onSwitchTab(tab)}
              >
                {TAB_LABELS[tab]}
              </Button>
            ))}
          </nav>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              data-testid="map-drawer-back"
              onClick={onPop}
            >
              ← Retour
            </Button>
            <Breadcrumb frame={top} />
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          data-testid="map-drawer-close"
          aria-label="Fermer"
          onClick={onClose}
        >
          ✕
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Body top={top} onPush={onPush} onPop={onPop} />
      </div>
    </aside>
  );
}

function Body({
  top,
  onPush,
  onPop,
}: {
  top: DrawerFrame;
  onPush: (f: DrawerFrame) => void;
  onPop: () => void;
}) {
  if (top.kind === "race") {
    return <RaceDetail raceID={top.id} onBack={onPop} />;
  }
  if (top.kind === "volunteer") {
    return <VolunteerDetail id={top.id} onBack={onPop} />;
  }
  if (top.kind === "car") {
    return <CarDetail id={top.id} onBack={onPop} />;
  }
  switch (top.tab) {
    case "races":
      return <RaceList onSelect={(id) => onPush({ kind: "race", id })} />;
    case "volunteers":
      return <VolunteerList onSelect={(id) => onPush({ kind: "volunteer", id })} />;
    case "cars":
      return <CarList onSelect={(id) => onPush({ kind: "car", id })} />;
    case "missions":
      return <MissionsGrid />;
  }
}

function Breadcrumb({ frame }: { frame: Exclude<DrawerFrame, { kind: "list" }> }) {
  if (frame.kind === "race") return <RaceCrumb id={frame.id} />;
  if (frame.kind === "volunteer") return <VolunteerCrumb id={frame.id} />;
  return <CarCrumb id={frame.id} />;
}

function RaceCrumb({ id }: { id: number }) {
  const races = useRaces();
  const r = (races.data ?? []).find((x) => x.id === id);
  return (
    <span className="text-sm text-slate-700">
      Courses / <strong>{r?.name ?? `#${id}`}</strong>
    </span>
  );
}

function VolunteerCrumb({ id }: { id: number }) {
  const vols = useVolunteers("all");
  const v = (vols.data ?? []).find((x) => x.id === id);
  const label = v ? `${v.first_name} ${v.last_name}` : `#${id}`;
  return (
    <span className="text-sm text-slate-700">
      Bénévoles / <strong>{label}</strong>
    </span>
  );
}

function CarCrumb({ id }: { id: number }) {
  const cars = useCars();
  const c = (cars.data ?? []).find((x) => x.id === id);
  return (
    <span className="text-sm text-slate-700">
      Véhicules / <strong>{c?.name ?? `#${id}`}</strong>
    </span>
  );
}
