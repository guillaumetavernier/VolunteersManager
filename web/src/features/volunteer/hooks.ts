import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveVolunteer,
  createVolunteer,
  getVolunteer,
  listRoleTypes,
  listVolunteers,
  patchVolunteer,
  type ArchivedFilter,
  type VolunteerInput,
  type VolunteerPatch,
} from "./api";

export const volunteersKey = (filter: ArchivedFilter) => ["volunteers", filter] as const;
export const volunteerKey = (id: number) => ["volunteers", id] as const;
export const roleTypesKey = ["volunteers", "role-types"] as const;

export function useVolunteers(filter: ArchivedFilter = "false") {
  return useQuery({ queryKey: volunteersKey(filter), queryFn: () => listVolunteers(filter) });
}

export function useVolunteer(id: number) {
  return useQuery({
    queryKey: volunteerKey(id),
    queryFn: () => getVolunteer(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useRoleTypes() {
  return useQuery({ queryKey: roleTypesKey, queryFn: listRoleTypes });
}

export function useCreateVolunteer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VolunteerInput) => createVolunteer(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volunteers"] });
    },
  });
}

export function usePatchVolunteer(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: VolunteerPatch) => patchVolunteer(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volunteers"] });
    },
  });
}

export function useArchiveVolunteer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => archiveVolunteer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["volunteers"] }),
  });
}
