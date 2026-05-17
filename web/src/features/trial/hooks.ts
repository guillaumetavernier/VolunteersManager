import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTrial,
  deleteTrial,
  deleteTrialGPX,
  listTrialGPX,
  listTrialVS,
  listTrialsForRace,
  patchTrial,
  putTrialVS,
  reorderTrials,
  uploadTrialGPX,
  type ReorderItem,
  type TrialCreate,
  type TrialPatch,
  type TrialVS,
} from "./api";

export const trialsKey = (raceID: number) => ["races", raceID, "trials"] as const;
export const trialGPXKey = (trialID: number) => ["trials", trialID, "gpx"] as const;
export const trialVSKey = (trialID: number) => ["trials", trialID, "vs"] as const;

export function useTrials(raceID: number) {
  return useQuery({ queryKey: trialsKey(raceID), queryFn: () => listTrialsForRace(raceID), enabled: raceID > 0 });
}

export function useCreateTrial(raceID: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TrialCreate) => createTrial(raceID, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trialsKey(raceID) });
      qc.invalidateQueries({ queryKey: ["races", raceID, "vs"] });
    },
  });
}

export function usePatchTrial(raceID: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TrialPatch }) => patchTrial(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trialsKey(raceID) });
      qc.invalidateQueries({ queryKey: ["races", raceID, "vs"] });
    },
  });
}

export function useDeleteTrial(raceID: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTrial(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trialsKey(raceID) });
      qc.invalidateQueries({ queryKey: ["races", raceID, "vs"] });
    },
  });
}

export function useReorderTrials(raceID: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: ReorderItem[]) => reorderTrials(raceID, items),
    onSuccess: (data) => {
      qc.setQueryData(trialsKey(raceID), data);
      qc.invalidateQueries({ queryKey: ["races", raceID, "vs"] });
    },
  });
}

export function useTrialGPX(trialID: number) {
  return useQuery({ queryKey: trialGPXKey(trialID), queryFn: () => listTrialGPX(trialID), enabled: trialID > 0 });
}

export function useUploadTrialGPX(raceID: number, trialID: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadTrialGPX(trialID, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trialGPXKey(trialID) });
      qc.invalidateQueries({ queryKey: ["races", raceID, "track"] });
      qc.invalidateQueries({ queryKey: ["races", raceID, "vs"] });
    },
  });
}

export function useDeleteTrialGPX(raceID: number, trialID: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (gpxID: number) => deleteTrialGPX(trialID, gpxID),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trialGPXKey(trialID) });
      qc.invalidateQueries({ queryKey: ["races", raceID, "track"] });
      qc.invalidateQueries({ queryKey: ["races", raceID, "vs"] });
    },
  });
}

export function useTrialVS(trialID: number) {
  return useQuery({ queryKey: trialVSKey(trialID), queryFn: () => listTrialVS(trialID), enabled: trialID > 0 });
}

export function usePutTrialVS(raceID: number, trialID: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: number;
      patch: { source?: TrialVS["source"]; manual_first_in?: string | null; manual_last_in?: string | null };
    }) => putTrialVS(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trialVSKey(trialID) });
      qc.invalidateQueries({ queryKey: ["races", raceID, "vs"] });
    },
  });
}
