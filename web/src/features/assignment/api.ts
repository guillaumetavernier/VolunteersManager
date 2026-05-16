import { apiFetch } from "@/lib/api";

export interface Assignment {
  id: number;
  mission_id: number;
  volunteer_id: number;
  created_at: string;
}

export async function createAssignment(input: { mission_id: number; volunteer_id: number }): Promise<Assignment> {
  return apiFetch<Assignment>("/api/assignments", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteAssignment(id: number): Promise<void> {
  await apiFetch<null>(`/api/assignments/${id}`, { method: "DELETE" });
}

export async function deleteAssignmentByPair(volunteerID: number, missionID: number): Promise<void> {
  await apiFetch<null>(`/api/assignments?volunteer=${volunteerID}&mission=${missionID}`, {
    method: "DELETE",
  });
}

export async function listAssignmentsForVolunteer(volunteerID: number): Promise<Assignment[]> {
  return apiFetch<Assignment[]>(`/api/assignments?volunteer=${volunteerID}`);
}

export async function listAssignmentsForMission(missionID: number): Promise<Assignment[]> {
  return apiFetch<Assignment[]>(`/api/assignments?mission=${missionID}`);
}
