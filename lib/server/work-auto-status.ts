import { countStageStatuses, isStageApprovalReady, isStageDone, type StageCounts } from "@/lib/inspection/method-plan";
import { getActiveInspections } from "@/lib/mobile/inspection-visibility";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionStatus, WorkStatus } from "@/lib/types/domain";

type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

export type InspectionSnapshot = {
  startStatuses: InspectionStatus[];
  completeStatuses: InspectionStatus[];
  // 단계별 분류 집계(합격/승인대기/불합격·반려/확인요청/미진행). 작업 상태 판정과 승인 가능 여부(조건 R)가 쓴다.
  start: StageCounts;
  complete: StageCounts;
  hasFailed: boolean;
  hasAdminRequested: boolean;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

// 작업의 검수 행을 읽어 화면과 같은 가시성 규칙(마스터에서 체크 해제된 방식 행 제외, lib/mobile/inspection-visibility.ts)을
// 적용한 단계별 상태 목록을 만든다. 서버 집계와 모바일 화면의 "완료" 판정이 어긋나지 않게 하는 용도다.
export async function loadInspectionSnapshot(supabase: ServerSupabase, workId: string): Promise<InspectionSnapshot> {
  const { data: rows, error } = await supabase
    .from("work_inspections")
    .select("status, stage, method, material_id")
    .eq("work_id", workId);
  if (error) throw error;

  const inspectionRows = ((rows ?? []) as Record<string, unknown>[]).map((row) => ({
    status: text(row.status, "pending") as InspectionStatus,
    stage: text(row.stage, "start") === "complete" ? "complete" : "start",
    method: text(row.method, "OCR"),
    material_id: text(row.material_id)
  }));

  const materialIds = Array.from(new Set(inspectionRows.map((row) => row.material_id).filter(Boolean)));
  let materials: { id: string; inspection_method: string }[] = [];
  if (materialIds.length > 0) {
    const { data: materialRows, error: materialError } = await supabase
      .from("material_masters")
      .select("id, inspection_method")
      .in("id", materialIds);
    if (materialError) throw materialError;
    materials = ((materialRows ?? []) as Record<string, unknown>[]).map((row) => ({
      id: text(row.id),
      inspection_method: text(row.inspection_method)
    }));
  }

  const active = getActiveInspections(inspectionRows, materials);
  const statusesOf = (stage: string) => active.filter((row) => row.stage === stage).map((row) => row.status);
  const allStatuses = active.map((row) => row.status);

  const startStatuses = statusesOf("start");
  const completeStatuses = statusesOf("complete");

  return {
    startStatuses,
    completeStatuses,
    start: countStageStatuses(startStatuses),
    complete: countStageStatuses(completeStatuses),
    hasFailed: allStatuses.some((status) => status === "failed" || status === "retrying" || status === "rejected"),
    hasAdminRequested: allStatuses.includes("admin_requested")
  };
}

// 현재 상태와 단계별 검수 집계로 다음 작업상태를 판정한다(순수 함수). 현재와 같은 값이면 그대로 돌려준다.
// 보류/취소/완료는 호출 전에 걸러지므로 여기서 다루지 않는다. 판정 순서(설계서 5-3):
//  1. 시작·완료검수 전부 합격 -> completed
//  2. 활성 단계 = 시작검수가 끝나기 전엔 start, 끝났으면 complete("등록 -> 완료" 건너뛰기 방지)
//  3. 활성 단계 확인요청 1건 이상 -> admin_review_requested
//  4. 활성 단계 불합격·반려 1건 이상 + 승인대기 0 -> inspection_failed
//  5. 조건 R(미진행·불합격·확인요청 0 + 승인대기 1건 이상), 또는 검토 중(현재 admin_review_requested)이면서 미진행 0인데
//     승인대기가 남아있으면 -> admin_review_requested (관리자 작업승인 대기). 미진행이 남아있으면 검토 중으로 보지 않는다(고착 방지)
//  6. 불합격·반려가 남은 채 inspection_failed/admin_review_requested에서 넘어오면 inspection_failed, 그 외엔 start 활성 registered / complete 활성 in_progress
// release=true는 보류 해제용으로, 현재 상태를 무시하고 집계만으로 상태를 다시 복원한다
// (미진행이 없으면 검토 중, 불합격·반려가 있으면 반려 상태로 본다).
export function judgeNextStatus(
  current: string,
  snapshot: Pick<InspectionSnapshot, "start" | "complete">,
  release = false
): WorkStatus {
  const startDone = isStageDone(snapshot.start);
  if (startDone && isStageDone(snapshot.complete)) return "completed";

  const active = startDone ? snapshot.complete : snapshot.start;
  // 검토 중 유지는 미진행이 없을 때만. 미진행이 남았는데 검토 상태로 두면 현장 업로드가 막혀 작업이 고착된다.
  const inReview = (current === "admin_review_requested" || release) && active.pending === 0 && active.adminRequested === 0;
  const wasFailed = current === "inspection_failed" || current === "admin_review_requested" || release;

  if (active.adminRequested > 0) return "admin_review_requested";
  if (active.failed > 0 && active.submitted === 0) return "inspection_failed";
  if (active.submitted > 0 && (isStageApprovalReady(active) || inReview)) return "admin_review_requested";
  if (active.failed > 0 && wasFailed) return "inspection_failed";
  return startDone ? "in_progress" : "registered";
}

async function applyStatus(supabase: ServerSupabase, workId: string, next: WorkStatus) {
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { status: next, latest_inspected_at: now };
  // completed_at은 완료 시에만 기록하고, 완료에서 벗어나는 전이(보류 해제 등)에서는 초기화한다.
  payload.completed_at = next === "completed" ? now : null;
  const { error } = await supabase.from("works").update(payload).eq("id", workId);
  if (error) throw error;
}

// 새 작업 상태 모델(대기/진행/보류/취소/완료)에서 "진행"과 "완료"는 검수 결과에 따라 시스템이 자동으로만
// 전이시킨다(사용자가 수동으로 설정할 수 없음, app/api/work-status/route.ts PATCH가 서버에서 함께 막는다).
// OCR/제품검수/완료검수/사진검수(PHOTO) 저장 API(성공 시)와 관리자 확인요청·사진 승인/반려 API(PATCH /api/work-inspection)
// 양쪽에서 각 저장/승인 직후 호출한다. 최신 검수 집계만 보고 판단한다(멱등, 여러 번 호출해도 안전).
// 보류(on_hold)/취소(canceled)/완료(completed·passed)는 이미 확정된 사용자 의도/최종 상태이므로 건드리지 않는다.
// 반환값은 호출 후의 작업상태(조회 실패/작업 없음이면 null). 실패해도 저장 자체를 막지 않도록 예외는 던지지 않는다.
export async function maybeAdvanceWorkStatus(supabase: ServerSupabase, workId: string): Promise<WorkStatus | null> {
  try {
    const { data: workRow, error: workError } = await supabase.from("works").select("status").eq("id", workId).maybeSingle();
    if (workError || !workRow) return null;

    const currentStatus = text((workRow as { status?: unknown }).status) as WorkStatus;
    if (currentStatus === "on_hold" || currentStatus === "canceled" || currentStatus === "completed" || currentStatus === "passed") {
      return currentStatus;
    }

    const snapshot = await loadInspectionSnapshot(supabase, workId);
    const next = judgeNextStatus(currentStatus, snapshot, false);
    if (next === currentStatus) return currentStatus;

    await applyStatus(supabase, workId, next);
    return next;
  } catch (error) {
    // 자동 전이 실패는 저장/승인 자체를 막지 않는다(로그만 남김, 관리자가 수동으로 상태를 조정할 수 있음).
    console.error("작업 상태 자동 전이에 실패했습니다.", error);
    return null;
  }
}

// 보류(또는 취소) 해제: 현재 상태와 무관하게 검수 집계로 상태를 다시 판정해 반영하고 결과 상태를 돌려준다.
// 시작검수가 끝난 작업이면 대기가 아니라 진행으로, 확인요청/승인대기/불합격·반려 항목이 남아있으면 해당 상태로 복귀한다.
// 사용자 요청 처리용이라 실패 시 예외를 그대로 던져 호출자가 오류 응답을 만든다.
export async function releaseWorkHold(supabase: ServerSupabase, workId: string): Promise<WorkStatus> {
  const snapshot = await loadInspectionSnapshot(supabase, workId);
  const next = judgeNextStatus("registered", snapshot, true);
  await applyStatus(supabase, workId, next);
  return next;
}
