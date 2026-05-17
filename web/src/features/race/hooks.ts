import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRace,
  deleteRace,
  getRace,
  getRaceTrack,
  listRaceVS,
  listRaces,
  patchRace,
  replaceRaceVS,
  type RaceCreate,
  type RacePatch,
} from "./api";

export const racesKey = ["races"] as const;
export const raceKey = (id: number) => ["races", id] as const;
export const raceVSKey = (id: number) => ["races", id, "vs"] as const;
export const raceTrackKey = (id: number) => ["races", id, "track"] as const;

export function useRaceTrack(id: number) {
  return useQuery({ queryKey: raceTrackKey(id), queryFn: () => getRaceTrack(id), enabled: id > 0 });
}

export function useRaces() {
  return useQuery({ queryKey: racesKey, queryFn: listRaces });
}

export function useRace(id: number) {
  return useQuery({ queryKey: raceKey(id), queryFn: () => getRace(id), enabled: Number.isFinite(id) && id > 0 });
}

export function useCreateRace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RaceCreate) => createRace(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: racesKey }),
  });
}

export function usePatchRace(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RacePatch) => patchRace(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: racesKey });
      qc.invalidateQueries({ queryKey: raceKey(id) });
    },
  });
}

export function useDeleteRace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRace(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: racesKey }),
  });
}

export function useRaceVS(id: number) {
  return useQuery({ queryKey: raceVSKey(id), queryFn: () => listRaceVS(id), enabled: id > 0 });
}

export function useReplaceRaceVS(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: Array<{ vs_id: number; sequence: number }>) => replaceRaceVS(id, items),
    onSuccess: (data) => {
      qc.setQueryData(raceVSKey(id), data);
    },
  });
}
