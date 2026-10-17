import { NextRequest, NextResponse } from "next/server";
import { errorMessage, isUuid } from "@/lib/repositories/supabase-scope";
import { setupWorkInspections } from "@/lib/server/inspection-setup";
import { assertWorkInScope, guardErrorResponse, missingScopeResponse, resolveRequestScope, scopeFromBody } from "@/lib/server/scope-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    workId: string;
  }>;
};

type AssignBody = {
  departmentId?: string;
  shipperId?: string;
  assigneeId: string;
  assigneeName: string;
};

async function resolveUserId(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>, assigneeId: string, assigneeName: string) {
  if (isUuid(assigneeId)) return assigneeId;

  const { data, error } = await supabase.from("app_users").select("id").eq("name", assigneeName).maybeSingle();
  if (error) throw error;
  const row = data as { id?: unknown } | null;
  return typeof row?.id === "string" ? row.id : null;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { workId } = await context.params;
  const body = (await request.json()) as AssignBody;
  const supabase = createServerSupabaseClient();
  const requestScope = scopeFromBody(body);
  if (!requestScope) return missingScopeResponse();

  if (!body.assigneeId || !body.assigneeName) {
    return NextResponse.json({ error: "담당자 정보가 필요합니다." }, { status: 400 });
  }

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", workId, assignedTo: body.assigneeId });
  }

  try {
    await assertWorkInScope(supabase, workId, await resolveRequestScope(supabase, requestScope));

    const resolvedUserId = await resolveUserId(supabase, body.assigneeId, body.assigneeName);
    if (!resolvedUserId) return NextResponse.json({ error: "담당자를 찾을 수 없습니다." }, { status: 400 });

    const { data: before, error: beforeError } = await supabase
      .from("works")
      .select("assigned_to, assigned_to_name, assigned_at, worker_name")
      .eq("id", workId)
      .maybeSingle();
    if (beforeError) throw beforeError;
    if (!before) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

    const assignedAt = new Date().toISOString();
    // status는 건드리지 않는다(진행 중/완료 작업을 registered로 되돌리지 않기 위함)
    const { data, error } = await supabase
      .from("works")
      .update({
        assigned_to: resolvedUserId,
        assigned_to_name: body.assigneeName,
        assigned_at: assignedAt,
        worker_name: body.assigneeName
      })
      .eq("id", workId)
      .select("id, work_master_id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: "작업을 찾을 수 없습니다." }, { status: 404 });

    const workMasterId = typeof data.work_master_id === "string" ? data.work_master_id : null;
    const inspectionSetup = await setupWorkInspections(supabase, workId, workMasterId);

    // 검수 행 생성 실패 시 배정을 이전 값으로 되돌려 "배정됐는데 검수행 없음" 상태를 막는다
    if (inspectionSetup === "failed") {
      const { error: revertError } = await supabase.from("works").update(before).eq("id", workId);
      const suffix = revertError ? ` (배정 되돌리기 실패: ${revertError.message})` : "";
      return NextResponse.json({ error: `검수 행 생성에 실패해 할당을 취소했습니다.${suffix}` }, { status: 502 });
    }

    return NextResponse.json({ source: "supabase", workId, assignedTo: resolvedUserId, assignedAt, inspectionSetup });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "작업 할당 저장에 실패했습니다.") }, { status: 502 });
  }
}
