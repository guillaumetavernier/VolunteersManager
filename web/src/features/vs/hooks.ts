import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createVS,
  deleteVS,
  listVS,
  patchVS,
  uploadVSPhoto,
  type VS,
  type VSCreate,
  type VSPatch,
} from "./api";

export const vsListKey = ["vs"] as const;

export function useVSList() {
  return useQuery<VS[]>({
    queryKey: vsListKey,
    queryFn: listVS,
  });
}

export function useCreateVS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VSCreate) => createVS(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: vsListKey }),
  });
}

export function usePatchVS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: VSPatch }) => patchVS(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: vsListKey });
      const previous = qc.getQueryData<VS[]>(vsListKey);
      if (previous) {
        qc.setQueryData<VS[]>(
          vsListKey,
          previous.map((v) => (v.id === id ? { ...v, ...patch } : v)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(vsListKey, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: vsListKey }),
  });
}

export function useDeleteVS() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) => deleteVS(id, force ?? false),
    onSuccess: () => qc.invalidateQueries({ queryKey: vsListKey }),
  });
}

export function useUploadVSPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => uploadVSPhoto(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: vsListKey }),
  });
}
