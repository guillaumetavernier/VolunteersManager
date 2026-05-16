import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTrip,
  deleteTrip,
  getTrip,
  listTransportNeeds,
  listTrips,
  replaceTrip,
  type Trip,
  type TripInput,
} from "./api";

export const tripsKey = (day?: number) => ["trips", day ?? null] as const;
export const tripKey = (id: number) => ["trips", "single", id] as const;
export const transportNeedsKey = (day?: number) => ["transport-needs", day ?? null] as const;

export function useTrips(day?: number) {
  return useQuery({ queryKey: tripsKey(day), queryFn: () => listTrips(day) });
}

export function useTrip(id: number) {
  return useQuery({
    queryKey: tripKey(id),
    queryFn: () => getTrip(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useTransportNeeds(day?: number) {
  return useQuery({
    queryKey: transportNeedsKey(day),
    queryFn: () => listTransportNeeds(day),
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TripInput) => createTrip(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["transport-needs"] });
    },
  });
}

export function useReplaceTrip(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TripInput) => replaceTrip(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["transport-needs"] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["transport-needs"] });
    },
  });
}

export type { Trip };
