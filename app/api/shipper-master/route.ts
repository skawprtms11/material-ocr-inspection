import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { departments as mockDepartments, shippers as mockShippers } from "@/lib/mock/data";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import { assertShipperInDepartment, assertUuid, guardErrorResponse, resolveRequestScope } from "@/lib/server/scope-guard";
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
    return NextResponse.json({ error: errorMessage(error, "Supabase 화주마스터 조회에 실패했습니다.") }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    departmentId?: string;
    shipperId?: string;
    crewLeaderIds?: string[];
  };

  if (!body.shipperId) return NextResponse.json({ error: "shipperId가 필요합니다." }, { status: 400 });
  if (!body.departmentId) return NextResponse.json({ error: "departmentId가 필요합니다." }, { status: 400 });

  const supabase = createServerSupabaseClient();
  const crewLeaderIds = body.crewLeaderIds ?? [];

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", shipperId: body.shipperId, crewLeaderIds });
  }

  try {
    // 화주마스터는 부서 하위 리소스라 화주 스코프는 의미가 없다. 부서 소속만 대조한다.
    const { departmentId } = await resolveRequestScope(supabase, { departmentId: body.departmentId, shipperId: body.shipperId });
    await assertShipperInDepartment(supabase, body.shipperId, departmentId);

    const { error } = await supabase.from("shippers").update({ crew_leader_ids: crewLeaderIds }).eq("id", body.shipperId);
    if (error) throw error;

    return NextResponse.json({ source: "supabase", shipperId: body.shipperId, crewLeaderIds });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "작업조장 저장에 실패했습니다.") }, { status: 500 });
  }
}

const SHIPPER_CODE_PATTERN = /^[A-Za-z0-9_-]{1,30}$/;
const SHIPPER_NAME_MAX_LENGTH = 50;

type CreateShipperBody = {
  departmentId?: unknown;
  code?: unknown;
  name?: unknown;
  foremanName?: unknown;
  isActive?: unknown;
};

// 화주 추가. 화주는 반드시 부서에 소속된다. 화주코드는 전체에서 중복 불가(대소문자 무시), 화주명은 같은 부서 안에서 중복 불가.
export async function POST(request: NextRequest) {
  let body: CreateShipperBody;
  try {
    body = (await request.json()) as CreateShipperBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const departmentId = typeof body.departmentId === "string" ? body.departmentId.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const foremanName = typeof body.foremanName === "string" ? body.foremanName.trim() : "";

  if (!departmentId) return NextResponse.json({ error: "departmentId가 필요합니다." }, { status: 400 });
  if (!SHIPPER_CODE_PATTERN.test(code)) {
    return NextResponse.json({ error: "화주코드는 영문·숫자·-·_ 조합 30자 이하로 입력해주세요." }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "화주명을 입력해주세요." }, { status: 400 });
  if (Array.from(name).length > SHIPPER_NAME_MAX_LENGTH) {
    return NextResponse.json({ error: `화주명은 ${SHIPPER_NAME_MAX_LENGTH}자 이하여야 합니다.` }, { status: 400 });
  }
  if (Array.from(foremanName).length > SHIPPER_NAME_MAX_LENGTH) {
    return NextResponse.json({ error: `작업반장 이름은 ${SHIPPER_NAME_MAX_LENGTH}자 이하여야 합니다.` }, { status: 400 });
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "사용여부 값이 올바르지 않습니다." }, { status: 400 });
  }
  const isActive = body.isActive ?? true;
  const sameCode = (shipper: Shipper) => shipper.code.trim().toUpperCase() === code;
  const sameName = (shipper: Shipper) => shipper.name.trim().toLowerCase() === name.toLowerCase();

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    if (!mockDepartments.some((department) => department.id === departmentId)) {
      return NextResponse.json({ error: "부서를 찾을 수 없습니다." }, { status: 404 });
    }
    if (mockShippers.some(sameCode)) return NextResponse.json({ error: "같은 화주코드가 이미 있습니다." }, { status: 409 });
    if (mockShippers.some((shipper) => shipper.department_id === departmentId && sameName(shipper))) {
      return NextResponse.json({ error: "이 부서에 같은 이름의 화주가 이미 있습니다." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const shipper: Shipper = {
      id: crypto.randomUUID(),
      department_id: departmentId,
      code,
      name,
      foreman_name: foremanName,
      crew_leader_ids: [],
      is_active: isActive,
      created_at: now,
      updated_at: now
    };
    mockShippers.push(shipper);
    return NextResponse.json({ source: "mock", shipper }, { status: 201 });
  }

  try {
    const scope = await resolveScopeIds(supabase, departmentId, "");
    assertUuid(scope.departmentId, "departmentId");
    const { data: department, error: departmentError } = await supabase
      .from("departments")
      .select("id")
      .eq("id", scope.departmentId)
      .maybeSingle();
    if (departmentError) throw departmentError;
    if (!department) return NextResponse.json({ error: "부서를 찾을 수 없습니다." }, { status: 404 });

    const { data, error } = await supabase.from("shippers").select("*");
    if (error) throw error;
    const existing = ((data ?? []) as DbRow[]).map(toShipper);
    if (existing.some(sameCode)) return NextResponse.json({ error: "같은 화주코드가 이미 있습니다." }, { status: 409 });
    if (existing.some((shipper) => shipper.department_id === scope.departmentId && sameName(shipper))) {
      return NextResponse.json({ error: "이 부서에 같은 이름의 화주가 이미 있습니다." }, { status: 409 });
    }

    const { data: inserted, error: insertError } = await supabase
      .from("shippers")
      .insert({
        department_id: scope.departmentId,
        code,
        name,
        foreman_name: foremanName || null,
        crew_leader_ids: [],
        is_active: isActive
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({ source: "supabase", shipper: toShipper(inserted as DbRow) }, { status: 201 });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "Supabase 화주 추가에 실패했습니다.") }, { status: 502 });
  }
}
