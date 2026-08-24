import { getInspectionAggregateStatus } from "@/lib/server/inspection-status";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionStatus } from "@/lib/types/domain";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

async function fetchAggregate(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  workId: string,
  stage: "start" | "complete"
) {
  const { data: rows, error } = await supabase
    .from("work_inspections")
    .select("status")
    .eq("work_id", workId)
    .eq("stage", stage);
  if (error) return null;

  const statuses = ((rows ?? []) as { status?: unknown }[]).map((row) => text(row.status, "pending") as InspectionStatus);
  return getInspectionAggregateStatus(statuses);
}

// 새 작업 상태 모델(대기/진행/보류/취소/완료)에서 "진행"과 "완료"는 검수 결과에 따라 시스템이 자동으로만
// 전이시킨다(사용자가 수동으로 설정할 수 없음, app/api/work-status/route.ts PATCH가 서버에서 함께 막는다).
// OCR/제품검수/완료검수 사진 저장 API(성공 시)와 관리자 확인요청 승인 API(PATCH /api/work-inspection
// adjustment) 양쪽에서 각 저장/승인 직후 호출한다. 호출 시점의 현재 상태가 registered/admin_review_requested/
// inspection_failed 등 무엇이든 상관없이 최신 검수 집계만 보고 판단한다(멱등, 여러 번 호출해도 안전).
// 판정 순서가 중요하다: 시작검수(stage="start")가 완료돼야만 완료검수(stage="complete") 판정을 본다.
// 이렇게 해야 "등록 -> 완료"로 건너뛰는 오류를 막는다(완료검수 행은 시작검수 완료 전에는 애초에 생성될 수
// 없지만, 과거에 만들어진 뒤 남아있는 completion 행이 있어도 시작검수 미완료 상태에서는 절대 고려하지 않는다).
// 보류(on_hold)/취소(canceled)/완료(completed·passed)는 이미 확정된 사용자 의도/최종 상태이므로 건드리지 않는다.
export async function maybeAdvanceWorkStatus(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  workId: string
) {
  try {
    const { data: workRow, error: workError } = await supabase.from("works").select("status").eq("id", workId).maybeSingle();
    if (workError || !workRow) return;

    const currentStatus = text((workRow as { status?: unknown }).status);
    if (currentStatus === "on_hold" || currentStatus === "canceled" || currentStatus === "completed" || currentStatus === "passed") {
      return;
    }

    const startAggregate = await fetchAggregate(supabase, workId, "start");
    if (startAggregate !== "completed") return; // 시작검수부터 끝나야 그 다음 단계를 판단한다.

    const now = new Date().toISOString();

    const completeAggregate = await fetchAggregate(supabase, workId, "complete");
    if (completeAggregate === "completed") {
      await supabase.from("works").update({ status: "completed", completed_at: now, latest_inspected_at: now }).eq("id", workId);
      return;
    }

    if (currentStatus !== "in_progress") {
      await supabase.from("works").update({ status: "in_progress", latest_inspected_at: now }).eq("id", workId);
    }
  } catch (error) {
    // 자동 전이 실패는 저장/승인 자체를 막지 않는다(로그만 남김, 관리자가 수동으로 상태를 조정할 수 있음).
    console.error("작업 상태 자동 전이에 실패했습니다.", error);
  }
}
