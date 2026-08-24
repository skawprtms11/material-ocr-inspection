import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { setupWorkInspections } from "@/lib/server/inspection-setup";
import { getInspectionAggregateStatus } from "@/lib/server/inspection-status";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionStatus, WorkInspectionStage } from "@/lib/types/domain";

type SetupBody = {
  workId?: string;
  // 완료검수(신규) lazy 생성 시 "complete"를 전달한다. 생략 시 기존과 동일하게 "start".
  stage?: WorkInspectionStage;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

// 모바일 스캔 시점의 lazy 생성 전용 API. 배정/등록 시점에 생성되지 못한 기존 작업을 커버한다.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as SetupBody;

  if (!body.workId) {
    return NextResponse.json({ error: "workId가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", workId: body.workId, inspectionSetup: "skipped_existing" as const });
  }

  try {
    const { data: workRow, error: workError } = await supabase
      .from("works")
      .select("id, work_master_id")
      .eq("id", body.workId)
      .maybeSingle();
    if (workError) throw workError;
    if (!workRow) {
      return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });
    }

    const workMasterId =
      typeof (workRow as { work_master_id?: unknown }).work_master_id === "string"
        ? ((workRow as { work_master_id: string }).work_master_id)
        : null;

    const stage: WorkInspectionStage = body.stage === "complete" ? "complete" : "start";

    // 서버 레벨 방어: 완료검수는 시작검수(stage="start")가 전부 끝난 작업만 준비할 수 있다.
    // 클라이언트 가드(홈/현황 버튼, 완료검수 화면)를 우회해 URL로 직접 진입해도 여기서 막힌다.
    if (stage === "complete") {
      const { data: startRows, error: startError } = await supabase
        .from("work_inspections")
        .select("status")
        .eq("work_id", body.workId)
        .eq("stage", "start");
      if (startError) throw startError;

      const startStatuses = ((startRows ?? []) as { status?: unknown }[]).map(
        (row) => text(row.status, "pending") as InspectionStatus
      );
      if (getInspectionAggregateStatus(startStatuses) !== "completed") {
        return NextResponse.json(
          { error: "시작검수가 아직 완료되지 않아 완료검수를 준비할 수 없습니다. 부자재 검수를 먼저 완료해주세요." },
          { status: 409 }
        );
      }
    }

    const inspectionSetup = await setupWorkInspections(supabase, body.workId, workMasterId, stage);

    return NextResponse.json({ source: "supabase", workId: body.workId, inspectionSetup });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "검수 대상 준비에 실패했습니다.") }, { status: 500 });
  }
}
