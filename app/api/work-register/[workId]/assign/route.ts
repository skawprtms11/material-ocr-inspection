import { NextRequest, NextResponse } from "next/server";
import { errorMessage, isUuid } from "@/lib/repositories/supabase-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionMethod } from "@/lib/types/domain";

type RouteContext = {
  params: Promise<{
    workId: string;
  }>;
};

type AssignBody = {
  assigneeId: string;
  assigneeName: string;
};

// 배정 응답에 담기는 검수 행 생성 결과 표시용 상태값
type InspectionSetupResult =
  | "created"
  | "skipped_existing"
  | "skipped_no_master"
  | "skipped_no_materials"
  | "failed";

async function resolveUserId(assigneeId: string, assigneeName: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return assigneeId;
  if (isUuid(assigneeId)) return assigneeId;

  const { data } = await supabase.from("app_users").select("id").eq("name", assigneeName).maybeSingle();
  const row = data as { id?: unknown } | null;
  return typeof row?.id === "string" ? row.id : assigneeId;
}

// 작업마스터의 부자재 구성(work_master_materials)을 기준으로 검수 대상 행(work_inspections)을 생성한다.
// 이미 검수 행이 있는 work_id는 재배정이어도 건드리지 않는다(멱등성 보장).
async function setupWorkInspections(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  workId: string,
  workMasterId: string | null
): Promise<InspectionSetupResult> {
  try {
    const { data: existingRows, error: existingError } = await supabase
      .from("work_inspections")
      .select("id")
      .eq("work_id", workId)
      .limit(1);
    if (existingError) throw existingError;
    if ((existingRows ?? []).length > 0) return "skipped_existing";

    if (!workMasterId) return "skipped_no_master";

    const { data: materialRows, error: materialRowsError } = await supabase
      .from("work_master_materials")
      .select("material_id, inspection_order")
      .eq("work_master_id", workMasterId)
      .order("inspection_order", { ascending: true });
    if (materialRowsError) throw materialRowsError;

    const materialIds = ((materialRows ?? []) as { material_id?: unknown }[])
      .map((row) => (typeof row.material_id === "string" ? row.material_id : null))
      .filter((id): id is string => Boolean(id));

    if (materialIds.length === 0) return "skipped_no_materials";

    const { data: materialMasterRows, error: materialMasterError } = await supabase
      .from("material_masters")
      .select("id, inspection_method")
      .in("id", materialIds);
    if (materialMasterError) throw materialMasterError;

    const methodByMaterial = new Map(
      ((materialMasterRows ?? []) as { id?: unknown; inspection_method?: unknown }[]).map((row) => {
        const method =
          row.inspection_method === "OCR" || row.inspection_method === "VISION" || row.inspection_method === "BOTH"
            ? row.inspection_method
            : "BOTH";
        return [typeof row.id === "string" ? row.id : "", method as InspectionMethod];
      })
    );

    const insertPayload = materialIds.flatMap((materialId) => {
      const method = methodByMaterial.get(materialId) ?? "BOTH";
      const methods: Array<Exclude<InspectionMethod, "BOTH">> = method === "BOTH" ? ["OCR", "VISION"] : [method];
      return methods.map((inspectionMethod) => ({
        work_id: workId,
        material_id: materialId,
        method: inspectionMethod,
        status: "pending",
        result_summary: "",
        attempt_count: 0
      }));
    });

    if (insertPayload.length === 0) return "skipped_no_materials";

    const { error: insertError } = await supabase.from("work_inspections").insert(insertPayload);
    // 동시 배정 경합으로 유니크 제약(work_id, material_id, method)에 걸리면 이미 생성된 것으로 간주한다
    if (insertError?.code === "23505") return "skipped_existing";
    if (insertError) throw insertError;

    return "created";
  } catch {
    return "failed";
  }
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

    let result = await supabase.from("works").update(payload).eq("id", workId).select("id, work_master_id").single();

    if (result.error) {
      const { assigned_to: _assignedTo, assigned_to_name: _assignedToName, assigned_at: _assignedAt, ...fallbackPayload } = payload;
      result = await supabase.from("works").update(fallbackPayload).eq("id", workId).select("id, work_master_id").single();
    }

    if (result.error) throw result.error;

    const workMasterId =
      typeof (result.data as { work_master_id?: unknown } | null)?.work_master_id === "string"
        ? ((result.data as { work_master_id: string }).work_master_id)
        : null;
    const inspectionSetup = await setupWorkInspections(supabase, workId, workMasterId);

    return NextResponse.json({ source: "supabase", workId, assignedTo: resolvedUserId, assignedAt, inspectionSetup });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "작업 할당 저장에 실패했습니다.") }, { status: 500 });
  }
}
