import { QueryClientProvider } from "@tanstack/react-query";

import { EventInitWizard } from "@/features/event/EventInitWizard";
import {
  eventRegion,
  useEvent,
  useTileDownloadStatus,
} from "@/features/event/hooks";
import { MapView } from "@/features/map/MapView";
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
  return <MapShell region={region} />;
}

function MapShell({ region }: { region: string }) {
  // Once the event exists, the tile download may still be in progress. Poll
  // and tell the user. The MapView mounts immediately so the UI is responsive,
  // and the user sees the missing-tiles banner if the file isn't there yet.
  const status = useTileDownloadStatus(true);
  return (
    <>
      <MapView region={region} />
      {status.data?.state === "downloading" && (
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-md bg-slate-900/90 px-4 py-2 text-sm text-white shadow">
          Downloading tiles… {fmtBytes(status.data.bytes_downloaded)}
          {status.data.bytes_total > 0
            ? ` / ${fmtBytes(status.data.bytes_total)}`
            : ""}
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
