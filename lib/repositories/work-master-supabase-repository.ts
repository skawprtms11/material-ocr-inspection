import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaterialMaster, WorkMaster } from "@/lib/types/domain";
import type {
  BatchWorkMasterRowDto,
  DraftWorkMasterDto,
  ProductUsageRowDto,
  WorkMasterDataResponse,
  WorkMasterMetaDto,
  WorkMaterialRowDto
} from "@/lib/types/work-master-api";

type DbRow = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function bool(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toWorkMaster(row: DbRow): WorkMaster {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    code: text(row.code),
    name: text(row.name),
    description: text(row.description),
    is_active: bool(row.is_active)
  };
}

function toMaterial(row: DbRow): MaterialMaster {
  const method = text(row.inspection_method, "BOTH");

  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    code: text(row.code),
    name: text(row.name),
    lot: text(row.lot) || undefined,
    inspection_method: method === "OCR" || method === "VISION" || method === "BOTH" ? method : "BOTH",
    reference_image_path: text(row.reference_image_path),
    ocr_image_path: text(row.ocr_image_path) || undefined,
    vision_image_path: text(row.vision_image_path) || undefined,
    remark: text(row.remark) || undefined,
    is_active: bool(row.is_active)
  };
}

function toMaterialRow(row: DbRow): WorkMaterialRowDto {
  return {
    id: text(row.id),
    workMasterId: text(row.work_master_id),
    materialId: text(row.material_id),
    unitQuantity: numberValue(row.unit_quantity, numberValue(row.inspection_order))
  };
}

function toProductRow(row: DbRow): ProductUsageRowDto {
  const productType = text(row.product_type, "정상품");

  return {
    id: text(row.id),
    workMasterId: text(row.work_master_id),
    productCode: text(row.product_code),
    productName: text(row.product_name),
    unitQuantity: numberValue(row.unit_quantity),
    productType: productType === "샘플" || productType === "세트제품" ? productType : "정상품"
  };
}

function toMeta(row: DbRow): WorkMasterMetaDto {
  return {
    workType: text(row.work_type, "리드레싱"),
    type: text(row.type, "기본")
  };
}

function groupByWork<T extends { workMasterId: string }>(rows: T[]) {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    acc[row.workMasterId] = [...(acc[row.workMasterId] ?? []), row];
    return acc;
  }, {});
}

async function selectMaybeEmpty(supabase: SupabaseClient, table: string, workMasterIds: string[]) {
  if (workMasterIds.length === 0) return [] as DbRow[];

  const { data, error } = await supabase.from(table).select("*").in("work_master_id", workMasterIds);
  if (error) return [] as DbRow[];
  return (data ?? []) as DbRow[];
}

export async function fetchWorkMasterData(
  supabase: SupabaseClient,
  departmentId: string,
  shipperId: string
): Promise<WorkMasterDataResponse> {
  const { data: workMasterRows, error: workMasterError } = await supabase
    .from("work_masters")
    .select("*")
    .eq("department_id", departmentId)
    .eq("shipper_id", shipperId);

  if (workMasterError) throw workMasterError;

  const { data: materialRows, error: materialError } = await supabase
    .from("material_masters")
    .select("*")
    .eq("department_id", departmentId)
    .eq("shipper_id", shipperId);

  if (materialError) throw materialError;

  const workMasterDbRows = (workMasterRows ?? []) as DbRow[];
  const workMasters = workMasterDbRows.map(toWorkMaster);
  const workMasterIds = workMasters.map((workMaster) => workMaster.id);
  const workMaterialRows = (await selectMaybeEmpty(supabase, "work_master_materials", workMasterIds)).map(toMaterialRow);
  const productRows = (await selectMaybeEmpty(supabase, "work_master_products", workMasterIds)).map(toProductRow);

  return {
    source: "supabase",
    workMasters,
    materials: ((materialRows ?? []) as DbRow[]).map(toMaterial),
    materialRowsByWork: groupByWork(workMaterialRows),
    productRowsByWork: groupByWork(productRows),
    metaByWork: workMasterDbRows.reduce<Record<string, WorkMasterMetaDto>>((acc, row) => {
      acc[text(row.id)] = toMeta(row);
      return acc;
    }, {})
  };
}

export async function createWorkMaster(
  supabase: SupabaseClient,
  departmentId: string,
  shipperId: string,
  draft: DraftWorkMasterDto
) {
  const payload = {
    department_id: departmentId,
    shipper_id: shipperId,
    work_type: draft.workType,
    code: draft.code.trim(),
    type: draft.type.trim() || "신규",
    name: draft.name.trim(),
    description: draft.description.trim(),
    is_active: draft.isActive
  };

  const { data, error } = await supabase.from("work_masters").insert(payload).select("*").single();

  if (!error) return data as DbRow;

  const { work_type: _workType, type: _type, ...fallbackPayload } = payload;
  const fallback = await supabase.from("work_masters").insert(fallbackPayload).select("*").single();
  if (fallback.error) throw fallback.error;
  return { ...(fallback.data as DbRow), work_type: draft.workType, type: draft.type || "신규" };
}

export async function deleteWorkMasters(supabase: SupabaseClient, ids: string[]) {
  await supabase.from("work_master_products").delete().in("work_master_id", ids);
  await supabase.from("work_master_materials").delete().in("work_master_id", ids);

  const { error } = await supabase.from("work_masters").delete().in("id", ids);
  if (error) throw error;
}

