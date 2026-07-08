import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import { fetchWorkMasterData } from "@/lib/repositories/work-master-supabase-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AdminReviewRequest, InspectionImage, Work, WorkInspection } from "@/lib/types/domain";
import type {
  AdjustmentStatusDto,
  InspectionTableRowDto,
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
    ocr_result_text: text(row.ocr_result_text) || undefined,
    vision_similarity: typeof row.vision_similarity === "number" ? row.vision_similarity : undefined,
    result_summary: text(row.result_summary),
    attempt_count: numberValue(row.attempt_count)
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
    processed_at: text(row.processed_at) || undefined
  };
}

function groupBy<T>(rows: T[], getKey: (row: T) => string) {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const key = getKey(row);
    acc[key] = [...(acc[key] ?? []), row];
    return acc;
  }, {});
}

function getInspectionStep(
  work: Work,
  inspections: WorkInspection[],
  adjustmentStatus?: AdjustmentStatusDto,
  inspectionCompleted = false,
  assignedForInspection = false
) {
  if (work.status === "canceled") return "취소";
  if (work.status === "on_hold") return "보류";
  if (adjustmentStatus === "approved") return "관리자 조정승인";
  if (adjustmentStatus === "rejected") return "재검수 필요";
  if (adjustmentStatus === "retry_requested") return "재검수 요청";
  if (inspectionCompleted) return "검수완료";
  if (work.status === "registered") return assignedForInspection ? "검수대상" : "검수대기";
  if (inspections.some((inspection) => inspection.status === "admin_requested") || work.status === "admin_review_requested") {
    return "확인요청";
  }
  if (inspections.some((inspection) => inspection.status === "failed" || inspection.status === "retrying")) return "불일치/재검수";
  if (work.status === "completed" || work.status === "passed") return "검수완료";
  if (inspections.some((inspection) => inspection.status === "passed" || inspection.status === "admin_approved")) return "검수진행";
  if (work.status === "in_progress") return "모바일 검수중";
  return "검수대기";
}

function mockRows(departmentId: string, shipperId: string) {
  const works = appRepository.listWorks({ departmentId, shipperId });
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });
  const requests = appRepository.listAdminReviewRequests();

  return works.map((work, index): InspectionTableRowDto => {
    const workMaster = workMasters.find((item) => item.id === work.work_master_id);
    const request = requests.find((item) => item.work_id === work.id);
    const inspections = appRepository.listInspections(work.id);
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
  });
}

function mockData(departmentId: string, shipperId: string, warning?: string): WorkInspectionDataResponse {
  return {
    source: "mock",
    warning,
    rows: mockRows(departmentId, shipperId)
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("department_id");
  const shipperId = searchParams.get("shipper_id");

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
      ? await supabase.from("work_inspections").select("*").in("work_id", workIds)
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

    const inspectionRows = ((inspections.data ?? []) as DbRow[]).map(toInspection);
    const imageRows = ((images.data ?? []) as DbRow[]).map(toImage);
    const requestRows = ((requests.data ?? []) as DbRow[]).map(toRequest);
    const inspectionsByWork = groupBy(inspectionRows, (inspection) => inspection.work_id);
    const imagesByWork = groupBy(imageRows, (image) => image.work_id);
    const requestByWork = new Map(requestRows.map((reviewRequest) => [reviewRequest.work_id, reviewRequest]));
    const workMasterById = new Map(masterData.workMasters.map((workMaster) => [workMaster.id, workMaster]));

    const rows = works.map((work, index): InspectionTableRowDto => {
      const workMaster = workMasterById.get(work.work_master_id);
      const requestRow =
        requestByWork.get(work.id) ??
        (work.status === "admin_review_requested"
          ? {
              id: `virtual-${work.id}`,
              work_id: work.id,
              inspection_id: "",
              requester_id: "",
              reason: "관리자 확인 요청 상태입니다. 상세 요청 데이터가 없으면 현장 사진과 검수 이력을 확인한 뒤 조정 처리해주세요.",
              status: "requested" as const
            }
          : undefined);
      const workInspections = inspectionsByWork[work.id] ?? [];
      const adjustmentStatus = requestRow?.status;
      const inspectionCompleted = work.status === "passed" || work.status === "completed";

      return {
        work,
        registeredAt: work.work_date,
        workType: work.work_type ?? workTypeOptions[index % workTypeOptions.length],
        finishedProductCode: workMaster?.code ?? "-",
        finishedProductName: workMaster?.name ?? "-",
        quantity: work.quantity ?? 80 + index * 25,
        inspectionStep: getInspectionStep(work, workInspections, adjustmentStatus, inspectionCompleted, Boolean(work.assigned_to || work.assigned_at)),
        request: requestRow,
        inspections: workInspections,
        images: imagesByWork[work.id] ?? [],
        adjustmentStatus,
        inspectionCompleted
      };
    });

    return NextResponse.json({ source: "supabase", rows } satisfies WorkInspectionDataResponse);
  } catch (error) {
    return NextResponse.json(mockData(departmentId, shipperId, errorMessage(error, "Supabase 작업검수 조회에 실패했습니다.")));
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    workId?: string;
    action?: WorkInspectionAction;
  };

  if (!body.workId || !body.action) {
    return NextResponse.json({ error: "workId와 action이 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", workId: body.workId } satisfies WorkInspectionActionResponse);
  }

  try {
    if (body.action.type === "complete") {
      const { error } = await supabase
        .from("works")
        .update({ status: "in_progress", latest_inspected_at: new Date().toISOString() })
        .eq("id", body.workId);
      if (error) throw error;

      return NextResponse.json({ source: "supabase", workId: body.workId } satisfies WorkInspectionActionResponse);
    }

    const status = body.action.status;
    const processedAt = new Date().toISOString();
    const updatePayload = {
      status,
      processed_at: processedAt,
      admin_comment: status === "approved" ? "관리자 조정승인" : status === "retry_requested" ? "재검수 요청" : "조정 미승인"
    };

    if (!body.action.requestId.startsWith("virtual-")) {
      let reviewResult = await supabase
        .from("admin_review_requests")
        .update(updatePayload)
        .eq("id", body.action.requestId);

      if (reviewResult.error) {
        reviewResult = await supabase.from("admin_review_requests").update({ status }).eq("id", body.action.requestId);
      }
      if (reviewResult.error) throw reviewResult.error;
    }

    const nextInspectionStatus = status === "approved" ? "admin_approved" : status === "retry_requested" ? "retrying" : "failed";
    await supabase
      .from("work_inspections")
      .update({ status: nextInspectionStatus })
      .eq("work_id", body.workId)
      .eq("status", "admin_requested");

    const nextWorkStatus = status === "approved" ? "in_progress" : status === "retry_requested" ? "inspection_failed" : "inspection_failed";
    await supabase.from("works").update({ status: nextWorkStatus, latest_inspected_at: processedAt }).eq("id", body.workId);

    return NextResponse.json({
      source: "supabase",
      workId: body.workId,
      requestId: body.action.requestId,
      status
    } satisfies WorkInspectionActionResponse);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "작업검수 처리 저장에 실패했습니다.") }, { status: 500 });
  }
}
