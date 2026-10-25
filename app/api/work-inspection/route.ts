import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds, toMockScopeIds } from "@/lib/repositories/supabase-scope";
import { fetchWorkMasterData } from "@/lib/repositories/work-master-supabase-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  assertInspectionBelongsToWork,
  assertUuid,
  assertReviewRequestBelongsToWork,
  assertWorkInScope,
  guardErrorResponse,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromBody
} from "@/lib/server/scope-guard";
import { countStageStatuses, isStageApprovalReady, isStageDone } from "@/lib/inspection/method-plan";
import { getActiveInspections } from "@/lib/mobile/inspection-visibility";
import { checkNotPhotoInspection, checkPhotoReviewable } from "@/lib/server/inspection-guard";
import { INSPECTION_IMAGE_BUCKET, markPhotoReviewDecision, relativeStoragePath } from "@/lib/server/inspection-images";
import { getOcrPassThreshold, loadWorkOcrTexts, pickOcrExpectedText } from "@/lib/server/ocr-expected-text";
import { loadActiveStageRows, summarizePhotoReview } from "@/lib/server/photo-review";
import { loadInspectionSnapshot, maybeAdvanceWorkStatus } from "@/lib/server/work-auto-status";
import type {
  AdminReviewRequest,
  InspectionImage,
  MaterialMaster,
  Work,
  WorkInspection,
  WorkInspectionStage,
  WorkStatus
} from "@/lib/types/domain";
import type {
  AdjustmentStatusDto,
  InspectionTableRowDto,
  InspectionWithVerificationDto,
  OcrExpectedSourceDto,
  OcrReviewEvidenceDto,
  PendingReviewRequestDto,
  WorkInspectionAction,
  WorkInspectionActionResponse,
  WorkInspectionDataResponse
} from "@/lib/types/work-inspection-api";

type DbRow = Record<string, unknown>;

const workTypeOptions = ["리드레싱", "세트작업", "해체작업", "기타작업"];

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numberOrUndefined(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : undefined;
}

function jsonValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toWork(row: DbRow): Work & { work_type?: string; quantity?: number; finished_product_lot?: string; assigned_to?: string; assigned_at?: string } {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    work_master_id: text(row.work_master_id),
    document_no: text(row.document_no),
    work_date: text(row.work_date),
    status: text(row.status, "registered") as Work["status"],
    worker_name: text(row.worker_name),
    memo: text(row.memo),
    latest_inspected_at: text(row.latest_inspected_at) || undefined,
    work_type: text(row.work_type) || undefined,
    quantity: typeof row.quantity === "number" ? row.quantity : undefined,
    finished_product_lot: text(row.finished_product_lot) || undefined,
    assigned_to: text(row.assigned_to) || undefined,
    assigned_at: text(row.assigned_at) || undefined
  };
}

function toInspection(row: DbRow): WorkInspection {
  return {
    id: text(row.id),
    work_id: text(row.work_id),
    material_id: text(row.material_id),
    method: text(row.method, "OCR") as WorkInspection["method"],
    status: text(row.status, "pending") as WorkInspection["status"],
    // stage 컬럼(마이그레이션 이전 행/조회에는 없음)이 없으면 기존 시작검수로 취급한다.
    stage: (text(row.stage, "start") as WorkInspectionStage),
    ocr_result_text: text(row.ocr_result_text) || undefined,
    ocr_expected_text: text(row.ocr_expected_text) || undefined,
    ocr_match_rate: row.ocr_match_rate === null || row.ocr_match_rate === undefined ? undefined : numberOrUndefined(row.ocr_match_rate),
    vision_similarity: typeof row.vision_similarity === "number" ? row.vision_similarity : undefined,
    result_summary: text(row.result_summary),
    attempt_count: numberValue(row.attempt_count),
    target_type: (text(row.target_type) || undefined) as WorkInspection["target_type"],
    product_code: text(row.product_code) || undefined,
    product_name: text(row.product_name) || undefined,
    product_lot: text(row.product_lot) || undefined,
    review_comment: text(row.review_comment) || undefined,
    submitted_at: text(row.submitted_at) || undefined,
    reviewed_at: text(row.reviewed_at) || undefined
  };
}

function toImage(row: DbRow): InspectionImage {
  return {
    id: text(row.id),
    work_id: text(row.work_id),
    inspection_id: text(row.inspection_id),
    image_type: text(row.image_type, "admin_review") as InspectionImage["image_type"],
    storage_path: text(row.storage_path),
    is_compressed: typeof row.is_compressed === "boolean" ? row.is_compressed : true,
    metadata: jsonValue(row.metadata)
  };
}

