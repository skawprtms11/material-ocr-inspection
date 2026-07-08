import { NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUser, Department, Shipper } from "@/lib/types/domain";

type DbRow = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toDepartment(row: DbRow): Department {
  return {
    id: text(row.id),
    name: text(row.name),
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at)
  };
}

function toShipper(row: DbRow): Shipper {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    code: text(row.code),
    name: text(row.name),
    foreman_name: text(row.foreman_name),
    crew_leader_ids: Array.isArray(row.crew_leader_ids) ? row.crew_leader_ids.filter((id): id is string => typeof id === "string") : [],
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at)
  };
}

function toUser(row: DbRow, departmentIds: string[], shipperIds: string[]): AppUser {
  return {
    id: text(row.id),
    name: text(row.name),
    email: text(row.email),
    role: text(row.role, "viewer") as AppUser["role"],
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    department_ids: departmentIds,
    shipper_ids: shipperIds,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at)
  };
}

function mockData(warning?: string) {
  return {
    source: "mock" as const,
    warning,
    users: appRepository.listUsers(),
    departments: appRepository.listDepartments(),
    shippers: appRepository.listAllowedShippers()
  };
}

export async function GET() {
  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(mockData());
  }

  try {
    const [usersResult, departmentsResult, shippersResult, departmentPermissions, shipperPermissions] = await Promise.all([
      supabase.from("app_users").select("*").order("name", { ascending: true }),
      supabase.from("departments").select("*").order("sort_order", { ascending: true }),
      supabase.from("shippers").select("*").order("name", { ascending: true }),
      supabase.from("user_department_permissions").select("user_id, department_id"),
      supabase.from("user_shipper_permissions").select("user_id, shipper_id")
    ]);

    if (usersResult.error) throw usersResult.error;
    if (departmentsResult.error) throw departmentsResult.error;
    if (shippersResult.error) throw shippersResult.error;

    const departmentsByUser = ((departmentPermissions.data ?? []) as DbRow[]).reduce<Record<string, string[]>>((acc, row) => {
      const userId = text(row.user_id);
      acc[userId] = [...(acc[userId] ?? []), text(row.department_id)];
      return acc;
    }, {});
    const shippersByUser = ((shipperPermissions.data ?? []) as DbRow[]).reduce<Record<string, string[]>>((acc, row) => {
      const userId = text(row.user_id);
      acc[userId] = [...(acc[userId] ?? []), text(row.shipper_id)];
      return acc;
    }, {});

    return NextResponse.json({
      source: "supabase",
      users: ((usersResult.data ?? []) as DbRow[]).map((row) => toUser(row, departmentsByUser[text(row.id)] ?? [], shippersByUser[text(row.id)] ?? [])),
      departments: ((departmentsResult.data ?? []) as DbRow[]).map(toDepartment),
      shippers: ((shippersResult.data ?? []) as DbRow[]).map(toShipper)
    });
  } catch (error) {
    return NextResponse.json(mockData(errorMessage(error, "Supabase 사용자관리 조회에 실패했습니다.")));
  }
}
