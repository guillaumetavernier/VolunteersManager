import { useState } from "react";

import { SidebarFrame } from "@/components/sidebar/SidebarFrame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TransportNeedsList } from "@/features/trip/TransportNeedsList";
import { TripEditor } from "@/features/trip/TripEditor";
import { TripList } from "@/features/trip/TripList";
import { MatrixView } from "@/features/travelMatrix/MatrixView";
import { navigate } from "@/lib/router";

export type TrajetsFrame =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "detail"; id: number };

interface Props {
  frame: TrajetsFrame;
}

export function TrajetsToolSidebar({ frame }: Props) {
  if (frame.kind === "new") {
    return (
      <SidebarFrame
        title="Nouveau trajet"
        onBack={() => navigate("/trajets")}
        testid="sidebar-trajets-editor"
      >
        <div className="p-3">
          <TripEditor />
        </div>
      </SidebarFrame>
    );
  }
  if (frame.kind === "detail") {
    return (
      <SidebarFrame
        title={`Trajet n°${frame.id}`}
        onBack={() => navigate("/trajets")}
        testid="sidebar-trajets-editor"
      >
        <div className="p-3">
          <TripEditor id={frame.id} />
        </div>
      </SidebarFrame>
    );
  }
  return <ListFrame />;
}

function ListFrame() {
  const [mode, setMode] = useState<"trips" | "besoins">("trips");
  const [matrixOpen, setMatrixOpen] = useState(false);
  return (
    <SidebarFrame
      title="Trajets"
      testid="sidebar-trajets-list"
      actions={
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setMatrixOpen(true)}
          data-action="open-matrix"
        >
          Voir matrice
        </Button>
      }
    >
      <div className="grid gap-3 p-3">
        <nav
          className="grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 text-sm"
          role="tablist"
          aria-label="Mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "trips"}
            data-trajets-mode="trips"
            onClick={() => setMode("trips")}
            className={`px-3 py-1 ${
              mode === "trips" ? "bg-primary text-primary-foreground" : "bg-white text-slate-700"
            }`}
          >
            Trajets
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "besoins"}
            data-trajets-mode="besoins"
            onClick={() => setMode("besoins")}
            className={`px-3 py-1 ${
              mode === "besoins" ? "bg-primary text-primary-foreground" : "bg-white text-slate-700"
            }`}
          >
            Besoins
          </button>
        </nav>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => navigate("/trajets/new")}
            data-action="new-trip"
          >
            Nouveau trajet
          </Button>
        </div>
        {mode === "trips" ? <TripList /> : <TransportNeedsList />}
      </div>
      <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
        <DialogContent className="max-w-5xl" data-testid="matrix-dialog">
          <DialogHeader>
            <DialogTitle>Matrice de trajets</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <MatrixView />
          </div>
        </DialogContent>
      </Dialog>
    </SidebarFrame>
  );
}