function toRequest(row: DbRow): AdminReviewRequest {
  return {
    id: text(row.id),
    work_id: text(row.work_id),
    inspection_id: text(row.inspection_id),
    requester_id: text(row.requester_id),
    reason: text(row.reason),
    status: text(row.status, "requested") as AdminReviewRequest["status"],
    admin_id: text(row.admin_id) || undefined,
    admin_comment: text(row.admin_comment) || undefined,
    processed_at: text(row.processed_at) || undefined,
    created_at: text(row.created_at) || undefined
  };
}

// 확인요청 섹션(웹 작업검수 상단)에 쓰는 미처리 요청 목록을 만든다. 실제 admin_review_requests 행(status: requested) 기준.
function buildPendingReviewRequests(
  requestRows: AdminReviewRequest[],
  workById: Map<string, { document_no: string }>,
  inspectionById: Map<string, WorkInspection>,
  materialById: Map<string, MaterialMaster>,
  ocrEvidenceByInspection: Map<string, OcrReviewEvidenceDto> = new Map()
): PendingReviewRequestDto[] {
  return requestRows
    .filter((request) => request.status === "requested")
    .map((request) => {
      const inspection = inspectionById.get(request.inspection_id);
      const material = inspection ? materialById.get(inspection.material_id) : undefined;
      // 완료검수의 "완료제품사진" 항목은 material_id가 없어(PRODUCT) 부자재명 대신 고정 라벨을 보여준다.
      const materialName =
        material?.name ?? (inspection?.method === "PRODUCT" ? "완료제품사진" : inspection?.material_id) ?? "-";

      return {
        requestId: request.id,
        workId: request.work_id,
        documentNo: workById.get(request.work_id)?.document_no ?? "-",
        materialName,
        method: inspection?.method ?? "-",
        inspectionId: request.inspection_id,
        reason: request.reason,
        requestedAt: request.created_at,
        ...(ocrEvidenceByInspection.has(request.inspection_id) ? { ocr: ocrEvidenceByInspection.get(request.inspection_id) } : {})
      };
    });
}

// 판정 당시 스냅샷이 있으면 그 값, 없으면 현재 해석값(작업 지정 텍스트 → 마스터 검증값)을 기준 텍스트로 내려준다.
function resolveOcrView(
  inspection: WorkInspection,
  material: MaterialMaster | undefined,
  workOcrTexts: Map<string, string>
): { text: string; source: OcrExpectedSourceDto } {
  const workText = workOcrTexts.get(`${inspection.work_id}|${material?.code ?? ""}`);
  const resolved = pickOcrExpectedText(workText, material?.verification_value);
  const snapshot = inspection.ocr_expected_text;
  if (!snapshot?.trim()) return resolved;
  if (workText === snapshot) return { text: snapshot, source: "work" };
  if (material?.verification_value === snapshot) return { text: snapshot, source: "master" };
  return { text: snapshot, source: resolved.source === "none" ? "work" : resolved.source };
}

function withVerificationValue(
  inspections: WorkInspection[],
  materialById: Map<string, MaterialMaster>,
  workOcrTexts: Map<string, string> = new Map(),
  threshold = getOcrPassThreshold()
): InspectionWithVerificationDto[] {
  return inspections.map((inspection) => {
    const material = materialById.get(inspection.material_id);
    const base = { ...inspection, materialVerificationValue: material?.verification_value || undefined };
    if (inspection.method !== "OCR") return base;

    const view = resolveOcrView(inspection, material, workOcrTexts);
    return { ...base, ocrExpectedText: view.text || undefined, ocrExpectedSource: view.source, ocrThreshold: threshold };
  });
}

