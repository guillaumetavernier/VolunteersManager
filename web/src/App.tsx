import { QueryClientProvider } from "@tanstack/react-query";

import { EventInitWizard } from "@/features/event/EventInitWizard";
import {
  eventRegion,
  useEvent,
  useTileDownloadStatus,
} from "@/features/event/hooks";
import { MapView } from "@/features/map/MapView";
import { RaceDetail } from "@/features/race/RaceDetail";
import { RaceList } from "@/features/race/RaceList";
import { VolunteerList } from "@/features/volunteer/VolunteerList";
import { VolunteerDetail } from "@/features/volunteer/VolunteerDetail";
import { CsvImportWizard } from "@/features/volunteer/CsvImportWizard";
import { CarList } from "@/features/car/CarList";
import { matchRoute, useRoute } from "@/lib/router";
import { queryClient } from "@/lib/queryClient";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRouter />
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
  return <Routes region={region} />;
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
  return <MapShell region={region} />;
}

function MapShell({ region }: { region: string }) {
  const status = useTileDownloadStatus(true);
  return (
    <>
      <MapView region={region} />
      <nav className="absolute top-4 right-4 z-10 flex gap-2 rounded-md bg-white/90 px-3 py-2 text-sm shadow">
        <button onClick={() => (window.location.hash = "/races")} className="underline">
          Courses
        </button>
        <button onClick={() => (window.location.hash = "/volunteers")} className="underline">
          Bénévoles
        </button>
        <button onClick={() => (window.location.hash = "/cars")} className="underline">
          Véhicules
        </button>
      </nav>
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
