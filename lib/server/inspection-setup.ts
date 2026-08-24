import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionMethod, WorkInspectionStage } from "@/lib/types/domain";

// 검수 행 생성 결과 표시용 상태값(배정/등록/모바일 lazy 생성 API가 공통으로 사용)
export type InspectionSetupResult =
  | "created"
  | "skipped_existing"
  | "skipped_no_master"
  | "skipped_no_materials"
  | "failed";

// 작업마스터의 부자재 구성(work_master_materials)을 기준으로 검수 대상 행(work_inspections)을 생성한다.
// 이미 같은 stage의 검수 행이 있는 work_id는 다시 호출돼도 건드리지 않는다(stage별 독립 멱등성).
// stage 기본값 "start"(기존 시작검수), "complete"(완료검수, 신규). 유니크 제약도
// (work_id, material_id, method, stage)로 stage를 포함해 시작/완료검수가 공존할 수 있다.
export async function setupWorkInspections(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  workId: string,
  workMasterId: string | null,
  stage: WorkInspectionStage = "start"
): Promise<InspectionSetupResult> {
  try {
    // stage 조건을 반드시 포함해야 한다: 필터가 없으면 시작검수 setup 호출이 이미 존재하는 완료검수 행을
    // "이미 있음"으로 오판해 시작검수 행을 만들지 않고 건너뛰는(그 반대도 동일) 버그가 생긴다.
    const { data: existingRows, error: existingError } = await supabase
      .from("work_inspections")
      .select("id")
      .eq("work_id", workId)
      .eq("stage", stage)
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

    // start(기존)는 부자재 구성이 없으면 검수 대상이 아예 없어 종료. complete(완료검수)는 부자재가 없어도
    // "완료제품사진" 항목은 항상 만들어야 하므로 여기서 끝내지 않는다(아래에서 별도 처리).
    if (stage === "start" && materialIds.length === 0) return "skipped_no_materials";

    let methodByMaterial = new Map<string, InspectionMethod>();
    if (materialIds.length > 0) {
      const { data: materialMasterRows, error: materialMasterError } = await supabase
        .from("material_masters")
        .select("id, inspection_method")
        .in("id", materialIds);
      if (materialMasterError) throw materialMasterError;

      methodByMaterial = new Map(
        ((materialMasterRows ?? []) as { id?: unknown; inspection_method?: unknown }[]).map((row) => {
          const method =
            row.inspection_method === "OCR" || row.inspection_method === "VISION" || row.inspection_method === "BOTH"
              ? row.inspection_method
              : "BOTH";
          return [typeof row.id === "string" ? row.id : "", method as InspectionMethod];
        })
      );
    }

    const insertPayload: Record<string, unknown>[] = materialIds.flatMap((materialId) => {
      const method = methodByMaterial.get(materialId) ?? "BOTH";
      const methods: Array<Exclude<InspectionMethod, "BOTH">> = method === "BOTH" ? ["OCR", "VISION"] : [method];
      return methods.map((inspectionMethod) => ({
        work_id: workId,
        material_id: materialId,
        method: inspectionMethod,
        status: "pending",
        result_summary: "",
        attempt_count: 0,
        stage
      }));
    });

    // 완료검수 전용: 부자재 검수와 별개로 "완료제품사진" 1건을 무조건 추가한다(material_id 없음).
    if (stage === "complete") {
      insertPayload.push({
        work_id: workId,
        material_id: null,
        method: "PRODUCT",
        status: "pending",
        result_summary: "",
        attempt_count: 0,
        stage
      });
    }

    if (insertPayload.length === 0) return "skipped_no_materials";

    const { error: insertError } = await supabase.from("work_inspections").insert(insertPayload);
    // 동시 생성 경합으로 유니크 제약(work_id, material_id, method, stage)에 걸리면 이미 생성된 것으로 간주한다
    if (insertError?.code === "23505") return "skipped_existing";
    if (insertError) throw insertError;

    return "created";
  } catch {
    return "failed";
  }
}
