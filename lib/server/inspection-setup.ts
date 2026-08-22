import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionMethod } from "@/lib/types/domain";

// 검수 행 생성 결과 표시용 상태값(배정/등록/모바일 lazy 생성 API가 공통으로 사용)
export type InspectionSetupResult =
  | "created"
  | "skipped_existing"
  | "skipped_no_master"
  | "skipped_no_materials"
  | "failed";

// 작업마스터의 부자재 구성(work_master_materials)을 기준으로 검수 대상 행(work_inspections)을 생성한다.
// 이미 검수 행이 있는 work_id는 다시 호출돼도 건드리지 않는다(멱등성 보장).
export async function setupWorkInspections(
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
    // 동시 생성 경합으로 유니크 제약(work_id, material_id, method)에 걸리면 이미 생성된 것으로 간주한다
    if (insertError?.code === "23505") return "skipped_existing";
    if (insertError) throw insertError;

    return "created";
  } catch {
    return "failed";
  }
}
