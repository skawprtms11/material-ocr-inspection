import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeMaterialInspectionMethod } from "@/lib/inspection/method-plan";
import { appRepository } from "@/lib/repositories/app-repository";
import { loadWorkMasterMaterialRows } from "@/lib/server/work-master-bom";
import type { WorkMaster } from "@/lib/types/domain";
import type {
  CreateWorkRegistrationRequest,
  PendingAssignmentWorkDto,
  WorkComponentRowDto
} from "@/lib/types/work-register-api";

export type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;
export type DbRow = Record<string, unknown>;

// 검수 시작 여부에 따른 수정 잠금 사유가 붙은 할당대기 작업(GET 응답 전용 확장)
export type EditablePendingWorkDto = PendingAssignmentWorkDto & { editLockedReason?: string };

export const EDIT_LOCKED_REASON = "검수가 시작되어 수정할 수 없습니다.";
export const EDIT_LOCKED_ATTEMPT_REASON = "검수 시도 이력(촬영·판정)이 있어 수정할 수 없습니다.";

export const OCR_TEXT_MAX_LENGTH = 1000;

// 검수행 중 pending이 아니거나 시도 이력(attempt_count > 0)이 있으면 수정 잠금 사유를 돌려준다.
// OCR 일치율 미달 판정은 상태를 바꾸지 않고 증거만 남기므로 status만으로는 시작 여부를 알 수 없다.
export function inspectionEditLockReason(rows: DbRow[]) {
  if (rows.some((row) => text(row.status) !== "pending")) return EDIT_LOCKED_REASON;
  if (rows.some((row) => numberValue(row.attempt_count) > 0)) return EDIT_LOCKED_ATTEMPT_REASON;
  return null;
}

// 라우트가 의도한 HTTP 상태로 응답하기 위한 오류(그 외 예외는 Supabase 실패로 보고 502 처리)
export class RouteError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function addDays(dateValue: string, days: number) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function workMasterFromRow(row: DbRow): WorkMaster {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    code: text(row.code),
    name: text(row.name),
    description: text(row.description),
    is_active: typeof row.is_active === "boolean" ? row.is_active : true
  };
}

export function makePendingWork(
  row: DbRow,
  workMaster?: WorkMaster,
  components?: WorkComponentRowDto[],
  editLockedReason?: string
): EditablePendingWorkDto {
  const workDate = text(row.work_date, new Date().toISOString().slice(0, 10));

  return {
    id: text(row.id),
    registeredAt: workDate,
    workMasterId: text(row.work_master_id),
    workType: text(row.work_type, "리드레싱"),
    documentNo: text(row.document_no),
    finishedProductCode: workMaster?.code ?? "-",
    finishedProductName: workMaster?.name ?? "-",
    finishedProductLot: text(row.finished_product_lot, ""),
    quantity: numberValue(row.quantity),
    dueDate: text(row.due_date, addDays(workDate, 2)),
    memo: text(row.memo),
    componentRows: components,
    ...(editLockedReason ? { editLockedReason } : {})
  };
}

// work_components 실컬럼: component_type / component_code / component_name (group_id·sort_order 없음 → 코드로 그룹핑)
export function componentFromRow(row: DbRow): WorkComponentRowDto {
  const code = text(row.component_code);

  return {
    rowId: text(row.id),
    groupId: code,
    kind: text(row.component_type) === "부자재" ? "부자재" : "제품",
    code,
    name: text(row.component_name),
    unitQuantity: numberValue(row.unit_quantity, 1),
    requiredQuantity: numberValue(row.required_quantity),
    lot: text(row.lot),
    allocatedQuantity: numberValue(row.allocated_quantity),
    memo: text(row.memo),
    ...(text(row.ocr_expected_text) ? { ocrExpectedText: text(row.ocr_expected_text) } : {})
  };
}

function compareComponents(a: DbRow, b: DbRow) {
  const kindOrder = (row: DbRow) => (text(row.component_type) === "부자재" ? 1 : 0);
  return (
    kindOrder(a) - kindOrder(b) ||
    text(a.created_at).localeCompare(text(b.created_at)) ||
    text(a.component_code).localeCompare(text(b.component_code))
  );
}

export async function fetchComponentsByWorkIds(supabase: ServerSupabase, workIds: string[]) {
  if (workIds.length === 0) return {};

  const { data, error } = await supabase.from("work_components").select("*").in("work_id", workIds);
  if (error) throw error;

  return ((data ?? []) as DbRow[]).sort(compareComponents).reduce<Record<string, WorkComponentRowDto[]>>((acc, row) => {
    const workId = text(row.work_id);
    acc[workId] = [...(acc[workId] ?? []), componentFromRow(row)];
    return acc;
  }, {});
}

function componentToInsertRow(workId: string, row: WorkComponentRowDto) {
  return {
    work_id: workId,
    component_type: row.kind,
    component_code: row.code,
    component_name: row.name,
    unit_quantity: row.unitQuantity,
    required_quantity: row.requiredQuantity,
    lot: row.lot,
    allocated_quantity: row.allocatedQuantity,
    memo: row.memo,
    ocr_expected_text: row.kind === "부자재" && row.ocrExpectedText?.trim() ? row.ocrExpectedText.trim() : null
  };
}

