import { NextResponse } from "next/server";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import {
  RouteError,
  fetchScopedWorkMaster,
  text,
  type DbRow,
  type ServerSupabase
} from "@/lib/server/work-register-shared";

// 쓰기·삭제·상태변경·리소스ID 기반 조회 API 공통 스코프 가드.
// API 라우트는 서비스롤 키로 RLS를 우회하므로 리소스 ID만 믿지 않고, 요청이 선언한 부서/화주 스코프와
// 리소스(works / work_masters / material_masters / shippers)의 소속을 라우트 레벨에서 대조한다.
// 결과 규약: 스코프 누락 400 / 리소스 없음 404 / 소속 불일치 403 / DB 오류 502 (모두 RouteError로 던진다).

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 리소스 ID가 UUID 형식이 아니면 DB 조회 전에 400으로 끊는다(uuid 컬럼 비교 오류가 502로 새는 것 방지).
export function assertUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) throw new RouteError(`${label} 형식이 올바르지 않습니다.`, 400);
}

export type RequestScope = { departmentId: string; shipperId: string };

export const SCOPE_REQUIRED_MESSAGE = "부서/화주 스코프(departmentId, shipperId)가 필요합니다.";

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

// 쿼리스트링: department_id / shipper_id
export function scopeFromSearchParams(searchParams: URLSearchParams): RequestScope | null {
  const departmentId = nonEmpty(searchParams.get("department_id"));
  const shipperId = nonEmpty(searchParams.get("shipper_id"));
  return departmentId && shipperId ? { departmentId, shipperId } : null;
}

// JSON 바디: departmentId / shipperId
export function scopeFromBody(body: { departmentId?: unknown; shipperId?: unknown } | null | undefined): RequestScope | null {
  const departmentId = nonEmpty(body?.departmentId);
  const shipperId = nonEmpty(body?.shipperId);
  return departmentId && shipperId ? { departmentId, shipperId } : null;
}

// multipart(FormData): departmentId / shipperId
export function scopeFromFormData(formData: FormData): RequestScope | null {
  const departmentId = nonEmpty(formData.get("departmentId"));
  const shipperId = nonEmpty(formData.get("shipperId"));
  return departmentId && shipperId ? { departmentId, shipperId } : null;
}

export function missingScopeResponse() {
  return NextResponse.json({ error: SCOPE_REQUIRED_MESSAGE }, { status: 400 });
}

// 가드가 던진 RouteError를 응답으로 바꾼다. 가드와 무관한 예외면 null이라 라우트가 기존 오류 처리를 이어간다.
export function guardErrorResponse(error: unknown) {
  if (error instanceof RouteError) return NextResponse.json({ error: error.message }, { status: error.status });
  return null;
}

// 가드 안의 DB 오류는 502로 통일한다.
async function guarded<T>(fallback: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RouteError) throw error;
    throw new RouteError(errorMessage(error, fallback), 502);
  }
}

// 모의 ID(dept-*, shipper-*)를 시드 UUID로 해석한다. resolveScopeIds와 동일 규칙.
export async function resolveRequestScope(supabase: ServerSupabase, scope: RequestScope): Promise<RequestScope> {
  return guarded("스코프 확인에 실패했습니다.", () => resolveScopeIds(supabase, scope.departmentId, scope.shipperId));
}

function matchesScope(row: DbRow, scope: RequestScope) {
  return text(row.department_id) === scope.departmentId && text(row.shipper_id) === scope.shipperId;
}

export async function assertWorkInScope(supabase: ServerSupabase, workId: string, scope: RequestScope) {
  return guarded("작업 스코프 확인에 실패했습니다.", async () => {
    const { data, error } = await supabase.from("works").select("*").eq("id", workId).maybeSingle();
    if (error) throw error;
    if (!data) throw new RouteError("작업을 찾을 수 없습니다.", 404);
    if (!matchesScope(data as DbRow, scope)) throw new RouteError("선택한 부서/화주에 속하지 않는 작업입니다.", 403);
    return data as DbRow;
  });
}

export async function assertWorkMasterInScope(supabase: ServerSupabase, workMasterId: string, scope: RequestScope) {
  return guarded("작업마스터 스코프 확인에 실패했습니다.", () => fetchScopedWorkMaster(supabase, workMasterId, scope));
}

