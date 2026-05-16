import { apiFetch } from "@/lib/api";

export interface Car {
  id: number;
  name: string;
  seats: number;
  default_driver_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CarInput {
  name: string;
  seats: number;
  default_driver_id?: number | null;
  notes?: string | null;
}

export type CarPatch = Partial<CarInput>;

export async function listCars(): Promise<Car[]> {
  return apiFetch<Car[]>("/api/cars");
}

export async function getCar(id: number): Promise<Car> {
  return apiFetch<Car>(`/api/cars/${id}`);
}

export async function createCar(input: CarInput): Promise<Car> {
  return apiFetch<Car>("/api/cars", { method: "POST", body: JSON.stringify(input) });
}

export async function patchCar(id: number, patch: CarPatch): Promise<Car> {
  return apiFetch<Car>(`/api/cars/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
}

export async function deleteCar(id: number): Promise<void> {
  await apiFetch<null>(`/api/cars/${id}`, { method: "DELETE" });
}
