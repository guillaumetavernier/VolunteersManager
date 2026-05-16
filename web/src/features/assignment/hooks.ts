import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAssignment,
  deleteAssignment,
  deleteAssignmentByPair,
  listAssignmentsForMission,
  listAssignmentsForVolunteer,
} from "./api";

export const assignmentsForVolunteerKey = (id: number) => ["assignments", "volunteer", id] as const;
export const assignmentsForMissionKey = (id: number) => ["assignments", "mission", id] as const;

export function useAssignmentsForVolunteer(volunteerID: number) {
  return useQuery({
    queryKey: assignmentsForVolunteerKey(volunteerID),
    queryFn: () => listAssignmentsForVolunteer(volunteerID),
    enabled: volunteerID > 0,
  });
}

export function useAssignmentsForMission(missionID: number) {
  return useQuery({
    queryKey: assignmentsForMissionKey(missionID),
    queryFn: () => listAssignmentsForMission(missionID),
    enabled: missionID > 0,
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mission_id: number; volunteer_id: number }) => createAssignment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["missions"] });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["missions"] });
    },
  });
}

export function useDeleteAssignmentByPair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ volunteerID, missionID }: { volunteerID: number; missionID: number }) =>
      deleteAssignmentByPair(volunteerID, missionID),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assignments"] });
      qc.invalidateQueries({ queryKey: ["missions"] });
    },
  });
}
