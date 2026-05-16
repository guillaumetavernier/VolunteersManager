import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCar, deleteCar, getCar, listCars, patchCar, type CarInput, type CarPatch } from "./api";

export const carsKey = ["cars"] as const;
export const carKey = (id: number) => ["cars", id] as const;

export function useCars() {
  return useQuery({ queryKey: carsKey, queryFn: listCars });
}

export function useCar(id: number) {
  return useQuery({ queryKey: carKey(id), queryFn: () => getCar(id), enabled: id > 0 });
}

export function useCreateCar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CarInput) => createCar(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: carsKey }),
  });
}

export function usePatchCar(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: CarPatch) => patchCar(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: carsKey });
      qc.invalidateQueries({ queryKey: carKey(id) });
    },
  });
}

export function useDeleteCar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: carsKey }),
  });
}
