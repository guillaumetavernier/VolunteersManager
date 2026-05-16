import { matchRoute, type Route } from "@/lib/router";

export type Tool = "vs" | "trajets" | "chronologie" | "courses";

export type AppRoute =
  | { kind: "map"; tool: Tool; sub?: MapSub; rawQuery: string }
  | { kind: "header"; page: HeaderPage; param?: string }
  | { kind: "issues" };

export type MapSub =
  | { tool: "vs"; sub: "list" }
  | { tool: "vs"; sub: "detail"; id: number }
  | { tool: "trajets"; sub: "list" }
  | { tool: "trajets"; sub: "new" }
  | { tool: "trajets"; sub: "detail"; id: number }
  | { tool: "chronologie" }
  | { tool: "courses"; sub: "list" }
  | { tool: "courses"; sub: "detail"; id: number };

export type HeaderPage =
  | "affectations"
  | "benevoles"
  | "benevole-detail"
  | "benevoles-import"
  | "vehicules"
  | "vehicule-detail"
  | "roadbooks"
  | "roadbooks-parametres"
  | "parametres";

const TOOL_KEY = "vm:last-tool";

export function rememberTool(t: Tool) {
  try {
    localStorage.setItem(TOOL_KEY, t);
  } catch {
    /* ignore quota / privacy mode */
  }
}

export function recallTool(): Tool {
  try {
    const v = localStorage.getItem(TOOL_KEY);
    if (v === "vs" || v === "trajets" || v === "chronologie" || v === "courses") return v;
  } catch {
    /* ignore */
  }
  return "courses";
}

export function classify(route: Route): AppRoute {
  const [path, rawQuery = ""] = route.path.split("?");

  // Issues fallback (slide-over has no public route, but /issues survives).
  if (path === "/issues") return { kind: "issues" };

  // Header pages.
  if (path === "/affectations") return { kind: "header", page: "affectations" };
  if (path === "/ressources/benevoles") return { kind: "header", page: "benevoles" };
  if (path === "/ressources/benevoles/import")
    return { kind: "header", page: "benevoles-import" };
  const benDetail = matchRoute("/ressources/benevoles/:id", path);
  if (benDetail?.id) return { kind: "header", page: "benevole-detail", param: benDetail.id };
  if (path === "/ressources/vehicules") return { kind: "header", page: "vehicules" };
  const vehDetail = matchRoute("/ressources/vehicules/:id", path);
  if (vehDetail?.id) return { kind: "header", page: "vehicule-detail", param: vehDetail.id };
  if (path === "/roadbooks") return { kind: "header", page: "roadbooks" };
  if (path === "/roadbooks/parametres") return { kind: "header", page: "roadbooks-parametres" };
  if (path === "/parametres") return { kind: "header", page: "parametres" };

  // Map / tool routes.
  if (path === "/" || path === "") {
    return { kind: "map", tool: recallTool(), rawQuery };
  }
  if (path === "/vs") return { kind: "map", tool: "vs", sub: { tool: "vs", sub: "list" }, rawQuery };
  const vsDetail = matchRoute("/vs/:id", path);
  if (vsDetail?.id) {
    const id = Number(vsDetail.id);
    if (Number.isFinite(id) && id > 0) {
      return { kind: "map", tool: "vs", sub: { tool: "vs", sub: "detail", id }, rawQuery };
    }
  }
  if (path === "/trajets")
    return { kind: "map", tool: "trajets", sub: { tool: "trajets", sub: "list" }, rawQuery };
  if (path === "/trajets/new")
    return { kind: "map", tool: "trajets", sub: { tool: "trajets", sub: "new" }, rawQuery };
  const trajetDetail = matchRoute("/trajets/:id", path);
  if (trajetDetail?.id) {
    const id = Number(trajetDetail.id);
    if (Number.isFinite(id) && id > 0) {
      return { kind: "map", tool: "trajets", sub: { tool: "trajets", sub: "detail", id }, rawQuery };
    }
  }
  if (path === "/chronologie")
    return { kind: "map", tool: "chronologie", sub: { tool: "chronologie" }, rawQuery };
  if (path === "/courses")
    return { kind: "map", tool: "courses", sub: { tool: "courses", sub: "list" }, rawQuery };
  const courseDetail = matchRoute("/courses/:id", path);
  if (courseDetail?.id) {
    const id = Number(courseDetail.id);
    if (Number.isFinite(id) && id > 0) {
      return { kind: "map", tool: "courses", sub: { tool: "courses", sub: "detail", id }, rawQuery };
    }
  }

  // Unknown path → home map with last tool.
  return { kind: "map", tool: recallTool(), rawQuery };
}

export function toolRoot(t: Tool): string {
  switch (t) {
    case "vs":
      return "/vs";
    case "trajets":
      return "/trajets";
    case "chronologie":
      return "/chronologie";
    case "courses":
      return "/courses";
  }
}
