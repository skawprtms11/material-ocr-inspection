import { normalizeMaterialInspectionMethod, planMaterialMethods, productKey, type PlannedMaterialMethod } from "@/lib/inspection/method-plan";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MaterialInspectionMethod, WorkInspectionStage } from "@/lib/types/domain";

type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

// 검수 행 생성 결과 표시용 상태값(배정/등록/모바일 lazy 생성 API가 공통으로 사용)
export type InspectionSetupResult =
  | "created"
  | "skipped_existing"
  | "skipped_no_master"
  | "skipped_no_materials"
  | "failed";

// 검수 대상 제품 1건(작업 구성 행). work_components.id는 작업 수정 시 바뀌므로 코드+LOT 스냅샷으로만 식별한다.
export type InspectionProduct = { code: string; name: string; lot: string };

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

// 제품 목록: work_components(component_type='제품') 우선, 없으면 작업마스터 제품(work_master_products) 폴백.
// 같은 코드+LOT는 1건으로 합친다(제품 PHOTO 부분 유니크 인덱스와 동일 키). 제품 구성이 0건이면 빈 배열.
export async function loadInspectionProducts(
  supabase: ServerSupabase,
  workId: string,
  workMasterId: string | null
): Promise<InspectionProduct[]> {
  const { data: componentRows, error: componentError } = await supabase
    .from("work_components")
    .select("component_type, component_code, component_name, lot, created_at")
    .eq("work_id", workId)
    .order("created_at", { ascending: true });
  if (componentError) throw componentError;

  let products: InspectionProduct[] = ((componentRows ?? []) as Record<string, unknown>[])
    .filter((row) => text(row.component_type) === "제품")
    .map((row) => ({ code: text(row.component_code).trim(), name: text(row.component_name), lot: text(row.lot).trim() }));

  if (products.length === 0 && workMasterId) {
    const { data: productRows, error: productError } = await supabase
      .from("work_master_products")
      .select("product_code, product_name, sort_order")
      .eq("work_master_id", workMasterId)
      .order("sort_order", { ascending: true });
    if (productError) throw productError;
    products = ((productRows ?? []) as Record<string, unknown>[]).map((row) => ({
      code: text(row.product_code).trim(),
      name: text(row.product_name),
      lot: ""
    }));
  }

  const unique = new Map<string, InspectionProduct>();
  for (const product of products) {
    if (!product.code) continue;
    const key = productKey(product.code, product.lot);
    if (!unique.has(key)) unique.set(key, product);
  }
  return Array.from(unique.values());
}

async function loadMaterialPlan(supabase: ServerSupabase, workMasterId: string | null) {
  if (!workMasterId) return { materialIds: [] as string[], methodsByMaterial: new Map<string, PlannedMaterialMethod[]>() };

  const { data: materialRows, error: materialRowsError } = await supabase
    .from("work_master_materials")
    .select("material_id, inspection_order")
    .eq("work_master_id", workMasterId)
    .order("inspection_order", { ascending: true });
  if (materialRowsError) throw materialRowsError;

  const materialIds = ((materialRows ?? []) as { material_id?: unknown }[])
    .map((row) => (typeof row.material_id === "string" ? row.material_id : null))
    .filter((id): id is string => Boolean(id));

  const checkedByMaterial = new Map<string, MaterialInspectionMethod>();
  if (materialIds.length > 0) {
    const { data: materialMasterRows, error: materialMasterError } = await supabase
      .from("material_masters")
      .select("id, inspection_method")
      .in("id", materialIds);
    if (materialMasterError) throw materialMasterError;
    for (const row of (materialMasterRows ?? []) as { id?: unknown; inspection_method?: unknown }[]) {
      checkedByMaterial.set(text(row.id), normalizeMaterialInspectionMethod(row.inspection_method));
    }
  }

  // 마스터를 찾지 못한 부자재는 NONE(사진검수)으로 취급한다(기준 없이 막히지 않도록).
  const methodsByMaterial = new Map(materialIds.map((id) => [id, planMaterialMethods(checkedByMaterial.get(id))]));
  return { materialIds, methodsByMaterial };
}

