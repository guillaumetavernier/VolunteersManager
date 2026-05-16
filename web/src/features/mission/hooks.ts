import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMission,
  deleteMission,
  getMission,
  listMissions,
  listMissionsForVS,
  patchMission,
  type Mission,
  type MissionFilter,
  type MissionInput,
  type MissionPatch,
} from "./api";

export const missionsForVSKey = (vsID: number, day?: number) =>
  ["missions", "vs", vsID, day ?? null] as const;
export const missionsListKey = (f: MissionFilter) => ["missions", "list", f] as const;
export const missionKey = (id: number) => ["missions", id] as const;

export function useMissionsForVS(vsID: number, day?: number) {
  return useQuery({
    queryKey: missionsForVSKey(vsID, day),
    queryFn: () => listMissionsForVS(vsID, day),
    enabled: vsID > 0,
  });
}

export function useMissions(f: MissionFilter = {}) {
  return useQuery({
    queryKey: missionsListKey(f),
    queryFn: () => listMissions(f),
  });
}

export function useMission(id: number) {
  return useQuery({
    queryKey: missionKey(id),
    queryFn: () => getMission(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useCreateMission(vsID: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MissionInput) => createMission(vsID, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["missions"] });
    },
  });
}

export function usePatchMission(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: MissionPatch) => patchMission(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["missions"] }),
  });
}

export function useDeleteMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMission(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["missions"] }),
  });
}

export type { Mission };