export async function replaceWorkMasterMaterials(
  supabase: SupabaseClient,
  workMasterId: string,
  rows: WorkMaterialRowDto[]
) {
  const deleteResult = await supabase.from("work_master_materials").delete().eq("work_master_id", workMasterId);
  if (deleteResult.error) throw deleteResult.error;

  if (rows.length === 0) return [] as DbRow[];

  const payload = rows.map((row, index) => ({
    work_master_id: workMasterId,
    material_id: row.materialId,
    unit_quantity: row.unitQuantity,
    is_required: true,
    inspection_order: index + 1
  }));
  const { data, error } = await supabase.from("work_master_materials").insert(payload).select("*");

  if (!error) return (data ?? []) as DbRow[];

  const fallback = await supabase
    .from("work_master_materials")
    .insert(payload.map(({ unit_quantity: _unitQuantity, ...row }) => row))
    .select("*");
  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []) as DbRow[];
}

export async function replaceWorkMasterProducts(
  supabase: SupabaseClient,
  workMasterId: string,
  rows: ProductUsageRowDto[]
) {
  const deleteResult = await supabase.from("work_master_products").delete().eq("work_master_id", workMasterId);
  if (deleteResult.error) throw deleteResult.error;

  if (rows.length === 0) return [] as DbRow[];

  const payload = rows.map((row, index) => ({
    work_master_id: workMasterId,
    product_code: row.productCode,
    product_name: row.productName,
    unit_quantity: row.unitQuantity,
    product_type: row.productType,
    sort_order: index + 1
  }));
  const { data, error } = await supabase.from("work_master_products").insert(payload).select("*");
  if (error) throw error;

  return (data ?? []) as DbRow[];
}

export async function createMissingMaterials(
  supabase: SupabaseClient,
  departmentId: string,
  shipperId: string,
  codes: string[]
) {
  const uniqueCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  if (uniqueCodes.length === 0) return [] as MaterialMaster[];

  const { data: existingData } = await supabase
    .from("material_masters")
    .select("*")
    .eq("department_id", departmentId)
    .eq("shipper_id", shipperId)
    .in("code", uniqueCodes);

  const existingRows = ((existingData ?? []) as DbRow[]).map(toMaterial);
  const existingCodes = new Set(existingRows.map((material) => material.code));
  const missingCodes = uniqueCodes.filter((code) => !existingCodes.has(code));

  if (missingCodes.length === 0) return existingRows;

  const insertPayload = missingCodes.map((code) => ({
    department_id: departmentId,
    shipper_id: shipperId,
    code,
    name: `${code} (부자재마스터 등록 필요)`,
    inspection_method: "BOTH",
    reference_image_path: "",
    remark: "작업마스터 일괄등록에서 자동 생성됨. 부자재마스터 등록 필요",
    is_active: true
  }));

  const { data, error } = await supabase.from("material_masters").insert(insertPayload).select("*");
  if (error) throw error;

  return [...existingRows, ...((data ?? []) as DbRow[]).map(toMaterial)];
}

export function mapWorkMasterRow(row: DbRow) {
  return {
    workMaster: toWorkMaster(row),
    meta: toMeta(row)
  };
}

export function mapMaterialRows(rows: DbRow[]) {
  return rows.map(toMaterialRow);
}

export function mapProductRows(rows: DbRow[]) {
  return rows.map(toProductRow);
}

export async function createBatchWorkMasters(
  supabase: SupabaseClient,
  departmentId: string,
  shipperId: string,
  rows: BatchWorkMasterRowDto[]
) {
  const allMaterialCodes = rows.flatMap((row) => row.materialCodes);
  const materials = await createMissingMaterials(supabase, departmentId, shipperId, allMaterialCodes);
  const materialsByCode = new Map(materials.map((material) => [material.code, material]));
  const createdRows: DbRow[] = [];
  const materialRowsByWork: Record<string, WorkMaterialRowDto[]> = {};
  const productRowsByWork: Record<string, ProductUsageRowDto[]> = {};

  for (const row of rows) {
    const created = await createWorkMaster(supabase, departmentId, shipperId, row);
    createdRows.push(created);
    const workMasterId = text(created.id);
    const materialRows = row.materialCodes
      .map((code) => materialsByCode.get(code))
      .filter((material): material is MaterialMaster => Boolean(material))
      .map((material, index) => ({
        id: `wmm-pending-${workMasterId}-${index}`,
        workMasterId,
        materialId: material.id,
        unitQuantity: 1
      }));
    const productRows = row.productCodes.map((productCode, index) => ({
      id: `prod-pending-${workMasterId}-${index}`,
      workMasterId,
      productCode,
      productName: `${productCode} 제품명 확인 필요`,
      unitQuantity: 1,
      productType: index === 0 ? "정상품" : "세트제품"
    })) satisfies ProductUsageRowDto[];

    materialRowsByWork[workMasterId] = mapMaterialRows(await replaceWorkMasterMaterials(supabase, workMasterId, materialRows));
    productRowsByWork[workMasterId] = mapProductRows(await replaceWorkMasterProducts(supabase, workMasterId, productRows));
  }

  return {
    workMasters: createdRows.map(toWorkMaster),
    metaByWork: createdRows.reduce<Record<string, WorkMasterMetaDto>>((acc, row) => {
      acc[text(row.id)] = toMeta(row);
      return acc;
    }, {}),
    materialRowsByWork,
    productRowsByWork,
    materials
  };
}
