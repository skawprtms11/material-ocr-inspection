import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { reconcileInspectionPlan } from "@/lib/server/inspection-setup";
import { getInspectionAggregateStatus } from "@/lib/server/inspection-status";
import { assertWorkInScope, guardErrorResponse, missingScopeResponse, resolveRequestScope, scopeFromBody } from "@/lib/server/scope-guard";
import { loadInspectionSnapshot } from "@/lib/server/work-auto-status";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WorkInspectionStage } from "@/lib/types/domain";

type SetupBody = {
  departmentId?: string;
  shipperId?: string;
  workId?: string;
  // 완료검수(신규) lazy 생성 시 "complete"를 전달한다. 생략 시 기존과 동일하게 "start".
  stage?: WorkInspectionStage;
};

// 모바일 진입 시점의 lazy 생성·재판정 API. 행이 없으면 생성하고, 있으면 마스터 체크 변경분만 반영한다(제출 이력 행은 동결).
export async function POST(request: NextRequest) {
  const body = (await request.json()) as SetupBody;
  const requestScope = scopeFromBody(body);

  if (!requestScope) return missingScopeResponse();

  if (!body.workId) {
    return NextResponse.json({ error: "workId가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", workId: body.workId, inspectionSetup: "skipped_existing" as const });
  }

  try {
    const workRow = await assertWorkInScope(supabase, body.workId, await resolveRequestScope(supabase, requestScope));

    const workMasterId =
      typeof workRow.work_master_id === "string" ? workRow.work_master_id : null;

    const stage: WorkInspectionStage = body.stage === "complete" ? "complete" : "start";

    // 서버 레벨 방어: 완료검수는 시작검수(stage="start")가 전부 끝난 작업만 준비할 수 있다.
    // 클라이언트 가드(홈/현황 버튼, 완료검수 화면)를 우회해 URL로 직접 진입해도 여기서 막힌다.
    if (stage === "complete") {
      // work-auto-status.ts의 자동 전이 판정과 같은 가시성 규칙(getActiveInspections)으로 시작검수 완료 여부를 본다.
      const snapshot = await loadInspectionSnapshot(supabase, body.workId);
      if (getInspectionAggregateStatus(snapshot.startStatuses) !== "completed") {
        return NextResponse.json(
          { error: "시작검수가 아직 완료되지 않아 완료검수를 준비할 수 없습니다. 부자재 검수를 먼저 완료해주세요." },
          { status: 409 }
        );
      }
    }

    const inspectionSetup = await reconcileInspectionPlan(supabase, body.workId, workMasterId, stage);

    if (inspectionSetup === "failed") {
      return NextResponse.json({ error: "검수 대상 준비에 실패했습니다. 잠시 후 다시 시도해주세요." }, { status: 502 });
    }

    return NextResponse.json({ source: "supabase", workId: body.workId, inspectionSetup });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "검수 대상 준비에 실패했습니다.") }, { status: 502 });
  }
}
