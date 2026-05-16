import { apiFetch } from "@/lib/api";
import {
  defaultRoadbookSettings,
  type GenerateResponse,
  type PreviewResponse,
  type RoadbookSettings,
} from "./types";

export async function generateRoadbooks(): Promise<GenerateResponse> {
  return apiFetch<GenerateResponse>("/api/roadbooks/generate", { method: "POST" });
}

export async function previewRoadbook(
  volunteerId: number,
  settingsOverride?: RoadbookSettings,
): Promise<PreviewResponse> {
  return apiFetch<PreviewResponse>("/api/roadbooks/preview", {
    method: "POST",
    body: JSON.stringify({ volunteer_id: volunteerId, settings_override: settingsOverride }),
  });
}

export async function uploadLogo(file: File): Promise<{ path: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<{ path: string }>("/api/event/logo", { method: "POST", body: fd });
}

export async function uploadSponsor(file: File): Promise<{ path: string }> {
  const fd = new FormData();
  fd.append("file", file);
  return apiFetch<{ path: string }>("/api/event/sponsor", { method: "POST", body: fd });
}

export function readRoadbookSettings(eventSettings: string | undefined): RoadbookSettings {
  const def = defaultRoadbookSettings();
  if (!eventSettings) return def;
  try {
    const top = JSON.parse(eventSettings) as { roadbook?: Partial<RoadbookSettings> };
    if (!top.roadbook) return def;
    return { ...def, ...top.roadbook, section_visible: { ...def.section_visible, ...(top.roadbook.section_visible ?? {}) } };
  } catch {
    return def;
  }
}

export function writeRoadbookSettings(eventSettings: string | undefined, rb: RoadbookSettings): string {
  let top: Record<string, unknown> = {};
  if (eventSettings) {
    try {
      top = JSON.parse(eventSettings) as Record<string, unknown>;
    } catch {
      top = {};
    }
  }
  top.roadbook = rb;
  return JSON.stringify(top);
}