// 미처리 OCR 확인요청 건만 최근 촬영 사진 서명 URL(1시간)을 만든다(목록 전체 서명 금지).
async function buildOcrEvidence(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  requestRows: AdminReviewRequest[],
  inspectionById: Map<string, WorkInspection>,
  materialById: Map<string, MaterialMaster>,
  workOcrTexts: Map<string, string>,
  imageRows: DbRow[]
): Promise<Map<string, OcrReviewEvidenceDto>> {
  const evidence = new Map<string, OcrReviewEvidenceDto>();
  const threshold = getOcrPassThreshold();
  const targetIds = new Set<string>();

  for (const request of requestRows) {
    if (request.status !== "requested") continue;
    const inspection = inspectionById.get(request.inspection_id);
    if (inspection?.method !== "OCR") continue;
    targetIds.add(inspection.id);
    const view = resolveOcrView(inspection, materialById.get(inspection.material_id), workOcrTexts);
    evidence.set(inspection.id, {
      expectedText: view.text,
      expectedSource: view.source,
      recognizedText: inspection.ocr_result_text ?? "",
      matchRate: inspection.ocr_match_rate,
      threshold
    });
  }
  if (targetIds.size === 0) return evidence;

  const latestByInspection = new Map<string, DbRow>();
  for (const row of imageRows) {
    const inspectionId = text(row.inspection_id);
    if (text(row.image_type) !== "ocr_capture" || !targetIds.has(inspectionId)) continue;
    const current = latestByInspection.get(inspectionId);
    if (!current || text(row.created_at) > text(current.created_at)) latestByInspection.set(inspectionId, row);
  }
  const entries = [...latestByInspection.entries()];
  if (entries.length === 0) return evidence;

  const { data: signed, error } = await supabase.storage
    .from(INSPECTION_IMAGE_BUCKET)
    .createSignedUrls(entries.map(([, row]) => relativeStoragePath(INSPECTION_IMAGE_BUCKET, text(row.storage_path))), 60 * 60);
  if (error) throw error;

  entries.forEach(([inspectionId], index) => {
    const item = evidence.get(inspectionId);
    const url = signed?.[index]?.signedUrl;
    if (item && url) item.imageUrl = url;
  });
  return evidence;
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const key = getKey(row);
    acc[key] = [...(acc[key] ?? []), row];
    return acc;
  }, {});
}

// 사진 승인대기(submitted)가 걸린 단계. 두 단계에 모두 있으면 더 진행된 complete.
function getSubmittedPhotoStage(photoReview?: InspectionTableRowDto["photoReview"]): WorkInspectionStage | undefined {
  if ((photoReview?.complete?.submittedPhotos ?? 0) > 0) return "complete";
  if ((photoReview?.start?.submittedPhotos ?? 0) > 0) return "start";
  return undefined;
}

function getInspectionStep(
  work: Work,
  inspections: WorkInspection[],
  adjustmentStatus?: AdjustmentStatusDto,
  inspectionCompleted = false,
  assignedForInspection = false,
  photoReview?: InspectionTableRowDto["photoReview"]
) {
  if (work.status === "canceled") return "취소";
  if (work.status === "on_hold") return "보류";
  const hasAdminRequested = inspections.some((inspection) => inspection.status === "admin_requested");
  const photoStage = getSubmittedPhotoStage(photoReview);
  // 확인요청이 함께 걸려 있으면 확인요청 우선, 사진 승인대기만 있으면 단계별 승인대기 라벨(과거 조정승인 이력보다 우선)
  if (work.status === "admin_review_requested" && !hasAdminRequested && photoStage) {
    return photoStage === "complete" ? "완료승인대기" : "작업승인대기";
  }
  if (adjustmentStatus === "approved") return "관리자 조정승인";
  if (adjustmentStatus === "rejected") return "재검수 필요";
  if (adjustmentStatus === "retry_requested") return "재검수 요청";
  if (inspectionCompleted) return "검수완료";
  if (work.status === "registered") return assignedForInspection ? "검수대상" : "검수대기";
  if (hasAdminRequested || work.status === "admin_review_requested") {
    return "확인요청";
  }
  if (inspections.some((inspection) => inspection.status === "rejected")) return "사진반려";
  if (inspections.some((inspection) => inspection.status === "failed" || inspection.status === "retrying")) return "불일치/재검수";
  if (work.status === "completed" || work.status === "passed") return "검수완료";
  if (inspections.some((inspection) => inspection.status === "passed" || inspection.status === "admin_approved")) return "검수진행";
  if (work.status === "in_progress") return "모바일 검수중";
  return "검수대기";
}

function mockRows(departmentId: string, shipperId: string) {
  const scope = toMockScopeIds(departmentId, shipperId);
  const works = appRepository.listWorks(scope);
  const workMasters = appRepository.listWorkMasters(scope);
  const requests = appRepository.listAdminReviewRequests();
  const materialById = new Map(appRepository.listMaterials({}).map((material) => [material.id, material]));
  const inspectionById = new Map(appRepository.listInspections().map((inspection) => [inspection.id, inspection]));
  const workById = new Map(works.map((work) => [work.id, work]));
  const pendingReviewRequests = buildPendingReviewRequests(requests, workById, inspectionById, materialById);

  return { pendingReviewRequests, rows: works.map((work, index): InspectionTableRowDto => {
    const workMaster = workMasters.find((item) => item.id === work.work_master_id);
    const request = requests.find((item) => item.work_id === work.id);
    const inspections = withVerificationValue(appRepository.listInspections(work.id), materialById);
    const images = appRepository.listInspectionImages(work.id);
    const adjustmentStatus = request?.status;

    return {
      work,
      registeredAt: work.work_date,
      workType: workTypeOptions[index % workTypeOptions.length],
      finishedProductCode: workMaster?.code ?? "-",
      finishedProductName: workMaster?.name ?? "-",
      quantity: 80 + index * 25,
      inspectionStep: getInspectionStep(work, inspections, adjustmentStatus),
      request,
      inspections,
      images,
      adjustmentStatus,
      inspectionCompleted: work.status === "passed" || work.status === "completed"
    };
  }) };
}

