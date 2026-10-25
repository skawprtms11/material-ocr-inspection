import { countStageStatuses, getInspectionTargetType, isStageApprovalReady } from "@/lib/inspection/method-plan";
import { getActiveInspections } from "@/lib/mobile/inspection-visibility";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionStatus, WorkInspectionStage } from "@/lib/types/domain";
import type { PhotoReviewReadinessDto, PhotoReviewSummaryDto } from "@/lib/types/work-inspection-api";

type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

// 사진검수 라우트(photo / work-inspection PATCH)가 공유하는 단계별 검수 행 조회·집계.

export type PhotoStageRow = {
  id: string;
  method: string;
  status: InspectionStatus;
  material_id: string;
  stage: WorkInspectionStage;
  target_type: string;
  product_code: string;
  product_name: string;
  product_lot: string;
  review_comment: string;
  submitted_at: string;
  reviewed_at: string;
  created_at: string;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export function toPhotoStageRow(row: Record<string, unknown>): PhotoStageRow {
  const method = text(row.method, "OCR");
  const materialId = text(row.material_id);
  return {
    id: text(row.id),
    method,
    status: text(row.status, "pending") as InspectionStatus,
    material_id: materialId,
    stage: text(row.stage, "start") === "complete" ? "complete" : "start",
    target_type: getInspectionTargetType({ method, material_id: materialId, target_type: text(row.target_type) || null }),
    product_code: text(row.product_code),
    product_name: text(row.product_name),
    product_lot: text(row.product_lot),
    review_comment: text(row.review_comment),
    submitted_at: text(row.submitted_at),
    reviewed_at: text(row.reviewed_at),
    created_at: text(row.created_at)
  };
}

// 작업의 활성 검수 행(화면·집계와 같은 가시성 규칙)을 단계별로 읽는다. DB 오류는 던진다(호출 라우트가 502로 변환).
export async function loadActiveStageRows(supabase: ServerSupabase, workId: string, stage: WorkInspectionStage) {
  const { data, error } = await supabase
    .from("work_inspections")
    .select("*")
    .eq("work_id", workId)
    .order("created_at", { ascending: true })
    // 같은 insert로 생긴 행은 created_at이 같아 순서가 흔들리므로 id로 한 번 더 고정한다.
    .order("id", { ascending: true });
  if (error) throw error;

  const rows = ((data ?? []) as Record<string, unknown>[]).map(toPhotoStageRow);
  const materialIds = Array.from(new Set(rows.map((row) => row.material_id).filter(Boolean)));

  let materials: { id: string; code: string; name: string; inspection_method: string }[] = [];
  if (materialIds.length > 0) {
    const { data: materialRows, error: materialError } = await supabase
      .from("material_masters")
      .select("id, code, name, inspection_method")
      .in("id", materialIds);
    if (materialError) throw materialError;
    materials = ((materialRows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: text(row.id),
      code: text(row.code),
      name: text(row.name),
      inspection_method: text(row.inspection_method)
    }));
  }

  const active = getActiveInspections(rows, materials).filter((row) => row.stage === stage);
  return { rows: active, materials };
}

// 사진 외 항목 중 미완료(미진행·불합격·재검수). 확인요청(admin_requested)은 별도 집계라 제외한다.
function isNonPhotoIncomplete(row: { method: string; status: string }) {
  return (
    row.method !== "PHOTO" &&
    row.status !== "passed" &&
    row.status !== "admin_approved" &&
    row.status !== "admin_requested"
  );
}

export function buildReadiness(rows: { method: string; status: InspectionStatus }[], workStatus: string): PhotoReviewReadinessDto {
  const counts = countStageStatuses(rows.map((row) => row.status));
  const photos = rows.filter((row) => row.method === "PHOTO");
  const workOpen = workStatus !== "on_hold" && workStatus !== "canceled" && workStatus !== "completed" && workStatus !== "passed";
  return {
    canApproveWork: workOpen && isStageApprovalReady(counts),
    pendingPhotos: photos.filter((row) => row.status === "pending").length,
    rejectedPhotos: photos.filter((row) => row.status === "rejected").length,
    nonPhotoIncomplete: rows.filter(isNonPhotoIncomplete).length,
    adminRequested: counts.adminRequested
  };
}

// 작업 목록용 단계별 요약. 사진 항목이 없으면 undefined.
export function summarizePhotoReview(
  rows: { method: string; status: string; submitted_at?: string | null }[]
): PhotoReviewSummaryDto | undefined {
  const photos = rows.filter((row) => row.method === "PHOTO");
  if (photos.length === 0) return undefined;

  const submitted = photos.filter((row) => row.status === "submitted");
  const latestSubmittedAt = submitted
    .map((row) => row.submitted_at)
    .filter((value): value is string => Boolean(value))
    .reduce<string | undefined>((latest, current) => (!latest || current > latest ? current : latest), undefined);

  return {
    totalPhotos: photos.length,
    submittedPhotos: submitted.length,
    approvedPhotos: photos.filter((row) => row.status === "admin_approved" || row.status === "passed").length,
    rejectedPhotos: photos.filter((row) => row.status === "rejected").length,
    nonPhotoIncomplete: rows.filter(isNonPhotoIncomplete).length,
    ...(latestSubmittedAt ? { latestSubmittedAt } : {})
  };
}
