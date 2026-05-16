import { QueryClientProvider } from "@tanstack/react-query";

import { AppShell } from "@/components/shell/AppShell";
import { MapWorkspace } from "@/components/shell/MapWorkspace";
import { classify, type AppRoute } from "@/components/shell/routes";
import { AffectationsPage } from "@/features/affectations/AffectationsPage";
import {
  eventRegion,
  useEvent,
} from "@/features/event/hooks";
import { EventInitWizard } from "@/features/event/EventInitWizard";
import { RessourcesPage } from "@/features/ressources/RessourcesPage";
import { GenerateRoadbooksPage } from "@/features/roadbook/GenerateRoadbooksPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { IssuesPanel } from "@/features/warnings/IssuesPanel";
import { installWarningsBridge } from "@/lib/mutationResponse";
import { queryClient } from "@/lib/queryClient";
import { useRoute } from "@/lib/router";
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
  const route = classify(useRoute());
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
    <AppShell isMap={route.kind === "map"} tool={route.kind === "map" ? route.tool : undefined}>
      <Body route={route} region={region} />
    </AppShell>
  );
}

function Body({ route, region }: { route: AppRoute; region: string }) {
  if (route.kind === "issues") {
    return <IssuesPanel />;
  }
  if (route.kind === "header") {
    switch (route.page) {
      case "affectations":
        return <AffectationsPage />;
      case "benevoles":
        return <RessourcesPage mode={{ kind: "benevoles" }} />;
      case "benevole-detail":
        return (
          <RessourcesPage
            mode={{ kind: "benevole-detail", id: Number(route.param) }}
          />
        );
      case "benevoles-import":
        return <RessourcesPage mode={{ kind: "benevoles-import" }} />;
      case "vehicules":
        return <RessourcesPage mode={{ kind: "vehicules" }} />;
      case "vehicule-detail":
        return (
          <RessourcesPage
            mode={{ kind: "vehicule-detail", id: Number(route.param) }}
          />
        );
      case "roadbooks":
        return <GenerateRoadbooksPage />;
      case "parametres":
        return <SettingsPage />;
    }
  }
  return <MapWorkspace region={region} tool={route.tool} sub={route.sub} />;
}

function FullScreenStatus({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center text-slate-700">
      {message}
    </main>
  );
}