function mockData(departmentId: string, shipperId: string, warning?: string): WorkInspectionDataResponse {
  const { rows, pendingReviewRequests } = mockRows(departmentId, shipperId);
  return {
    source: "mock",
    warning,
    rows,
    pendingReviewRequests
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("department_id");
  const shipperId = searchParams.get("shipper_id");
  // rows(표/모바일 검수 카드) 기준 stage. 기본값 "start"(기존 웹 작업검수 화면·useMobileInspectionRows()가
  // 이 기본값으로 계속 시작검수만 본다). 완료검수 모바일 화면만 stage=complete로 명시 호출한다.
  const stageParam: WorkInspectionStage = searchParams.get("stage") === "complete" ? "complete" : "start";

  if (!departmentId || !shipperId) {
    return NextResponse.json({ error: "department_id와 shipper_id가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(mockData(departmentId, shipperId));
  }

  try {
    const scope = await resolveScopeIds(supabase, departmentId, shipperId);
    const masterData = await fetchWorkMasterData(supabase, scope.departmentId, scope.shipperId);
    const { data: workRows, error: workError } = await supabase
      .from("works")
      .select("*")
      .eq("department_id", scope.departmentId)
      .eq("shipper_id", scope.shipperId);

    if (workError) throw workError;

    const works = ((workRows ?? []) as DbRow[]).map(toWork);
    const workIds = works.map((work) => work.id);
    const inspections = workIds.length > 0
      ? // 정렬이 없으면 상태가 바뀐 행의 순서가 달라져 모바일 카드 번호(제품 1/2 등)가 뒤바뀌므로 생성순으로 고정한다.
        await supabase
          .from("work_inspections")
          .select("*")
          .in("work_id", workIds)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
      : { data: [], error: null };
    if (inspections.error) throw inspections.error;

    const images = workIds.length > 0
      ? await supabase.from("inspection_images").select("*").in("work_id", workIds)
      : { data: [], error: null };
    if (images.error) throw images.error;

    const requests = workIds.length > 0
      ? await supabase.from("admin_review_requests").select("*").in("work_id", workIds)
      : { data: [], error: null };
    if (requests.error) throw requests.error;

    // inspectionRows(전체, stage 무관)는 확인요청 섹션(pendingReviewRequests)에만 쓴다 - 관리자는 시작검수/완료검수
    // 확인요청을 한 곳에서 함께 승인 처리할 수 있어야 한다(기존 설계 유지). 표/모바일 카드용 rows는 stageParam
    // 기준으로 좁힌 selectedInspectionRows만 사용해 두 검수 단계가 섞이지 않게 한다.
    const inspectionRows = ((inspections.data ?? []) as DbRow[]).map(toInspection);
    const allInspectionsByWork = groupBy(inspectionRows, (inspection) => inspection.work_id);
    const selectedInspectionRows = inspectionRows.filter((inspection) => (inspection.stage ?? "start") === stageParam);
    const selectedInspectionIds = new Set(selectedInspectionRows.map((inspection) => inspection.id));

    const imageRows = ((images.data ?? []) as DbRow[]).map(toImage).filter((image) => selectedInspectionIds.has(image.inspection_id));
    const requestRows = ((requests.data ?? []) as DbRow[]).map(toRequest);
    const inspectionsByWork = groupBy(selectedInspectionRows, (inspection) => inspection.work_id);
    const imagesByWork = groupBy(imageRows, (image) => image.work_id);
    const requestByWork = new Map(requestRows.map((reviewRequest) => [reviewRequest.work_id, reviewRequest]));
    const workMasterById = new Map(masterData.workMasters.map((workMaster) => [workMaster.id, workMaster]));
    const materialById = new Map(masterData.materials.map((material) => [material.id, material]));
    const inspectionById = new Map(inspectionRows.map((inspection) => [inspection.id, inspection]));
    const workById = new Map(works.map((work) => [work.id, work]));
    const workOcrTexts = await loadWorkOcrTexts(supabase, workIds);
    const ocrEvidence = await buildOcrEvidence(supabase, requestRows, inspectionById, materialById, workOcrTexts, (images.data ?? []) as DbRow[]);
    const pendingReviewRequests = buildPendingReviewRequests(requestRows, workById, inspectionById, materialById, ocrEvidence);

    const rows = works.map((work, index): InspectionTableRowDto => {
      const workMaster = workMasterById.get(work.work_master_id);
      // 사진 요약은 시작·완료 두 단계를 모두 내려야 하므로 stage 필터 전 전체 행으로 계산한다(화면과 같은 가시성 규칙 적용).
      const activeRows = getActiveInspections(
        (allInspectionsByWork[work.id] ?? []).map((inspection) => ({ ...inspection, target_type: inspection.target_type ?? null })),
        masterData.materials
      );
      const photoReview: NonNullable<InspectionTableRowDto["photoReview"]> = {};
      for (const photoStage of ["start", "complete"] as const) {
        const summary = summarizePhotoReview(activeRows.filter((inspection) => (inspection.stage ?? "start") === photoStage));
        if (summary) photoReview[photoStage] = summary;
      }
      const hasSubmittedPhoto = Object.values(photoReview).some((summary) => summary.submittedPhotos > 0);
      const hasAdminRequestedRow = activeRows.some((inspection) => inspection.status === "admin_requested");
      const requestRow =
        requestByWork.get(work.id) ??
        // 사진 승인대기만으로 admin_review_requested인 작업은 확인요청 상세가 없는 것이 정상이므로 가상 요청을 만들지 않는다.
        (work.status === "admin_review_requested" && (hasAdminRequestedRow || !hasSubmittedPhoto)
          ? {
              id: `virtual-${work.id}`,
              work_id: work.id,
              inspection_id: "",
              requester_id: "",
              reason: "관리자 확인 요청 상태입니다. 상세 요청 데이터가 없으면 현장 사진과 검수 이력을 확인한 뒤 조정 처리해주세요.",
              status: "requested" as const
            }
          : undefined);
      const workInspections = withVerificationValue(inspectionsByWork[work.id] ?? [], materialById, workOcrTexts);
      const adjustmentStatus = requestRow?.status;
      const inspectionCompleted = work.status === "passed" || work.status === "completed";

      return {
        work,
        registeredAt: work.work_date,
        workType: work.work_type ?? workTypeOptions[index % workTypeOptions.length],
        finishedProductCode: workMaster?.code ?? "-",
        finishedProductName: workMaster?.name ?? "-",
        quantity: work.quantity ?? 80 + index * 25,
        inspectionStep: getInspectionStep(
          work,
          workInspections,
          adjustmentStatus,
          inspectionCompleted,
          Boolean(work.assigned_to || work.assigned_at),
          photoReview
        ),
        request: requestRow,
        inspections: workInspections,
        images: imagesByWork[work.id] ?? [],
        adjustmentStatus,
        inspectionCompleted,
        ...(Object.keys(photoReview).length > 0 ? { photoReview } : {})
      };
    });

    return NextResponse.json({ source: "supabase", rows, pendingReviewRequests } satisfies WorkInspectionDataResponse);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Supabase 작업검수 조회에 실패했습니다.") }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    departmentId?: string;
    shipperId?: string;
    workId?: string;
    action?: WorkInspectionAction;
  };

  const requestScope = scopeFromBody(body);
  if (!requestScope) return missingScopeResponse();

  if (!body.workId || !body.action) {
    return NextResponse.json({ error: "workId와 action이 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", workId: body.workId } satisfies WorkInspectionActionResponse);
  }

  const workId = body.workId;
  const action = body.action;

  try {
    assertUuid(workId, "workId");
    if (action.type === "adjustment" || action.type === "request_review") {
      if (action.inspectionId) assertUuid(action.inspectionId, "inspectionId");
      if (action.type === "adjustment" && action.requestId && !action.requestId.startsWith("virtual-")) assertUuid(action.requestId, "requestId");
    }
    // 작업 소속 대조 후, 본문의 inspectionId/requestId도 같은 작업의 것인지 확인한다(다른 작업의 항목 조작 차단).
    const workRow = await assertWorkInScope(supabase, workId, await resolveRequestScope(supabase, requestScope));
    const currentStatus = text((workRow as DbRow).status);
    const workClosed =
      currentStatus === "canceled" || currentStatus === "on_hold" || currentStatus === "completed" || currentStatus === "passed";

    if (action.type === "adjustment" || action.type === "request_review") {
      if (action.inspectionId) {
        await assertInspectionBelongsToWork(supabase, action.inspectionId, workId);
        // 사진검수 항목은 확인요청 체계와 분리한다(승인/반려는 photo_* 액션으로만 처리).
        const { data: targetRow, error: targetError } = await supabase
          .from("work_inspections")
          .select("method")
          .eq("id", action.inspectionId)
          .maybeSingle();
        if (targetError) throw targetError;
        const photoFailure = targetRow ? checkNotPhotoInspection(targetRow as DbRow) : null;
        if (photoFailure) return NextResponse.json({ error: photoFailure.error }, { status: photoFailure.status });
      }
      if (action.type === "adjustment" && action.requestId && !action.requestId.startsWith("virtual-")) {
        await assertReviewRequestBelongsToWork(supabase, action.requestId, workId);
      }
    }

    if (action.type === "complete") {
      if (workClosed) {
        return NextResponse.json({ error: "취소/보류/완료된 작업은 검수완료 처리할 수 없습니다." }, { status: 409 });
      }

      // 완료검수 항목이 전부 합격(승인 포함)이어야 한다. 항목이 없거나 하나라도 남으면 409.
      const snapshot = await loadInspectionSnapshot(supabase, workId);
      if (!isStageDone(snapshot.complete)) {
        const c = snapshot.complete;
        return NextResponse.json(
          {
            error: `완료검수가 아직 끝나지 않아 검수완료 처리할 수 없습니다. (전체 ${c.total} / 합격 ${c.passed} / 승인대기 ${c.submitted} / 불합격·반려 ${c.failed} / 확인요청 ${c.adminRequested} / 미진행 ${c.pending})`
          },
          { status: 409 }
        );
      }

      // 상태를 강제로 바꾸지 않고 자동 전이 규칙(시작·완료검수 집계 기준)에 맡긴다.
      const nextStatus = await maybeAdvanceWorkStatus(supabase, workId);
      if (nextStatus === null) {
        return NextResponse.json({ error: "작업 상태 판정 중 오류가 발생했습니다." }, { status: 502 });
      }
      if (nextStatus !== "completed") {
        return NextResponse.json(
          { error: "시작검수가 아직 완료되지 않아 검수완료 처리할 수 없습니다. 부자재 검수를 먼저 완료해주세요." },
          { status: 409 }
        );
      }

      return NextResponse.json({ source: "supabase", workId, workStatus: nextStatus } satisfies WorkInspectionActionResponse);
    }

    if (action.type === "photo_review" || action.type === "photo_approve_work" || action.type === "photo_reject_work") {
      return await handlePhotoAction(supabase, workId, action, workClosed);
    }

    if (action.type === "request_review") {
      const { inspectionId } = action;
      if (!inspectionId) {
        return NextResponse.json({ error: "inspectionId가 필요합니다." }, { status: 400 });
      }

      // 종료(완료·취소·보류)된 작업이 확인요청으로 되살아나 상태가 어긋나는 것을 막는다.
      if (workClosed) {
        return NextResponse.json({ error: "취소/보류/완료된 작업은 확인요청할 수 없습니다." }, { status: 409 });
      }

      const label = action.label?.trim() || "현장 검수 취소 요청";
      const reason = action.reason?.trim() ? `${label} - ${action.reason.trim()}` : label;
      const requestedAt = new Date().toISOString();

      // 멱등: 같은 검수 건에 처리 대기 중인 요청이 이미 있으면 다시 만들지 않는다.
      const { data: existingRequest, error: existingError } = await supabase
        .from("admin_review_requests")
        .select("id")
        .eq("inspection_id", inspectionId)
        .eq("status", "requested")
        .maybeSingle();
      if (existingError) throw existingError;

      let requestId = (existingRequest as DbRow | null)?.id as string | undefined;

      if (!requestId) {
        const { data: insertedRequest, error: insertError } = await supabase
          .from("admin_review_requests")
          .insert({
            work_id: workId,
            inspection_id: inspectionId,
            // requester_id는 uuid 컬럼이라 모바일에서 특정할 수 없는 경우 비워둔다(NULL 허용).
            reason,
            status: "requested"
          })
          .select("id")
          .maybeSingle();
        if (insertError) throw insertError;
        requestId = (insertedRequest as DbRow | null)?.id as string | undefined;
      }

      const { error: inspectionUpdateError } = await supabase
        .from("work_inspections")
        .update({ status: "admin_requested", result_summary: reason, updated_at: requestedAt })
        .eq("id", inspectionId);
      if (inspectionUpdateError) throw inspectionUpdateError;

      const { error: workUpdateError } = await supabase
        .from("works")
        .update({ status: "admin_review_requested", latest_inspected_at: requestedAt })
        .eq("id", workId);
      if (workUpdateError) throw workUpdateError;

      return NextResponse.json({
        source: "supabase",
        workId,
        requestId
      } satisfies WorkInspectionActionResponse);
    }

    if (action.type !== "adjustment") {
      return NextResponse.json({ error: "지원하지 않는 action입니다." }, { status: 400 });
    }

    const status = action.status;
    const processedAt = new Date().toISOString();
    const updatePayload = {
      status,
      processed_at: processedAt,
      admin_comment: status === "approved" ? "관리자 조정승인" : status === "retry_requested" ? "재검수 요청" : "조정 미승인"
    };

    if (!action.requestId.startsWith("virtual-")) {
      let reviewResult = await supabase
        .from("admin_review_requests")
        .update(updatePayload)
        .eq("id", action.requestId);

      if (reviewResult.error) {
        reviewResult = await supabase.from("admin_review_requests").update({ status }).eq("id", action.requestId);
      }
      if (reviewResult.error) throw reviewResult.error;
    }

    const nextInspectionStatus = status === "approved" ? "admin_approved" : status === "retry_requested" ? "retrying" : "failed";
    let inspectionUpdateQuery = supabase
      .from("work_inspections")
      .update({ status: nextInspectionStatus })
      .eq("work_id", workId)
      .eq("status", "admin_requested");
    if (action.inspectionId) {
      inspectionUpdateQuery = inspectionUpdateQuery.eq("id", action.inspectionId);
    }
    const { error: inspectionUpdateError } = await inspectionUpdateQuery;
    if (inspectionUpdateError) throw inspectionUpdateError;

    // 같은 작업에 아직 처리되지 않은 확인요청 항목이 남아있으면 작업 상태는 관리자 확인 대기로 유지한다.
    const { count: remainingCount, error: remainingError } = await supabase
      .from("work_inspections")
      .select("id", { count: "exact", head: true })
      .eq("work_id", workId)
      .eq("status", "admin_requested");
    if (remainingError) throw remainingError;

    let workStatus: WorkStatus | undefined;
    if (!remainingCount) {
      // 승인/재검수/미승인 모두 최신 검수 집계로 다시 판정한다(미완료면 등록/진행 복귀, 불합격이면 반려, 사진 승인대기가
      // 남았으면 승인대기 유지). 별도로 registered로 강제복귀하지 않는다.
      const next = await maybeAdvanceWorkStatus(supabase, workId);
      if (next === null) {
        return NextResponse.json({ error: "조정은 저장되었으나 작업 상태 판정 중 오류가 발생했습니다." }, { status: 502 });
      }
      workStatus = next;
    }

    return NextResponse.json({
      source: "supabase",
      workId,
      requestId: action.requestId,
      status,
      ...(workStatus ? { workStatus } : {})
    } satisfies WorkInspectionActionResponse);
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "작업검수 처리 저장에 실패했습니다.") }, { status: 502 });
  }
}

