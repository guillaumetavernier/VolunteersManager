import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listMatrix, patchCell, recompute, type MatrixCell, type MatrixPatch } from "./api";

export const matrixKey = ["travel-times"] as const;

export function useMatrix() {
  return useQuery({ queryKey: matrixKey, queryFn: listMatrix });
}

export function usePatchCell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: MatrixPatch) => patchCell(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: matrixKey }),
  });
}

export function useRecomputeMatrix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recompute(),
    onSuccess: () => qc.invalidateQueries({ queryKey: matrixKey }),
  });
}

export type { MatrixCell };
