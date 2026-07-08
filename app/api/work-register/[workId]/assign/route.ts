import { NextRequest, NextResponse } from "next/server";
import { errorMessage, isUuid } from "@/lib/repositories/supabase-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    workId: string;
  }>;
};

type AssignBody = {
  assigneeId: string;
  assigneeName: string;
};

async function resolveUserId(assigneeId: string, assigneeName: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return assigneeId;
  if (isUuid(assigneeId)) return assigneeId;

  const { data } = await supabase.from("app_users").select("id").eq("name", assigneeName).maybeSingle();
  const row = data as { id?: unknown } | null;
  return typeof row?.id === "string" ? row.id : assigneeId;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { workId } = await context.params;
  const body = (await request.json()) as AssignBody;
  const supabase = createServerSupabaseClient();

  if (!body.assigneeId || !body.assigneeName) {
    return NextResponse.json({ error: "담당자 정보가 필요합니다." }, { status: 400 });
  }

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", workId, assignedTo: body.assigneeId });
  }

  try {
    const assignedAt = new Date().toISOString();
    const resolvedUserId = await resolveUserId(body.assigneeId, body.assigneeName);
    const payload = {
      assigned_to: resolvedUserId,
      assigned_to_name: body.assigneeName,
      assigned_at: assignedAt,
      worker_name: body.assigneeName,
      status: "registered"
    };

    let result = await supabase.from("works").update(payload).eq("id", workId).select("id").single();

    if (result.error) {
      const { assigned_to: _assignedTo, assigned_to_name: _assignedToName, assigned_at: _assignedAt, ...fallbackPayload } = payload;
      result = await supabase.from("works").update(fallbackPayload).eq("id", workId).select("id").single();
    }

    if (result.error) throw result.error;

    return NextResponse.json({ source: "supabase", workId, assignedTo: resolvedUserId, assignedAt });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "작업 할당 저장에 실패했습니다.") }, { status: 500 });
  }
}