type PhotoAction = Extract<WorkInspectionAction, { type: "photo_review" | "photo_approve_work" | "photo_reject_work" }>;
type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

function isStage(value: unknown): value is WorkInspectionStage {
  return value === "start" || value === "complete";
}

// 승인/반려 처리 1건: submitted 조건부 update로 동시 처리 경합을 막고(0행이면 false), 현재 사진 metadata도 갱신한다.
async function decidePhoto(
  supabase: ServerSupabase,
  inspectionId: string,
  decision: "approved" | "rejected",
  reason: string | null
) {
  const decidedAt = new Date().toISOString();
  const payload =
    decision === "approved"
      ? { status: "admin_approved", review_comment: null, reviewed_at: decidedAt, updated_at: decidedAt }
      : { status: "rejected", review_comment: reason, reviewed_at: decidedAt, updated_at: decidedAt };
  const { data, error } = await supabase
    .from("work_inspections")
    .update(payload)
    .eq("id", inspectionId)
    .eq("status", "submitted")
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) return false;

  await markPhotoReviewDecision(supabase, inspectionId, decision, reason, decidedAt);
  return true;
}

const RACE_MESSAGE = "다른 처리로 이미 상태가 변경된 항목이 있습니다. 새로고침 후 다시 확인해주세요.";

