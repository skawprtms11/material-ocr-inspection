import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUser, Shipper } from "@/lib/types/domain";

type DbRow = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
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
    role: text(row.role, "worker") as AppUser["role"],
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    department_ids: departmentIds,
    shipper_ids: shipperIds,
    created_at: text(row.created_at),
    updated_at: text(row.updated_at)
  };
}

function mockData(departmentId: string, warning?: string) {
  return {
    source: "mock" as const,
    warning,
    shippers: appRepository.listShippers({ departmentId }),
    users: appRepository.listUsers()
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("department_id");

  if (!departmentId) return NextResponse.json({ error: "department_id가 필요합니다." }, { status: 400 });

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(mockData(departmentId));
  }

  try {
    const scope = await resolveScopeIds(supabase, departmentId, "");
    const [shipperResult, usersResult, departmentPermissions, shipperPermissions] = await Promise.all([
      supabase.from("shippers").select("*").eq("department_id", scope.departmentId).order("name", { ascending: true }),
      supabase.from("app_users").select("*").order("name", { ascending: true }),
      supabase.from("user_department_permissions").select("user_id, department_id"),
      supabase.from("user_shipper_permissions").select("user_id, shipper_id")
    ]);

    if (shipperResult.error) throw shipperResult.error;
    if (usersResult.error) throw usersResult.error;

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
      shippers: ((shipperResult.data ?? []) as DbRow[]).map(toShipper),
      users: ((usersResult.data ?? []) as DbRow[]).map((row) => toUser(row, departmentsByUser[text(row.id)] ?? [], shippersByUser[text(row.id)] ?? []))
    });
  } catch (error) {
    return NextResponse.json(mockData(departmentId, errorMessage(error, "Supabase 화주마스터 조회에 실패했습니다.")));
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    shipperId?: string;
    crewLeaderIds?: string[];
  };

  if (!body.shipperId) return NextResponse.json({ error: "shipperId가 필요합니다." }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const crewLeaderIds = body.crewLeaderIds ?? [];

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", shipperId: body.shipperId, crewLeaderIds });
  }

  try {
    const { error } = await supabase.from("shippers").update({ crew_leader_ids: crewLeaderIds }).eq("id", body.shipperId);
    if (error) throw error;

    return NextResponse.json({ source: "supabase", shipperId: body.shipperId, crewLeaderIds });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "작업조장 저장에 실패했습니다.") }, { status: 500 });
  }
}
