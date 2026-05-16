import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { EventInitWizard } from "@/features/event/EventInitWizard";
import {
  eventRegion,
  useEvent,
  useTileDownloadStatus,
} from "@/features/event/hooks";
import { MapView } from "@/features/map/MapView";
import { MapDrawer, type DrawerFrame } from "@/features/map/MapDrawer";
import { RaceDetail } from "@/features/race/RaceDetail";
import { RaceList } from "@/features/race/RaceList";
import { VolunteerList } from "@/features/volunteer/VolunteerList";
import { VolunteerDetail } from "@/features/volunteer/VolunteerDetail";
import { CsvImportWizard } from "@/features/volunteer/CsvImportWizard";
import { CarList } from "@/features/car/CarList";
import { MissionsGrid } from "@/features/mission/MissionsGrid";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { TripList } from "@/features/trip/TripList";
import { TripEditor } from "@/features/trip/TripEditor";
import { TransportNeedsList } from "@/features/trip/TransportNeedsList";
import { MatrixView } from "@/features/travelMatrix/MatrixView";
import { TimelinePage } from "@/features/timeline/TimelinePage";
import { GenerateRoadbooksPage } from "@/features/roadbook/GenerateRoadbooksPage";
import { RoadbookSettingsPage } from "@/features/roadbook/RoadbookSettingsPage";
import { ArchivePage } from "@/features/archive/ArchivePage";
import { BackupSettingsPage } from "@/features/archive/BackupSettingsPage";
import { GlobalIssueCounter } from "@/features/warnings/GlobalIssueCounter";
import { IssuesPanel } from "@/features/warnings/IssuesPanel";
import { matchRoute, useRoute } from "@/lib/router";
import { queryClient } from "@/lib/queryClient";
import { installWarningsBridge } from "@/lib/mutationResponse";
import { ToastViewport } from "@/lib/toast";

installWarningsBridge(queryClient);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
      <ToastViewport />
    </QueryClientProvider>
  );
}

function AppRouter() {
  const ev = useEvent();
  if (ev.isLoading) {
    return <FullScreenStatus message="Loading…" />;
  }
  if (!ev.data) {
    return <EventInitWizard />;
  }
  const region = eventRegion(ev.data);
  if (!region) {
    return (
      <FullScreenStatus message="Event initialized without a tile region. Re-run the wizard or set settings.region manually." />
    );
  }
  return (
    <AppShell>
      <Routes region={region} />
    </AppShell>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header
        className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-2 text-sm shadow-sm"
        data-testid="app-header"
      >
        <nav className="flex items-center gap-1">
          <Button variant="ghost" onClick={() => (window.location.hash = "/")}>
            Carte
          </Button>
          <Button variant="ghost" onClick={() => (window.location.hash = "/timeline")}>
            Chronologie
          </Button>
          <Button variant="ghost" onClick={() => (window.location.hash = "/roadbooks")}>
            Roadbooks
          </Button>
          <Button variant="ghost" onClick={() => (window.location.hash = "/settings/roadbook")}>
            Paramètres
          </Button>
          <Button variant="ghost" onClick={() => (window.location.hash = "/settings/backup")}>
            Sauvegarde
          </Button>
        </nav>
        <GlobalIssueCounter />
      </header>
      <main className="relative flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function Routes({ region }: { region: string }) {
  const route = useRoute();

  const raceMatch = matchRoute("/races/:id", route.path);
  if (raceMatch && raceMatch.id) {
    const id = Number(raceMatch.id);
    if (Number.isFinite(id) && id > 0) {
      return <RaceDetail raceID={id} />;
    }
  }
  if (matchRoute("/races", route.path)) {
    return <RaceList />;
  }
  if (matchRoute("/volunteers/import", route.path)) {
    return <CsvImportWizard />;
  }
  const volMatch = matchRoute("/volunteers/:id", route.path);
  if (volMatch && volMatch.id) {
    const id = Number(volMatch.id);
    if (Number.isFinite(id) && id > 0) {
      return <VolunteerDetail id={id} />;
    }
  }
  if (matchRoute("/volunteers", route.path)) {
    return <VolunteerList />;
  }
  if (matchRoute("/cars", route.path)) {
    return <CarList />;
  }
  if (matchRoute("/missions/grid", route.path)) {
    return <MissionsGrid />;
  }
  // Trip routes (order: most specific first; strip ?query from path for new).
  const path = route.path.split("?")[0];
  if (path === "/trips/new") {
    return <TripEditor />;
  }
  const tripMatch = matchRoute("/trips/:id", path);
  if (tripMatch && tripMatch.id) {
    const id = Number(tripMatch.id);
    if (Number.isFinite(id) && id > 0) {
      return <TripEditor id={id} />;
    }
  }
  if (path === "/trips") {
    return <TripList />;
  }
  const tnMatch = matchRoute("/transport-needs/:day", path);
  if (tnMatch && tnMatch.day) {
    const d = Number(tnMatch.day);
    return <TransportNeedsList day={Number.isFinite(d) ? d : undefined} />;
  }
  if (path === "/transport-needs") {
    return <TransportNeedsList />;
  }
  if (path === "/travel-times") {
    return <MatrixView />;
  }
  if (path === "/timeline") {
    return <TimelinePage region={region} />;
  }
  if (path === "/settings/roadbook") {
    return <RoadbookSettingsPage />;
  }
  if (path === "/settings/archive") {
    return <ArchivePage />;
  }
  if (path === "/settings/backup") {
    return <BackupSettingsPage />;
  }
  if (path === "/roadbooks") {
    return <GenerateRoadbooksPage />;
  }
  if (matchRoute("/issues", route.path)) {
    return <IssuesPanel />;
  }
  return <MapShell region={region} />;
}

function MapShell({ region }: { region: string }) {
  const status = useTileDownloadStatus(true);
  const [stack, setStack] = useState<DrawerFrame[]>([]);
  return (
    <>
      <MapView region={region} />
      {stack.length === 0 && (
        <div className="absolute top-4 right-16 z-10">
          <Button
            data-testid="map-drawer-open-races"
            variant="default"
            onClick={() => setStack([{ kind: "list", tab: "races" }])}
          >
            Ouvrir le panneau
          </Button>
        </div>
      )}
      {stack.length > 0 && (
        <MapDrawer
          stack={stack}
          onPush={(f) => setStack((s) => [...s, f])}
          onPop={() => setStack((s) => s.slice(0, -1))}
          onSwitchTab={(tab) =>
            setStack((s) => [...s.slice(0, -1), { kind: "list", tab }])
          }
          onClose={() => setStack([])}
        />
      )}
      {status.data?.state === "downloading" && (
        <div className="pointer-events-none absolute bottom-4 right-4 rounded-md bg-slate-900/90 px-4 py-2 text-sm text-white shadow">
          Downloading tiles… {fmtBytes(status.data.bytes_downloaded)}
          {status.data.bytes_total > 0 ? ` / ${fmtBytes(status.data.bytes_total)}` : ""}
        </div>
      )}
    </>
  );
}

function FullScreenStatus({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center text-slate-700">
      {message}
    </main>
  );
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