export async function insertWorkComponents(supabase: ServerSupabase, workId: string, rows: WorkComponentRowDto[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from("work_components").insert(rows.map((row) => componentToInsertRow(workId, row)));
  if (error) throw error;
}

// 기존 구성품을 백업 → 삭제 → 재삽입한다. 실패 시 백업을 복원하고, 이후 단계 실패용 restore도 돌려준다.
export async function replaceWorkComponents(supabase: ServerSupabase, workId: string, rows: WorkComponentRowDto[]) {
  const { data: backupData, error: backupError } = await supabase.from("work_components").select("*").eq("work_id", workId);
  if (backupError) throw backupError;
  const backup = (backupData ?? []) as DbRow[];

  const restore = async () => {
    const { error: clearError } = await supabase.from("work_components").delete().eq("work_id", workId);
    if (clearError) throw new RouteError(`구성품 복원 실패(수동 확인 필요): ${clearError.message}`, 502);
    if (backup.length === 0) return;
    const { error: restoreError } = await supabase.from("work_components").insert(backup);
    if (restoreError) throw new RouteError(`구성품 복원 실패(수동 확인 필요): ${restoreError.message}`, 502);
  };

  const { error: deleteError } = await supabase.from("work_components").delete().eq("work_id", workId);
  if (deleteError) throw deleteError;

  try {
    await insertWorkComponents(supabase, workId, rows);
  } catch (error) {
    await restore();
    throw error;
  }

  return { restore };
}

// 실DB 모드에서 작업마스터가 요청 부서/화주 소속인지 검증한다(다른 스코프의 작업마스터 사용 차단).
export async function fetchScopedWorkMaster(
  supabase: ServerSupabase,
  workMasterId: string,
  scope: { departmentId: string; shipperId: string }
) {
  const { data, error } = await supabase.from("work_masters").select("*").eq("id", workMasterId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RouteError("작업마스터를 찾을 수 없습니다.", 404);

  const workMaster = workMasterFromRow(data as DbRow);
  if (workMaster.department_id !== scope.departmentId || workMaster.shipper_id !== scope.shipperId) {
    throw new RouteError("선택한 부서/화주에 속하지 않는 작업마스터입니다.", 403);
  }
  return workMaster;
}

export function validateRegistrationBody(body: Partial<CreateWorkRegistrationRequest>, requireProducts: boolean) {
  if (!body.departmentId || !body.shipperId || !body.workMasterId || !body.documentNo) {
    return "작업등록 필수값이 부족합니다.";
  }
  if (typeof body.quantity !== "number" || !Number.isInteger(body.quantity) || body.quantity <= 0 || body.quantity > 1_000_000) {
    return "작업수량은 1 이상 1,000,000 이하의 정수여야 합니다.";
  }
  if (!Array.isArray(body.componentRows)) return "구성품 정보가 필요합니다.";
  if (requireProducts && !body.componentRows.some((row) => row.kind === "제품")) {
    return "제품 구성 미등록 — 작업마스터에서 사용제품코드를 먼저 등록하세요.";
  }
  return null;
}

// OCR 검수 텍스트 검증·정리. OCR 대상(부자재마스터 inspection_method OCR/BOTH) 여부는 클라이언트 행이 아니라
// 작업마스터 부자재 매핑 × 부자재마스터에서 서버가 다시 판단한다. 대상 행만 텍스트(trim)를 남기고 나머지는 제거한다.
// 부자재는 작업당 1행이라 텍스트 단위는 부자재 단위다(부자재 LOT 분할이 생기면 같은 코드 행의 텍스트 일치 검증이 필요).
export async function prepareOcrComponentRows(
  supabase: ServerSupabase | null,
  scope: { departmentId: string; shipperId: string },
  workMasterId: string,
  rows: WorkComponentRowDto[]
): Promise<WorkComponentRowDto[]> {
  const targetCodes = new Set<string>();

  if (supabase) {
    const { mappings, materialById } = await loadWorkMasterMaterialRows(supabase, workMasterId);
    for (const mapping of mappings) {
      const material = materialById.get(text(mapping.material_id));
      const method = normalizeMaterialInspectionMethod(material?.inspection_method);
      if (material && (method === "OCR" || method === "BOTH")) targetCodes.add(text(material.code));
    }
  } else {
    const materials = appRepository.listMaterials(scope);
    for (const mapping of appRepository.listWorkMasterMaterials(workMasterId)) {
      const material = materials.find((item) => item.id === mapping.material_id);
      if (material && (material.inspection_method === "OCR" || material.inspection_method === "BOTH")) {
        targetCodes.add(material.code);
      }
    }
  }

  const missing: string[] = [];
  const tooLong: string[] = [];
  const sanitized = rows.map((row) => {
    const isTarget = row.kind === "부자재" && targetCodes.has(row.code);
    const value = typeof row.ocrExpectedText === "string" ? row.ocrExpectedText.trim() : "";
    const rest = { ...row };
    delete rest.ocrExpectedText;
    if (!isTarget) return rest;
    if (!value) missing.push(row.code);
    else if (Array.from(value).length > OCR_TEXT_MAX_LENGTH) tooLong.push(row.code);
    return { ...rest, ocrExpectedText: value };
  });

  const submittedCodes = new Set(rows.filter((row) => row.kind === "부자재").map((row) => row.code));
  for (const code of targetCodes) if (!submittedCodes.has(code)) missing.push(code);

  if (missing.length > 0) throw new RouteError(`OCR 검수 텍스트를 입력하세요: ${missing.join(", ")}`, 400);
  if (tooLong.length > 0) {
    throw new RouteError(`OCR 검수 텍스트는 ${OCR_TEXT_MAX_LENGTH}자 이하여야 합니다: ${tooLong.join(", ")}`, 400);
  }
  return sanitized;
}
