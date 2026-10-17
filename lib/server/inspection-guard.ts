import type { createServerSupabaseClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

export type InspectionGuardFailure = { status: number; error: string };

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

// 검수 결과를 저장해도 되는 작업상태인지 확인한다. 보류/취소/완료 작업에 검수 결과가 쓰이면 최종 상태와 데이터가
// 어긋나므로 409로 거부한다(모바일 화면 가드를 우회한 직접 호출 방어). 문제 없으면 null.
export async function checkWorkAcceptsInspection(supabase: ServerSupabase, workId: string): Promise<InspectionGuardFailure | null> {
  const { data, error } = await supabase.from("works").select("status").eq("id", workId).maybeSingle();
  if (error) throw error;
  if (!data) return { status: 404, error: "작업을 찾을 수 없습니다." };

  const status = text((data as { status?: unknown }).status);
  if (status === "on_hold" || status === "canceled" || status === "completed" || status === "passed") {
    return { status: 409, error: "보류/취소/완료된 작업은 검수 결과를 저장할 수 없습니다." };
  }
  return null;
}

// 검수 항목 단위 가드: 허용된 검수방식인지, 관리자 확인요청 대기 중이거나 이미 합격 처리된 항목을 덮어쓰지 않는지 확인한다.
// allowPassed는 합격 후에도 사진을 추가할 수 있는 항목(완료제품 사진)용이다. 문제 없으면 null.
export function checkInspectionWritable(
  inspection: Record<string, unknown>,
  allowedMethods: string[],
  allowPassed = false
): InspectionGuardFailure | null {
  const method = text(inspection.method);
  if (!allowedMethods.includes(method)) {
    return { status: 409, error: `이 검수 항목(${method || "-"})은 해당 검수 방식으로 저장할 수 없습니다.` };
  }

  const status = text(inspection.status, "pending");
  if (status === "admin_requested") {
    return { status: 409, error: "관리자 확인요청 처리 대기 중인 항목은 다시 저장할 수 없습니다." };
  }
  if (!allowPassed && (status === "passed" || status === "admin_approved")) {
    return { status: 409, error: "이미 합격 처리된 검수 항목입니다." };
  }
  return null;
}

// ---- 사진검수(PHOTO) 가드 ----

// 단계별로 사진 제출을 받을 수 있는 작업상태. admin_review_requested(관리자 검토 중)는 제출·교체 모두 잠금이다.
const photoSubmittableWorkStatuses: Record<string, string[]> = {
  start: ["registered", "inspection_failed"],
  complete: ["in_progress", "inspection_failed"]
};

// PHOTO 항목 사진 제출/교체 가드(POST /api/work-inspection/photo). workStatus는 항목이 속한 작업의 현재 상태.
// - pending/rejected: 제출 가능, submitted: 작업이 승인대기(admin_review_requested)로 넘어가기 전까지 교체 가능,
//   admin_approved/passed: 잠금. 문제 없으면 null.
export function checkPhotoSubmittable(inspection: Record<string, unknown>, workStatus: string): InspectionGuardFailure | null {
  const method = text(inspection.method);
  if (method !== "PHOTO") {
    return { status: 409, error: `이 검수 항목(${method || "-"})은 사진검수 항목이 아닙니다.` };
  }

  const status = text(inspection.status, "pending");
  if (status === "admin_approved" || status === "passed") {
    return { status: 409, error: "관리자가 승인한 사진은 다시 제출할 수 없습니다." };
  }
  if (status !== "pending" && status !== "submitted" && status !== "rejected") {
    return { status: 409, error: "현재 상태에서는 사진을 제출할 수 없는 항목입니다." };
  }

  if (workStatus === "admin_review_requested") {
    return { status: 409, error: "관리자 승인 검토 중인 작업은 사진을 제출·교체할 수 없습니다." };
  }
  const stage = text(inspection.stage, "start") === "complete" ? "complete" : "start";
  if (!photoSubmittableWorkStatuses[stage].includes(workStatus)) {
    return { status: 409, error: "현재 작업 상태에서는 이 단계의 사진을 제출할 수 없습니다." };
  }
  return null;
}

// 관리자 사진 승인/반려 가드(PATCH photo_review). 승인대기(submitted)인 PHOTO 항목만 처리할 수 있다.
export function checkPhotoReviewable(inspection: Record<string, unknown>): InspectionGuardFailure | null {
  if (text(inspection.method) !== "PHOTO") {
    return { status: 409, error: "사진검수 항목이 아닙니다." };
  }
  if (text(inspection.status) !== "submitted") {
    return { status: 409, error: "승인대기 상태가 아닌 항목입니다(이미 처리되었거나 제출 전입니다)." };
  }
  return null;
}

// PHOTO 항목은 확인요청 체계(request_review/adjustment)와 분리한다. PHOTO면 409, 아니면 null.
export function checkNotPhotoInspection(inspection: Record<string, unknown>): InspectionGuardFailure | null {
  if (text(inspection.method) === "PHOTO") {
    return { status: 409, error: "사진검수 항목은 확인요청 대상이 아닙니다. 사진 승인/반려로 처리하세요." };
  }
  return null;
}
