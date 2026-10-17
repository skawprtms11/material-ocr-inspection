import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeMaterialInspectionMethod } from "@/lib/inspection/method-plan";
import { attachMissingReferences } from "@/lib/server/material-reference";
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

// 입력값 오류(중복/수량 등). 라우트에서 400으로 변환한다.
export class WorkMasterValidationError extends Error {}

// 작업등록 수량(work-register-shared.ts)과 같은 기준: 1 이상의 정수. 상한은 DB numeric 오버플로 방지용이다.
const MAX_USAGE_QUANTITY = 1_000_000;

function isPositiveQuantity(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_USAGE_QUANTITY;
}

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates);
}

export function validateMaterialRows(rows: WorkMaterialRowDto[]) {
  const duplicates = findDuplicates(rows.map((row) => row.materialId));
  if (duplicates.length > 0) {
    throw new WorkMasterValidationError(`중복된 부자재가 있습니다: ${duplicates.join(", ")}`);
  }
  if (rows.some((row) => !isPositiveQuantity(row.unitQuantity))) {
    throw new WorkMasterValidationError("부자재 수량은 1 이상 1,000,000 이하의 정수여야 합니다.");
  }
}

export function validateProductRows(rows: ProductUsageRowDto[]) {
  const duplicates = findDuplicates(rows.map((row) => row.productCode.trim()));
  if (duplicates.length > 0) {
    throw new WorkMasterValidationError(`중복된 제품코드가 있습니다: ${duplicates.join(", ")}`);
  }
  if (rows.some((row) => !row.productCode.trim())) {
    throw new WorkMasterValidationError("제품코드가 비어 있는 행이 있습니다.");
  }
  if (rows.some((row) => !isPositiveQuantity(row.unitQuantity))) {
    throw new WorkMasterValidationError("제품 수량은 1 이상 1,000,000 이하의 정수여야 합니다.");
  }
}

function describeError(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

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
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    code: text(row.code),
    name: text(row.name),
    lot: text(row.lot) || undefined,
    inspection_method: normalizeMaterialInspectionMethod(row.inspection_method),
    reference_image_path: text(row.reference_image_path),
    ocr_image_path: text(row.ocr_image_path) || undefined,
    vision_image_path: text(row.vision_image_path) || undefined,
    remark: text(row.remark) || undefined,
    is_active: bool(row.is_active),
    verification_value: text(row.verification_value)
  };
}

function toMaterialRow(row: DbRow): WorkMaterialRowDto {
  return {
    id: text(row.id),
    workMasterId: text(row.work_master_id),
    materialId: text(row.material_id),
    unitQuantity: numberValue(row.unit_quantity)
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

async function selectByWorkMasters(
  supabase: SupabaseClient,
  table: string,
  workMasterIds: string[],
  orderColumn: string
) {
  if (workMasterIds.length === 0) return [] as DbRow[];

  // 조회 오류를 빈 배열로 삼키면 빈 BOM을 보고 저장해 기존 BOM이 삭제될 수 있어 그대로 던진다
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .in("work_master_id", workMasterIds)
    .order(orderColumn, { ascending: true });
  if (error) throw error;
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
  const workMaterialRows = (await selectByWorkMasters(supabase, "work_master_materials", workMasterIds, "inspection_order")).map(toMaterialRow);
  const productRows = (await selectByWorkMasters(supabase, "work_master_products", workMasterIds, "sort_order")).map(toProductRow);

  return {
    source: "supabase",
    workMasters,
    materials: await attachMissingReferences(supabase, ((materialRows ?? []) as DbRow[]).map(toMaterial)),
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
  const productDelete = await supabase.from("work_master_products").delete().in("work_master_id", ids);
  if (productDelete.error) throw productDelete.error;
  const materialDelete = await supabase.from("work_master_materials").delete().in("work_master_id", ids);
  if (materialDelete.error) throw materialDelete.error;

  const { error } = await supabase.from("work_masters").delete().in("id", ids);
  if (error) throw error;
}

export async function replaceWorkMasterMaterials(
  supabase: SupabaseClient,
  workMasterId: string,
  rows: WorkMaterialRowDto[]
) {
  validateMaterialRows(rows);

  // 삭제 후 insert가 실패하면 기존 BOM을 복원해야 하므로 먼저 확보해 둔다
  const { data: existingData, error: existingError } = await supabase
    .from("work_master_materials")
    .select("*")
    .eq("work_master_id", workMasterId);
  if (existingError) throw existingError;
  const existingRows = (existingData ?? []) as DbRow[];

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
  if (error) {
    if (existingRows.length > 0) {
      const restore = await supabase.from("work_master_materials").insert(existingRows);
      if (restore.error) {
        throw new Error(
          `부자재 저장 실패(${describeError(error)}) 및 기존 BOM 복원 실패(${describeError(restore.error)}). 기존 BOM이 유실되었을 수 있으니 확인이 필요합니다.`
        );
      }
    }
    throw error;
  }

  return (data ?? []) as DbRow[];
}

export async function replaceWorkMasterProducts(
  supabase: SupabaseClient,
  workMasterId: string,
  rows: ProductUsageRowDto[]
) {
  validateProductRows(rows);

  // 삭제 후 insert가 실패하면 기존 행을 복원해야 하므로 먼저 확보해 둔다
  const { data: existingData, error: existingError } = await supabase
    .from("work_master_products")
    .select("*")
    .eq("work_master_id", workMasterId);
  if (existingError) throw existingError;
  const existingRows = (existingData ?? []) as DbRow[];

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
  if (error) {
    // 새 행 insert 실패 시 이미 삭제된 기존 행을 되살린다 (복원 실패보다 원래 에러 보고가 우선)
    if (existingRows.length > 0) {
      const restore = await supabase.from("work_master_products").insert(existingRows);
      if (restore.error) {
        throw new Error(
          `사용제품코드 저장 실패(${describeError(error)}) 및 기존 행 복원 실패(${describeError(restore.error)}). 기존 데이터가 유실되었을 수 있으니 확인이 필요합니다.`
        );
      }
    }
    throw error;
  }

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

  const { data: existingData, error: existingError } = await supabase
    .from("material_masters")
    .select("*")
    .eq("department_id", departmentId)
    .eq("shipper_id", shipperId)
    .in("code", uniqueCodes);
  if (existingError) throw existingError;

  const existingRows = ((existingData ?? []) as DbRow[]).map(toMaterial);
  const existingCodes = new Set(existingRows.map((material) => material.code));
  const missingCodes = uniqueCodes.filter((code) => !existingCodes.has(code));

  if (missingCodes.length === 0) return existingRows;

  const insertPayload = missingCodes.map((code) => ({
    department_id: departmentId,
    shipper_id: shipperId,
    code,
    name: `${code} (부자재마스터 등록 필요)`,
    inspection_method: "NONE",
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
  // 한 행 안의 같은 부자재/제품코드 중복(예: A11/A11)은 수량 합산 없이 거부한다
  rows.forEach((row) => {
    const materialDup = findDuplicates(row.materialCodes.map((code) => code.trim()));
    if (materialDup.length > 0) {
      throw new WorkMasterValidationError(`작업마스터 ${row.code}: 중복된 부자재코드가 있습니다: ${materialDup.join(", ")}`);
    }
    const productDup = findDuplicates(row.productCodes.map((code) => code.trim()));
    if (productDup.length > 0) {
      throw new WorkMasterValidationError(`작업마스터 ${row.code}: 중복된 제품코드가 있습니다: ${productDup.join(", ")}`);
    }
  });
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
      .map((code) => materialsByCode.get(code.trim()))
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
