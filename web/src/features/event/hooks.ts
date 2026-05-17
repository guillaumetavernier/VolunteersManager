import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getEvent,
  getTileDownloadStatus,
  getTileSource,
  listTiles,
  putEvent,
  startTileDownload,
} from "./api";
import type { Event, EventInput, TileSourceResponse } from "./api";

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

export function useTilesList(enabled = true) {
  return useQuery({
    queryKey: ["tiles", "list"],
    queryFn: listTiles,
    enabled,
  });
}

export function useUpdateEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      event,
      patch,
    }: {
      event: Event;
      patch: Partial<Pick<EventInput, "name" | "start_date" | "end_date" | "coordinator_name" | "coordinator_phone">>;
    }) => {
      return putEvent({
        name: patch.name ?? event.name,
        start_date: patch.start_date ?? event.start_date,
        end_date: patch.end_date ?? event.end_date,
        timezone: event.timezone,
        country_code: event.country_code,
        settings: event.settings,
        coordinator_name: patch.coordinator_name ?? event.coordinator_name,
        coordinator_phone: patch.coordinator_phone ?? event.coordinator_phone,
      });
    },
    onSuccess: (ev) => {
      qc.setQueryData(eventQueryKey, ev);
    },
  });
}


export function useTileSource() {
  return useQuery<TileSourceResponse>({
    queryKey: ["tiles", "source"],
    queryFn: getTileSource,
    staleTime: Infinity,
  });
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
