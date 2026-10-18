import { inspectionMethodLabels } from "@/lib/constants/status";
import { normalizeMaterialInspectionMethod } from "@/lib/inspection/method-plan";
import { appRepository } from "@/lib/repositories/app-repository";
import { toMockScopeIds } from "@/lib/repositories/supabase-scope";
import { loadWorkMasterMaterialRows, loadWorkMasterProductRows } from "@/lib/server/work-master-bom";
import {
  RouteError,
  fetchComponentsByWorkIds,
  text,
  type DbRow,
  type ServerSupabase
} from "@/lib/server/work-register-shared";
import type {
  DocumentTemplate,
  WorkOrderIssue,
  WorkOrderIssueSummaryDto,
  WorkOrderMaterialDto,
  WorkOrderOptionTemplateDto,
  WorkOrderPrintDto,
  WorkOrderProductDto
} from "@/lib/types/document-template";
import type { WorkComponentRowDto } from "@/lib/types/work-register-api";

export const ISSUE_SUMMARY_LIMIT = 10;

function templateFromRow(row: DbRow) {
  return row as unknown as DocumentTemplate;
}

// 양식이 요청 부서 소속이고 레이아웃형이며 해당 화주에 매핑돼 있는지 확인한다.
// 오류 규약: 형식 400 / 없음 404 / 타 부서 403 / 비레이아웃 400 / 미매핑·비활성 409.
export async function loadMappedTemplate(
  supabase: ServerSupabase,
  scope: { departmentId: string; shipperId: string },
  templateId: string
) {
  const { data, error } = await supabase.from("document_templates").select("*").eq("id", templateId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RouteError("양식을 찾을 수 없습니다.", 404);

  const template = templateFromRow(data as DbRow);
  if (template.department_id !== scope.departmentId) throw new RouteError("선택한 부서에 속하지 않는 양식입니다.", 403);
  if (template.template_type !== "layout") throw new RouteError("레이아웃형 양식만 출력할 수 있습니다.", 400);

  const { data: mapping, error: mappingError } = await supabase
    .from("shipper_document_templates")
    .select("id")
    .eq("shipper_id", scope.shipperId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (mappingError) throw mappingError;
  if (!mapping) throw new RouteError("해당 화주에 등록되지 않은 양식입니다.", 409);
  if (!template.is_active) throw new RouteError("사용 중지된 양식입니다.", 409);

  return template;
}

// 화주에 매핑된 활성 레이아웃 양식(기본 우선 → sort_order → 코드)
export async function listMappedTemplates(
  supabase: ServerSupabase,
  scope: { departmentId: string; shipperId: string }
): Promise<WorkOrderOptionTemplateDto[]> {
  const { data: mappingRows, error } = await supabase
    .from("shipper_document_templates")
    .select("*")
    .eq("shipper_id", scope.shipperId);
  if (error) throw error;

  const mappings = (mappingRows ?? []) as DbRow[];
  if (mappings.length === 0) return [];

  const { data: templateRows, error: templateError } = await supabase
    .from("document_templates")
    .select("*")
    .in("id", mappings.map((mapping) => text(mapping.template_id)))
    .eq("department_id", scope.departmentId)
    .eq("is_active", true)
    .eq("template_type", "layout");
  if (templateError) throw templateError;

  const templateById = new Map(((templateRows ?? []) as DbRow[]).map((row) => [text(row.id), templateFromRow(row)]));

  return mappings
    .flatMap((mapping) => {
      const template = templateById.get(text(mapping.template_id));
      if (!template) return [];
      return [
        {
          mappingId: text(mapping.id),
          isDefault: mapping.is_default === true,
          sortOrder: typeof mapping.sort_order === "number" ? mapping.sort_order : 0,
          template
        }
      ];
    })
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) ||
        a.sortOrder - b.sortOrder ||
        a.template.code.localeCompare(b.template.code)
    );
}

// 최근 이력 N건. seq는 작업별 출력 순번(오래된 것이 1)이라 전체 건수에서 역산한다.
export async function listRecentIssues(supabase: ServerSupabase, workId: string): Promise<WorkOrderIssueSummaryDto[]> {
  const { data, error, count } = await supabase
    .from("work_order_issues")
    .select("id, template_code, template_name, revision_date, issue_kind, issued_at", { count: "exact" })
    .eq("work_id", workId)
    .order("issued_at", { ascending: false })
    .limit(ISSUE_SUMMARY_LIMIT);
  if (error) throw error;

  const total = count ?? (data ?? []).length;
  return ((data ?? []) as unknown as Omit<WorkOrderIssueSummaryDto, "seq">[]).map((row, index) => ({
    ...row,
    seq: total - index
  }));
}