function materialRow(workId: string, stage: WorkInspectionStage, materialId: string, method: PlannedMaterialMethod) {
  // 배치 insert는 키가 다른 행의 누락 컬럼을 NULL로 넣으므로 target_type을 명시한다(NOT NULL 기본값 미적용).
  return { work_id: workId, material_id: materialId, method, target_type: "material", status: "pending", result_summary: "", attempt_count: 0, stage };
}

function productPhotoRow(workId: string, stage: WorkInspectionStage, product: InspectionProduct) {
  return {
    work_id: workId,
    material_id: null,
    method: "PHOTO",
    target_type: "product",
    product_code: product.code,
    product_name: product.name || null,
    product_lot: product.lot || null,
    status: "pending",
    result_summary: "",
    attempt_count: 0,
    stage
  };
}

function completionPhotoRow(workId: string) {
  return {
    work_id: workId,
    material_id: null,
    method: "PRODUCT",
    target_type: "completion",
    status: "pending",
    result_summary: "",
    attempt_count: 0,
    stage: "complete"
  };
}

// 작업의 검수 대상 행(work_inspections)을 생성한다. 같은 stage의 검수 행이 이미 있으면 건드리지 않는다(stage별 멱등).
// 생성 규칙(대표님 확정):
//  - 부자재: 마스터 inspection_method 체크 여부(planMaterialMethods) — BOTH=OCR+VISION, OCR, VISION, 그 외(NONE 포함)=PHOTO
//  - 제품: 모든 작업·모든 단계에서 제품 구성 행(코드+LOT)별 PHOTO 1행(target_type='product', 제품 스냅샷)
//  - 완료검수: 완료제품사진(method=PRODUCT, target_type='completion') 1행 추가
// 호출 전에 work_components가 저장돼 있어야 제품 행이 생긴다. 유니크: (work_id, material_id, method, stage) + 제품 PHOTO 부분 인덱스.
export async function setupWorkInspections(
  supabase: ServerSupabase,
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

    const { materialIds, methodsByMaterial } = await loadMaterialPlan(supabase, workMasterId);
    const products = await loadInspectionProducts(supabase, workId, workMasterId);

    const insertPayload: Record<string, unknown>[] = [
      ...materialIds.flatMap((materialId) =>
        (methodsByMaterial.get(materialId) ?? []).map((method) => materialRow(workId, stage, materialId, method))
      ),
      ...products.map((product) => productPhotoRow(workId, stage, product))
    ];

    // 완료검수는 부자재·제품이 없어도 "완료제품사진" 항목을 항상 만든다(material_id 없음).
    if (stage === "complete") insertPayload.push(completionPhotoRow(workId));

    if (insertPayload.length === 0) return "skipped_no_materials";

    const { error: insertError } = await supabase.from("work_inspections").insert(insertPayload);
    if (insertError?.code === "23505") {
      // 동시 생성 경합이면 기존 행이 실제로 존재한다. 행이 0건인데 유니크 위반이면 성공으로 오인하지 않고 실패 처리한다
      const { data: afterRows, error: afterError } = await supabase
        .from("work_inspections")
        .select("id")
        .eq("work_id", workId)
        .eq("stage", stage)
        .limit(1);
      if (afterError) throw afterError;
      if ((afterRows ?? []).length > 0) return "skipped_existing";
      throw insertError;
    }
    if (insertError) throw insertError;

    return "created";
  } catch (error) {
    console.error("검수 행 생성 실패:", workId, stage, error);
    return "failed";
  }
}

type ExistingInspection = { id: string; material_id: string | null; method: string; status: string; product_code: string | null; product_lot: string | null };

