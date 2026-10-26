import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { departments as mockDepartments } from "@/lib/mock/data";
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
    return NextResponse.json({ error: errorMessage(error, "Supabase 부서마스터 조회에 실패했습니다.") }, { status: 502 });
  }
}

const DEPARTMENT_NAME_MAX_LENGTH = 50;
const SORT_ORDER_MAX = 9999;

// 정렬순서 자동 지정: 현재 최대값 + 1, 직접 입력 허용 범위(0~9999)를 넘지 않게 상한을 둔다.
function nextSortOrder(items: Department[]) {
  return Math.min(SORT_ORDER_MAX, Math.max(0, ...items.map((item) => item.sort_order)) + 1);
}

type CreateDepartmentBody = {
  name?: unknown;
  sortOrder?: unknown;
  isActive?: unknown;
};

// 부서 추가. 부서명은 필수·중복 불가(공백 제거 후 대소문자 무시 비교), 정렬순서를 비우면 현재 최대값 + 1로 지정한다.
export async function POST(request: NextRequest) {
  let body: CreateDepartmentBody;
  try {
    body = (await request.json()) as CreateDepartmentBody;
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "부서명을 입력해주세요." }, { status: 400 });
  if (Array.from(name).length > DEPARTMENT_NAME_MAX_LENGTH) {
    return NextResponse.json({ error: `부서명은 ${DEPARTMENT_NAME_MAX_LENGTH}자 이하여야 합니다.` }, { status: 400 });
  }

  const hasSortOrder = body.sortOrder !== undefined && body.sortOrder !== null && body.sortOrder !== "";
  if (hasSortOrder && (typeof body.sortOrder !== "number" || !Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > SORT_ORDER_MAX)) {
    return NextResponse.json({ error: "정렬순서는 0 이상 9999 이하의 정수여야 합니다." }, { status: 400 });
  }
  if (body.isActive !== undefined && typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "사용여부 값이 올바르지 않습니다." }, { status: 400 });
  }
  const isActive = body.isActive ?? true;
  const sameName = (department: Department) => department.name.trim().toLowerCase() === name.toLowerCase();

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    if (mockDepartments.some(sameName)) {
      return NextResponse.json({ error: "같은 이름의 부서가 이미 있습니다." }, { status: 409 });
    }
    const now = new Date().toISOString();
    const department: Department = {
      id: crypto.randomUUID(),
      name,
      is_active: isActive,
      sort_order: hasSortOrder ? (body.sortOrder as number) : nextSortOrder(mockDepartments),
      created_at: now,
      updated_at: now
    };
    mockDepartments.push(department);
    return NextResponse.json({ source: "mock", department }, { status: 201 });
  }

  try {
    const { data, error } = await supabase.from("departments").select("*");
    if (error) throw error;
    const existing = ((data ?? []) as DbRow[]).map(toDepartment);
    if (existing.some(sameName)) {
      return NextResponse.json({ error: "같은 이름의 부서가 이미 있습니다." }, { status: 409 });
    }

    const sortOrder = hasSortOrder ? (body.sortOrder as number) : nextSortOrder(existing);
    const { data: inserted, error: insertError } = await supabase
      .from("departments")
      .insert({ name, sort_order: sortOrder, is_active: isActive })
      .select("*")
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({ source: "supabase", department: toDepartment(inserted as DbRow) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Supabase 부서 추가에 실패했습니다.") }, { status: 502 });
  }
}