export async function countIssuesUpTo(supabase: ServerSupabase, workId: string, issuedAt: string) {
  const { count, error } = await supabase
    .from("work_order_issues")
    .select("id", { count: "exact", head: true })
    .eq("work_id", workId)
    .lte("issued_at", issuedAt);
  if (error) throw error;
  return count ?? 0;
}

export async function loadIssueForWork(supabase: ServerSupabase, workId: string, issueId: string) {
  const { data, error } = await supabase.from("work_order_issues").select("*").eq("id", issueId).maybeSingle();
  if (error) throw error;
  if (!data || text((data as DbRow).work_id) !== workId) throw new RouteError("출력 이력을 찾을 수 없습니다.", 404);
  return data as unknown as WorkOrderIssue;
}

function groupProducts(rows: WorkComponentRowDto[]): WorkOrderProductDto[] {
  const byCode = new Map<string, WorkOrderProductDto>();
  for (const row of rows) {
    const existing = byCode.get(row.code);
    const lot = { lot: row.lot, allocatedQuantity: row.allocatedQuantity, memo: row.memo };
    if (existing) {
      existing.lots.push(lot);
    } else {
      byCode.set(row.code, {
        code: row.code,
        name: row.name,
        unitQuantity: row.unitQuantity,
        requiredQuantity: row.requiredQuantity,
        lots: [lot]
      });
    }
  }
  return Array.from(byCode.values());
}

function toMaterialDtos(rows: WorkComponentRowDto[], methodByCode: Map<string, string>): WorkOrderMaterialDto[] {
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    unitQuantity: row.unitQuantity,
    requiredQuantity: row.requiredQuantity,
    lot: row.lot,
    allocatedQuantity: row.allocatedQuantity,
    memo: row.memo,
    inspectionMethodLabel: methodByCode.get(row.code)
  }));
}

// 실DB 출력 데이터 조립. codeValue는 모바일 findWorkByDocumentNo 정확 일치 키라 document_no를 가공 없이 쓴다.
export async function buildWorkOrderPrintDto(
  supabase: ServerSupabase,
  work: DbRow,
  document: WorkOrderPrintDto["document"]
): Promise<WorkOrderPrintDto> {
  const workId = text(work.id);
  const departmentId = text(work.department_id);
  const shipperId = text(work.shipper_id);
  const workMasterId = text(work.work_master_id);

  const [masterResult, shipperResult, departmentResult, componentsByWork] = await Promise.all([
    workMasterId
      ? supabase.from("work_masters").select("code, name").eq("id", workMasterId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("shippers").select("code, name").eq("id", shipperId).maybeSingle(),
    supabase.from("departments").select("name").eq("id", departmentId).maybeSingle(),
    fetchComponentsByWorkIds(supabase, [workId])
  ]);
  if (masterResult.error) throw masterResult.error;
  if (shipperResult.error) throw shipperResult.error;
  if (departmentResult.error) throw departmentResult.error;

  const components = componentsByWork[workId] ?? [];
  const materialRows = components.filter((row) => row.kind === "부자재");
  const productComponents = components.filter((row) => row.kind === "제품");
  const quantity = typeof work.quantity === "number" ? work.quantity : 0;
  const methodByCode = new Map<string, string>();

  // 구성품이 없는 작업은 작업현황 상세와 같은 규칙으로 작업마스터 BOM × 작업수량으로 폴백한다.
  let products: WorkOrderProductDto[];
  if (productComponents.length > 0) {
    products = groupProducts(productComponents);
  } else {
    const productRows = workMasterId ? await loadWorkMasterProductRows(supabase, workMasterId) : [];
    products = productRows.map((row) => {
      const unitQuantity = typeof row.unit_quantity === "number" ? row.unit_quantity : 1;
      const required = unitQuantity * quantity;
      return {
        code: text(row.product_code),
        name: text(row.product_name),
        unitQuantity,
        requiredQuantity: required,
        lots: [{ lot: "-", allocatedQuantity: required, memo: "" }]
      };
    });
  }

  let materials: WorkOrderMaterialDto[];
  if (materialRows.length > 0) {
    const materialCodes = Array.from(new Set(materialRows.map((row) => row.code).filter(Boolean)));
    if (materialCodes.length > 0) {
      const { data: masterRows, error: masterRowsError } = await supabase
        .from("material_masters")
        .select("code, inspection_method")
        .eq("department_id", departmentId)
        .eq("shipper_id", shipperId)
        .in("code", materialCodes);
      if (masterRowsError) throw masterRowsError;
      for (const row of (masterRows ?? []) as DbRow[]) {
        methodByCode.set(text(row.code), inspectionMethodLabels[normalizeMaterialInspectionMethod(row.inspection_method)]);
      }
    }
    materials = toMaterialDtos(materialRows, methodByCode);
  } else {
    const { mappings, materialById } = workMasterId
      ? await loadWorkMasterMaterialRows(supabase, workMasterId)
      : { mappings: [] as DbRow[], materialById: new Map<string, DbRow>() };
    materials = mappings.map((mapping) => {
      const material = materialById.get(text(mapping.material_id));
      const unitQuantity = typeof mapping.unit_quantity === "number" ? mapping.unit_quantity : 1;
      const required = unitQuantity * quantity;
      return {
        code: text(material?.code, "-"),
        name: text(material?.name, "-"),
        unitQuantity,
        requiredQuantity: required,
        lot: "-",
        allocatedQuantity: required,
        memo: "",
        inspectionMethodLabel: inspectionMethodLabels[normalizeMaterialInspectionMethod(material?.inspection_method ?? "NONE")]
      };
    });
  }

  const master = (masterResult.data ?? {}) as DbRow;
  const shipper = (shipperResult.data ?? {}) as DbRow;
  const department = (departmentResult.data ?? {}) as DbRow;
  const workDate = text(work.work_date);

  return {
    document,
    work: {
      id: workId,
      documentNo: text(work.document_no),
      workType: text(work.work_type),
      workDate,
      dueDate: text(work.due_date),
      quantity,
      finishedProductLot: text(work.finished_product_lot),
      memo: text(work.memo),
      status: text(work.status)
    },
    finished: { code: text(master.code, "-"), name: text(master.name, "-") },
    shipper: { code: text(shipper.code), name: text(shipper.name) },
    department: { name: text(department.name) },
    products,
    materials,
    codeValue: text(work.document_no)
  };
}

// ---- mock 모드(DB 미변경, 읽기 전용 조립) ----

export function mockMappedTemplates(scope: { departmentId: string; shipperId: string }): WorkOrderOptionTemplateDto[] {
  const templates = appRepository.listDocumentTemplates({ departmentId: scope.departmentId });
  return appRepository
    .listShipperDocumentTemplates(scope.shipperId)
    .flatMap((mapping) => {
      const template = templates.find((item) => item.id === mapping.template_id && item.is_active);
      if (!template) return [];
      return [{ mappingId: mapping.id, isDefault: mapping.is_default, sortOrder: mapping.sort_order, template }];
    })
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.sortOrder - b.sortOrder);
}