// photo_review / photo_approve_work / photo_reject_work. 가드 오류(RouteError)와 DB 오류는 호출부 catch가 처리한다.
async function handlePhotoAction(supabase: ServerSupabase, workId: string, action: PhotoAction, workClosed: boolean) {
  const closedResponse = () =>
    NextResponse.json({ error: "취소/보류/완료된 작업은 사진 승인·반려 처리할 수 없습니다." }, { status: 409 });

  if (action.type === "photo_review") {
    const decisions = Array.isArray(action.decisions) ? action.decisions : [];
    if (decisions.length === 0) {
      return NextResponse.json({ error: "처리할 항목(decisions)이 필요합니다." }, { status: 400 });
    }
    const ids = new Set<string>();
    for (const item of decisions) {
      if (!item?.inspectionId || (item.decision !== "approved" && item.decision !== "rejected")) {
        return NextResponse.json({ error: "decisions 각 항목에 inspectionId와 decision(approved|rejected)이 필요합니다." }, { status: 400 });
      }
      if (item.decision === "rejected" && !item.reason?.trim()) {
        return NextResponse.json({ error: "반려 사유를 입력해주세요." }, { status: 400 });
      }
      if (ids.has(item.inspectionId)) {
        return NextResponse.json({ error: "같은 항목이 중복되었습니다." }, { status: 400 });
      }
      ids.add(item.inspectionId);
    }

    for (const id of ids) {
      assertUuid(id, "inspectionId");
      await assertInspectionBelongsToWork(supabase, id, workId);
    }
    // 소속(403) 검사 뒤에 작업 상태(409)를 본다.
    if (workClosed) return closedResponse();

    const { data: rows, error: rowsError } = await supabase.from("work_inspections").select("id, method, status").in("id", Array.from(ids));
    if (rowsError) throw rowsError;
    for (const row of (rows ?? []) as DbRow[]) {
      const failure = checkPhotoReviewable(row);
      if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });
    }

    let raced = false;
    for (const item of decisions) {
      const done = await decidePhoto(supabase, item.inspectionId, item.decision, item.decision === "rejected" ? (item.reason ?? "").trim() : null);
      if (!done) raced = true;
    }

    const workStatus = await maybeAdvanceWorkStatus(supabase, workId);
    if (workStatus === null) {
      return NextResponse.json({ error: "처리는 저장되었으나 작업 상태 판정 중 오류가 발생했습니다." }, { status: 502 });
    }
    if (raced) return NextResponse.json({ error: RACE_MESSAGE }, { status: 409 });
    return NextResponse.json({ source: "supabase", workId, workStatus } satisfies WorkInspectionActionResponse);
  }

  if (workClosed) return closedResponse();

  if (!isStage(action.stage)) {
    return NextResponse.json({ error: "stage(start|complete)가 필요합니다." }, { status: 400 });
  }
  const stage = action.stage;

  if (action.type === "photo_reject_work" && !action.reason?.trim()) {
    return NextResponse.json({ error: "반려 사유를 입력해주세요." }, { status: 400 });
  }

  const { rows } = await loadActiveStageRows(supabase, workId, stage);
  const counts = countStageStatuses(rows.map((row) => row.status));
  const submittedPhotos = rows.filter((row) => row.method === "PHOTO" && row.status === "submitted");

  if (action.type === "photo_approve_work") {
    if (!isStageApprovalReady(counts)) {
      const reasons = [
        counts.pending > 0 ? `미진행 ${counts.pending}건` : "",
        counts.failed > 0 ? `불합격·반려 ${counts.failed}건` : "",
        counts.adminRequested > 0 ? `확인요청 ${counts.adminRequested}건` : "",
        counts.submitted === 0 ? "승인대기 항목 없음" : ""
      ].filter(Boolean);
      return NextResponse.json({ error: `작업승인 조건을 충족하지 못했습니다. (${reasons.join(", ")})` }, { status: 409 });
    }
  } else if (submittedPhotos.length === 0) {
    return NextResponse.json({ error: "반려할 승인대기 사진이 없습니다." }, { status: 409 });
  }

  const decision = action.type === "photo_approve_work" ? "approved" : "rejected";
  const reason = action.type === "photo_reject_work" ? action.reason.trim() : null;
  let raced = false;
  for (const row of submittedPhotos) {
    if (!(await decidePhoto(supabase, row.id, decision, reason))) raced = true;
  }

  const workStatus = await maybeAdvanceWorkStatus(supabase, workId);
  if (workStatus === null) {
    return NextResponse.json({ error: "처리는 저장되었으나 작업 상태 판정 중 오류가 발생했습니다." }, { status: 502 });
  }
  if (raced) return NextResponse.json({ error: RACE_MESSAGE }, { status: 409 });

  const expected: WorkStatus = stage === "start" ? "in_progress" : "completed";
  if (action.type === "photo_approve_work" && workStatus !== expected) {
    return NextResponse.json(
      { error: `승인은 저장되었으나 작업상태가 ${expected}로 전환되지 않았습니다. (현재 ${workStatus})` },
      { status: 409 }
    );
  }
  return NextResponse.json({ source: "supabase", workId, workStatus } satisfies WorkInspectionActionResponse);
}
