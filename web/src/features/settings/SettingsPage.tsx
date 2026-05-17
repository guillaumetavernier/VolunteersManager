import { ArchivePage } from "@/features/archive/ArchivePage";
import { BackupSettingsPage } from "@/features/archive/BackupSettingsPage";
import { EventSettingsPage } from "@/features/event/EventSettingsPage";
import { RoadbookSettingsPage } from "@/features/roadbook/RoadbookSettingsPage";
import { navigate, useRoute } from "@/lib/router";

type Tab = "evenement" | "roadbook" | "donnees";

function readTab(path: string): Tab {
  const q = path.split("?")[1];
  if (!q) return "evenement";
  const v = new URLSearchParams(q).get("tab");
  if (v === "roadbook" || v === "donnees" || v === "evenement") return v;
  return "evenement";
}

export function SettingsPage() {
  const route = useRoute();
  const tab = readTab(route.path);
  const setTab = (next: Tab) =>
    navigate(next === "evenement" ? "/parametres" : `/parametres?tab=${next}`);
  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col" data-testid="settings-page">
      <nav
        className="flex gap-1 border-b border-slate-200 px-4 pt-3"
        role="tablist"
        aria-label="Paramètres"
      >
        <TabBtn
          active={tab === "evenement"}
          onClick={() => setTab("evenement")}
          testid="settings-tab-evenement"
        >
          Événement
        </TabBtn>
        <TabBtn
          active={tab === "roadbook"}
          onClick={() => setTab("roadbook")}
          testid="settings-tab-roadbook"
        >
          Roadbook
        </TabBtn>
        <TabBtn
          active={tab === "donnees"}
          onClick={() => setTab("donnees")}
          testid="settings-tab-donnees"
        >
          Données
        </TabBtn>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "evenement" ? (
          <EventSettingsPage />
        ) : tab === "roadbook" ? (
          <RoadbookSettingsPage />
        ) : (
          <DonneesPanel />
        )}
      </div>
    </div>
  );
}

function DonneesPanel() {
  return (
    <div data-testid="settings-donnees">
      <BackupSettingsPage />
      <ArchivePage />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testid}
      onClick={onClick}
      className={`rounded-t-md border border-b-0 px-4 py-2 text-sm ${
        active
          ? "border-slate-200 bg-white font-semibold text-slate-900"
          : "border-transparent text-slate-500 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}
