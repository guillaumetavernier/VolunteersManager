import { CarDetail } from "@/features/car/CarDetail";
import { CarList } from "@/features/car/CarList";
import { CsvImportWizard } from "@/features/volunteer/CsvImportWizard";
import { VolunteerDetail } from "@/features/volunteer/VolunteerDetail";
import { VolunteerList } from "@/features/volunteer/VolunteerList";
import { navigate } from "@/lib/router";

export type RessourcesMode =
  | { kind: "benevoles" }
  | { kind: "benevole-detail"; id: number }
  | { kind: "benevoles-import" }
  | { kind: "vehicules" }
  | { kind: "vehicule-detail"; id: number };

interface Props {
  mode: RessourcesMode;
}

export function RessourcesPage({ mode }: Props) {
  const activeTab: "benevoles" | "vehicules" =
    mode.kind === "vehicules" || mode.kind === "vehicule-detail"
      ? "vehicules"
      : "benevoles";

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
      <nav
        className="flex gap-1 border-b border-slate-200 px-4 pt-3"
        role="tablist"
        aria-label="Ressources"
      >
        <TabButton
          active={activeTab === "benevoles"}
          onClick={() => navigate("/ressources/benevoles")}
          testid="ressources-tab-benevoles"
        >
          Bénévoles
        </TabButton>
        <TabButton
          active={activeTab === "vehicules"}
          onClick={() => navigate("/ressources/vehicules")}
          testid="ressources-tab-vehicules"
        >
          Véhicules
        </TabButton>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Body mode={mode} />
      </div>
    </div>
  );
}

function TabButton({
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

function Body({ mode }: { mode: RessourcesMode }) {
  if (mode.kind === "benevoles-import") return <CsvImportWizard />;
  if (mode.kind === "benevole-detail") return <VolunteerDetail id={mode.id} />;
  if (mode.kind === "vehicule-detail") return <CarDetail id={mode.id} />;
  if (mode.kind === "vehicules") {
    return <CarList onSelect={(id) => navigate(`/ressources/vehicules/${id}`)} />;
  }
  return <VolunteerList onSelect={(id) => navigate(`/ressources/benevoles/${id}`)} />;
}
