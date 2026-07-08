import { NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Department } from "@/lib/types/domain";

type DbRow = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toDepartment(row: DbRow): Department {
  return {
    id: text(row.id),
    name: text(row.name),
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    sort_order: numberValue(row.sort_order),
    created_at: text(row.created_at),
    updated_at: text(row.updated_at)
  };
}

function mockData(warning?: string) {
  const departments = appRepository.listDepartments();

  return {
    source: "mock" as const,
    warning,
    departments,
    shipperCounts: Object.fromEntries(departments.map((department) => [department.id, appRepository.listShippers({ departmentId: department.id }).length])),
    userCounts: Object.fromEntries(departments.map((department) => [department.id, appRepository.listUsers().filter((user) => user.department_ids.includes(department.id)).length]))
  };
}

export async function GET() {
  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(mockData());
  }

  try {
    const { data, error } = await supabase.from("departments").select("*").order("sort_order", { ascending: true });
    if (error) throw error;

    const departments = ((data ?? []) as DbRow[]).map(toDepartment);
    const departmentIds = departments.map((department) => department.id);
    const shippers = departmentIds.length > 0 ? await supabase.from("shippers").select("department_id").in("department_id", departmentIds) : { data: [], error: null };
    if (shippers.error) throw shippers.error;

    const permissions = departmentIds.length > 0
      ? await supabase.from("user_department_permissions").select("department_id").in("department_id", departmentIds)
      : { data: [], error: null };

    const shipperCounts = ((shippers.data ?? []) as DbRow[]).reduce<Record<string, number>>((acc, row) => {
      const departmentId = text(row.department_id);
      acc[departmentId] = (acc[departmentId] ?? 0) + 1;
      return acc;
    }, {});
    const userCounts = permissions.error
      ? {}
      : ((permissions.data ?? []) as DbRow[]).reduce<Record<string, number>>((acc, row) => {
          const departmentId = text(row.department_id);
          acc[departmentId] = (acc[departmentId] ?? 0) + 1;
          return acc;
        }, {});

    return NextResponse.json({ source: "supabase", departments, shipperCounts, userCounts });
  } catch (error) {
    return NextResponse.json(mockData(errorMessage(error, "Supabase 부서마스터 조회에 실패했습니다.")));
  }
}
