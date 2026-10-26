import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { shippers as mockShippers, users as mockUsers } from "@/lib/mock/data";
import { assertUuid, guardErrorResponse } from "@/lib/server/scope-guard";
import { RouteError } from "@/lib/server/work-register-shared";
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
    if (departmentPermissions.error) throw departmentPermissions.error;
    if (shipperPermissions.error) throw shipperPermissions.error;

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
    return NextResponse.json({ error: errorMessage(error, "Supabase 사용자관리 조회에 실패했습니다.") }, { status: 502 });
  }
}

type UpdatePermissionsBody = {
  userId?: unknown;
  departmentIds?: unknown;
  shipperIds?: unknown;
};

function uniqueIds(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    throw new RouteError(`${label} 목록 형식이 올바르지 않습니다.`, 400);
  }
  const ids = Array.from(new Set(value as string[]));
  ids.forEach((id) => assertUuid(id, label));
  return ids;
}

// 사용자별 부서·화주 권한 저장. 화주 권한은 부여된 부서 소속 화주만 허용한다(부서 권한을 빼면 그 부서 화주도 함께 빼야 한다).
// 전체 삭제 후 재삽입 대신 추가분 insert → 제거분 delete 순서로 반영해, 중간 실패 시 권한이 통째로 사라지지 않게 한다.
export async function PATCH(request: NextRequest) {
  let body: UpdatePermissionsBody;
  try {
    body = (await request.json()) as UpdatePermissionsBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  try {
    const userId = typeof body.userId === "string" ? body.userId : "";
    assertUuid(userId, "userId");
    const departmentIds = uniqueIds(body.departmentIds, "부서");
    const shipperIds = uniqueIds(body.shipperIds, "화주");

    const supabase = createServerSupabaseClient();

    if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
      const user = mockUsers.find((item) => item.id === userId);
      if (!user) throw new RouteError("사용자를 찾을 수 없습니다.", 404);
      const departments = appRepository.listDepartments();
      if (departmentIds.some((id) => !departments.some((department) => department.id === id))) {
        throw new RouteError("존재하지 않는 부서가 포함되어 있습니다.", 400);
      }
      const shipperById = new Map(mockShippers.map((shipper) => [shipper.id, shipper]));
      if (shipperIds.some((id) => !departmentIds.includes(shipperById.get(id)?.department_id ?? ""))) {
        throw new RouteError("화주 권한은 권한이 있는 부서 소속 화주만 선택할 수 있습니다.", 400);
      }
      user.department_ids = departmentIds;
      user.shipper_ids = shipperIds;
      return NextResponse.json({ source: "mock", userId, departmentIds, shipperIds });
    }

    const [userResult, departmentsResult, shippersResult, currentDepartments, currentShippers] = await Promise.all([
      supabase.from("app_users").select("id").eq("id", userId).maybeSingle(),
      departmentIds.length > 0 ? supabase.from("departments").select("id").in("id", departmentIds) : { data: [], error: null },
      shipperIds.length > 0 ? supabase.from("shippers").select("id, department_id").in("id", shipperIds) : { data: [], error: null },
      supabase.from("user_department_permissions").select("department_id").eq("user_id", userId),
      supabase.from("user_shipper_permissions").select("shipper_id").eq("user_id", userId)
    ]);
    for (const result of [userResult, departmentsResult, shippersResult, currentDepartments, currentShippers]) {
      if (result.error) throw result.error;
    }
    if (!userResult.data) throw new RouteError("사용자를 찾을 수 없습니다.", 404);
    if ((departmentsResult.data ?? []).length !== departmentIds.length) {
      throw new RouteError("존재하지 않는 부서가 포함되어 있습니다.", 400);
    }
    const shipperRows = (shippersResult.data ?? []) as DbRow[];
    if (shipperRows.length !== shipperIds.length) throw new RouteError("존재하지 않는 화주가 포함되어 있습니다.", 400);
    if (shipperRows.some((row) => !departmentIds.includes(text(row.department_id)))) {
      throw new RouteError("화주 권한은 권한이 있는 부서 소속 화주만 선택할 수 있습니다.", 400);
    }

    const heldDepartments = ((currentDepartments.data ?? []) as DbRow[]).map((row) => text(row.department_id));
    const heldShippers = ((currentShippers.data ?? []) as DbRow[]).map((row) => text(row.shipper_id));
    const addDepartments = departmentIds.filter((id) => !heldDepartments.includes(id));
    const removeDepartments = heldDepartments.filter((id) => !departmentIds.includes(id));
    const addShippers = shipperIds.filter((id) => !heldShippers.includes(id));
    const removeShippers = heldShippers.filter((id) => !shipperIds.includes(id));

    if (addDepartments.length > 0) {
      const { error } = await supabase
        .from("user_department_permissions")
        .insert(addDepartments.map((departmentId) => ({ user_id: userId, department_id: departmentId })));
      if (error) throw error;
    }
    if (addShippers.length > 0) {
      const { error } = await supabase
        .from("user_shipper_permissions")
        .insert(addShippers.map((shipperId) => ({ user_id: userId, shipper_id: shipperId })));
      if (error) throw error;
    }
    if (removeShippers.length > 0) {
      const { error } = await supabase.from("user_shipper_permissions").delete().eq("user_id", userId).in("shipper_id", removeShippers);
      if (error) throw error;
    }
    if (removeDepartments.length > 0) {
      const { error } = await supabase
        .from("user_department_permissions")
        .delete()
        .eq("user_id", userId)
        .in("department_id", removeDepartments);
      if (error) throw error;
    }

    return NextResponse.json({ source: "supabase", userId, departmentIds, shipperIds });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "Supabase 사용자 권한 저장에 실패했습니다.") }, { status: 502 });
  }
}
