/**
 * LCSS — departments service (PostgreSQL-backed fetch client).
 *
 * Same contracts as before; data comes from `/api/departments`
 * (authenticated, server-authorized) instead of Supabase.
 */
import { apiGet, apiSend } from "./http";
import type { Department } from "@/lib/types";

/** All departments (reference data). */
export async function getDepartments(): Promise<Department[]> {
  const data = await apiGet<{ departments: Department[] }>("/api/departments");
  return data.departments;
}

/** Departments flagged active (for dropdowns / filters). */
export async function getActiveDepartments(): Promise<Department[]> {
  const all = await getDepartments();
  return all.filter((d) => d.status === "active");
}

/** Single department by id, or null. */
export async function getDepartmentById(id: string): Promise<Department | null> {
  const data = await apiGet<{ department: Department }>(
    `/api/departments/${encodeURIComponent(id)}`,
  ).catch(() => null);
  return data?.department ?? null;
}

/** Create a department (admins only). */
export async function createDepartment(input: {
  name: string;
  code?: string;
  description?: string;
}): Promise<Department> {
  const data = await apiSend<{ department: Department }>("/api/departments", "POST", input);
  return data.department;
}

/** Update a department (admins only). */
export async function updateDepartment(
  id: string,
  input: { name?: string; code?: string | null; description?: string | null; isActive?: boolean },
): Promise<Department> {
  const data = await apiSend<{ department: Department }>(
    `/api/departments/${encodeURIComponent(id)}`,
    "PATCH",
    input,
  );
  return data.department;
}

/** Delete a department (admins only). */
export async function deleteDepartment(id: string): Promise<void> {
  await apiSend(`/api/departments/${encodeURIComponent(id)}`, "DELETE");
}