// 진입 시 재판정(POST /api/work-inspection/setup 등에서 setupWorkInspections 대신 호출). 행이 없으면 setupWorkInspections로 생성하고,
// 이미 있으면 현재 마스터 체크·제품 구성에 맞게 "아직 손대지 않은 행"만 교체한다.
//  - 동결: 제출·합격·반려 이력이 있거나 사진이 있는 행은 절대 바꾸지 않는다(검수 중 기준 변경 방지).
//  - 부자재 단위: 해당 부자재의 행이 전부 pending + 사진 0장이고 계획(planMaterialMethods)과 다르면 삭제 후 재생성.
//  - 제품: pending + 사진 0장인데 현재 구성에 없는 제품 행은 삭제. 현재 구성에 있는데 행이 없는 제품·부자재는
//    단계 전체가 pending(아직 아무 검수도 시작 안 함)일 때만 추가한다.
//  - 완료검수는 완료제품사진 행이 없으면 추가한다.
// 반환: 행을 바꾸거나 추가했으면 "created", 변경 없으면 "skipped_existing", 오류는 "failed".
export async function reconcileInspectionPlan(
  supabase: ServerSupabase,
  workId: string,
  workMasterId: string | null,
  stage: WorkInspectionStage = "start"
): Promise<InspectionSetupResult> {
  try {
    const { data, error } = await supabase
      .from("work_inspections")
      .select("id, material_id, method, status, product_code, product_lot")
      .eq("work_id", workId)
      .eq("stage", stage);
    if (error) throw error;

    const rows = (data ?? []) as ExistingInspection[];
    if (rows.length === 0) return await setupWorkInspections(supabase, workId, workMasterId, stage);

    const { data: imageRows, error: imageError } = await supabase
      .from("inspection_images")
      .select("inspection_id")
      .in("inspection_id", rows.map((row) => row.id));
    if (imageError) throw imageError;
    const withImages = new Set(((imageRows ?? []) as { inspection_id: string }[]).map((row) => row.inspection_id));

    const isMutable = (row: ExistingInspection) => row.status === "pending" && !withImages.has(row.id);
    const stageUntouched = rows.every(isMutable);

    const { materialIds, methodsByMaterial } = await loadMaterialPlan(supabase, workMasterId);
    const products = await loadInspectionProducts(supabase, workId, workMasterId);

    const deleteIds: string[] = [];
    const insertPayload: Record<string, unknown>[] = [];

    const materialRowsById = new Map<string, ExistingInspection[]>();
    for (const row of rows.filter((item) => item.material_id && item.method !== "PRODUCT")) {
      materialRowsById.set(row.material_id as string, [...(materialRowsById.get(row.material_id as string) ?? []), row]);
    }

    for (const materialId of materialIds) {
      const desired = methodsByMaterial.get(materialId) ?? [];
      const existing = materialRowsById.get(materialId) ?? [];
      if (existing.length === 0) {
        if (stageUntouched) insertPayload.push(...desired.map((method) => materialRow(workId, stage, materialId, method)));
        continue;
      }
      const same = existing.length === desired.length && desired.every((method) => existing.some((row) => row.method === method));
      if (same || !existing.every(isMutable)) continue;
      deleteIds.push(...existing.map((row) => row.id));
      insertPayload.push(...desired.map((method) => materialRow(workId, stage, materialId, method)));
    }

    const existingProducts = rows.filter((row) => row.method === "PHOTO" && !row.material_id);
    const desiredKeys = new Set(products.map((product) => productKey(product.code, product.lot)));
    const existingKeys = new Set(existingProducts.map((row) => productKey(text(row.product_code), row.product_lot)));
    for (const row of existingProducts) {
      if (!desiredKeys.has(productKey(text(row.product_code), row.product_lot)) && isMutable(row)) deleteIds.push(row.id);
    }
    if (stageUntouched) {
      for (const product of products) {
        if (!existingKeys.has(productKey(product.code, product.lot))) insertPayload.push(productPhotoRow(workId, stage, product));
      }
    }

    if (stage === "complete" && !rows.some((row) => row.method === "PRODUCT")) insertPayload.push(completionPhotoRow(workId));

    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabase.from("work_inspections").delete().in("id", deleteIds).eq("status", "pending");
      if (deleteError) throw deleteError;
    }
    if (insertPayload.length > 0) {
      const { error: insertError } = await supabase.from("work_inspections").insert(insertPayload);
      // 동시 진입 경합(유니크 위반)은 다른 요청이 이미 같은 행을 만든 것이므로 성공으로 본다.
      if (insertError && insertError.code !== "23505") throw insertError;
    }

    return deleteIds.length > 0 || insertPayload.length > 0 ? "created" : "skipped_existing";
  } catch (error) {
    console.error("검수 계획 재판정 실패:", workId, stage, error);
    return "failed";
  }
}
