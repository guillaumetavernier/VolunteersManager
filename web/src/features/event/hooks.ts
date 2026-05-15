import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getEvent,
  getTileDownloadStatus,
  putEvent,
  startTileDownload,
} from "./api";
import type { Event, EventInput } from "./api";

export const eventQueryKey = ["event"] as const;

export function useEvent() {
  return useQuery<Event | null>({
    queryKey: eventQueryKey,
    queryFn: getEvent,
  });
}

export function useInitializeEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EventInput) => {
      const settings = JSON.stringify(input.region ? { region: input.region } : {});
      const ev = await putEvent({ ...input, settings } as EventInput & { settings: string });
      if (input.region) {
        await startTileDownload(input.region);
      }
      return ev;
    },
    onSuccess: (ev) => {
      qc.setQueryData(eventQueryKey, ev);
    },
  });
}

export function eventRegion(ev: Event | null | undefined): string | null {
  if (!ev?.settings) return null;
  try {
    const parsed = JSON.parse(ev.settings) as { region?: string };
    return parsed.region ?? null;
  } catch {
    return null;
  }
}

export function useTileDownloadStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["tiles", "download", "status"],
    queryFn: getTileDownloadStatus,
    enabled,
    refetchInterval: (q) => {
      const st = q.state.data?.state;
      return st === "downloading" ? 500 : false;
    },
  });
}
