import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { setupWorkInspections } from "@/lib/server/inspection-setup";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SetupBody = {
  workId?: string;
};

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

    const inspectionSetup = await setupWorkInspections(supabase, body.workId, workMasterId);

    return NextResponse.json({ source: "supabase", workId: body.workId, inspectionSetup });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "검수 대상 준비에 실패했습니다.") }, { status: 500 });
  }
}