export function mockWorkInScope(workId: string, departmentId: string, shipperId: string) {
  const scope = toMockScopeIds(departmentId, shipperId);
  const work = appRepository.findWorkById(workId);
  if (!work) throw new RouteError("작업을 찾을 수 없습니다.", 404);
  if (work.department_id !== scope.departmentId || work.shipper_id !== scope.shipperId) {
    throw new RouteError("선택한 부서/화주에 속하지 않는 작업입니다.", 403);
  }
  return { work, scope };
}

export function buildMockPrintDto(
  work: NonNullable<ReturnType<typeof appRepository.findWorkById>>,
  scope: { departmentId: string; shipperId: string },
  document: WorkOrderPrintDto["document"]
): WorkOrderPrintDto {
  const workMaster = appRepository.listWorkMasters(scope).find((item) => item.id === work.work_master_id);
  const shipper = appRepository.listShippers({ departmentId: scope.departmentId }).find((item) => item.id === scope.shipperId);
  const department = appRepository.listDepartments().find((item) => item.id === scope.departmentId);
  const materials = appRepository.listMaterials(scope);
  const quantity = 100;

  return {
    document,
    work: {
      id: work.id,
      documentNo: work.document_no,
      workType: "리드레싱",
      workDate: work.work_date,
      dueDate: work.work_date,
      quantity,
      finishedProductLot: "",
      memo: work.memo,
      status: work.status
    },
    finished: { code: workMaster?.code ?? "-", name: workMaster?.name ?? "-" },
    shipper: { code: shipper?.code ?? "", name: shipper?.name ?? "" },
    department: { name: department?.name ?? "" },
    products: [],
    materials: appRepository.listWorkMasterMaterials(work.work_master_id).flatMap((mapping) => {
      const material = materials.find((item) => item.id === mapping.material_id);
      if (!material) return [];
      return [
        {
          code: material.code,
          name: material.name,
          unitQuantity: 1,
          requiredQuantity: quantity,
          lot: material.lot ?? "",
          allocatedQuantity: quantity,
          memo: "",
          inspectionMethodLabel: inspectionMethodLabels[material.inspection_method]
        }
      ];
    }),
    codeValue: work.document_no
  };
}
