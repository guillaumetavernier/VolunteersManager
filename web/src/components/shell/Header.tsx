import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { recallTool, toolRoot } from "./routes";
import { WarningsSlideOver } from "./WarningsSlideOver";

interface Props {
  isMap: boolean;
}

export function Header({ isMap }: Props) {
  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 py-2 text-sm shadow-sm"
      data-testid="app-header"
      data-route-kind={isMap ? "map" : "header"}
    >
      <nav className="flex items-center gap-1" aria-label="Navigation principale">
        <Button
          variant="ghost"
          size="sm"
          data-testid="header-logo"
          onClick={() => navigate(toolRoot(recallTool()))}
          aria-label="Carte"
        >
          <span className="font-semibold">VolunteersManager</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="header-affectations"
          onClick={() => navigate("/affectations")}
        >
          Affectations
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="header-ressources"
          onClick={() => navigate("/ressources/benevoles")}
        >
          Ressources
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="header-roadbooks"
          onClick={() => navigate("/roadbooks")}
        >
          Roadbooks
        </Button>
        <Button
          variant="ghost"
          size="sm"
          data-testid="header-parametres"
          onClick={() => navigate("/parametres")}
          aria-label="Paramètres"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </nav>
      <WarningsSlideOver />
    </header>
  );
}