export async function assertWorkMastersInScope(supabase: ServerSupabase, ids: string[], scope: RequestScope) {
  return guarded("작업마스터 스코프 확인에 실패했습니다.", async () => {
    const uniqueIds = Array.from(new Set(ids));
    const { data, error } = await supabase.from("work_masters").select("id, department_id, shipper_id").in("id", uniqueIds);
    if (error) throw error;

    const rows = (data ?? []) as DbRow[];
    if (rows.length !== uniqueIds.length) throw new RouteError("작업마스터를 찾을 수 없습니다.", 404);
    if (!rows.every((row) => matchesScope(row, scope))) {
      throw new RouteError("선택한 부서/화주에 속하지 않는 작업마스터가 포함되어 있습니다.", 403);
    }
  });
}

export async function assertMaterialInScope(supabase: ServerSupabase, materialId: string, scope: RequestScope) {
  return guarded("부자재 스코프 확인에 실패했습니다.", async () => {
    const { data, error } = await supabase.from("material_masters").select("*").eq("id", materialId).maybeSingle();
    if (error) throw error;
    if (!data) throw new RouteError("부자재를 찾을 수 없습니다.", 404);
    if (!matchesScope(data as DbRow, scope)) throw new RouteError("선택한 부서/화주에 속하지 않는 부자재입니다.", 403);
    return data as DbRow;
  });
}

export async function assertMaterialsInScope(supabase: ServerSupabase, ids: string[], scope: RequestScope) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return;

  await guarded("부자재 스코프 확인에 실패했습니다.", async () => {
    const { data, error } = await supabase.from("material_masters").select("id, department_id, shipper_id").in("id", uniqueIds);
    if (error) throw error;

    const rows = (data ?? []) as DbRow[];
    if (rows.length !== uniqueIds.length) throw new RouteError("부자재를 찾을 수 없습니다.", 404);
    if (!rows.every((row) => matchesScope(row, scope))) {
      throw new RouteError("선택한 부서/화주에 속하지 않는 부자재가 포함되어 있습니다.", 403);
    }
  });
}

// 작업검수 항목이 해당 작업에 속하는지 확인한다(작업 스코프는 assertWorkInScope로 먼저 확인할 것).
export async function assertInspectionBelongsToWork(supabase: ServerSupabase, inspectionId: string, workId: string) {
  await guarded("검수 항목 확인에 실패했습니다.", async () => {
    const { data, error } = await supabase.from("work_inspections").select("id, work_id").eq("id", inspectionId).maybeSingle();
    if (error) throw error;
    if (!data) throw new RouteError("검수 항목을 찾을 수 없습니다.", 404);
    if (text((data as DbRow).work_id) !== workId) throw new RouteError("해당 작업에 속하지 않는 검수 항목입니다.", 403);
  });
}

export async function assertReviewRequestBelongsToWork(supabase: ServerSupabase, requestId: string, workId: string) {
  await guarded("확인요청 확인에 실패했습니다.", async () => {
    const { data, error } = await supabase.from("admin_review_requests").select("id, work_id").eq("id", requestId).maybeSingle();
    if (error) throw error;
    if (!data) throw new RouteError("확인요청을 찾을 수 없습니다.", 404);
    if (text((data as DbRow).work_id) !== workId) throw new RouteError("해당 작업에 속하지 않는 확인요청입니다.", 403);
  });
}

// 화주는 부서 하위 리소스라 화주마스터 수정은 부서 일치만 대조한다(화주 스코프 자체가 대상이므로).
export async function assertShipperInDepartment(supabase: ServerSupabase, shipperId: string, departmentId: string) {
  await guarded("화주 스코프 확인에 실패했습니다.", async () => {
    const { data, error } = await supabase.from("shippers").select("id, department_id").eq("id", shipperId).maybeSingle();
    if (error) throw error;
    if (!data) throw new RouteError("화주를 찾을 수 없습니다.", 404);
    if (text((data as DbRow).department_id) !== departmentId) throw new RouteError("선택한 부서에 속하지 않는 화주입니다.", 403);
  });
}
