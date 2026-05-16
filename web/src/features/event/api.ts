import { ApiError, apiFetch } from "@/lib/api";

export interface Event {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  timezone: string;
  country_code: string;
  settings: string;
  logo_path: string | null;
  sponsor_path: string | null;
  coordinator_name: string | null;
  coordinator_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventInput {
  name: string;
  start_date: string;
  end_date: string;
  timezone?: string;
  country_code?: string;
  settings?: string;
  coordinator_name?: string | null;
  coordinator_phone?: string | null;
  region?: string; // not persisted on the server as a column; the wizard folds it into settings.
}

export async function getEvent(): Promise<Event | null> {
  try {
    return await apiFetch<Event>("/api/event");
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function putEvent(input: EventInput): Promise<Event> {
  return apiFetch<Event>("/api/event", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function startTileDownload(region: string): Promise<void> {
  await apiFetch("/api/tiles/download", {
    method: "POST",
    body: JSON.stringify({ region }),
  });
}

export interface TileDownloadStatus {
  state: "idle" | "downloading" | "done" | "error";
  region?: string;
  bytes_downloaded: number;
  bytes_total: number;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

export async function getTileDownloadStatus(): Promise<TileDownloadStatus> {
  return apiFetch<TileDownloadStatus>("/api/tiles/download/status");
}
