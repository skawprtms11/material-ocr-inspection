import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import {
  createBatchWorkMasters,
  createWorkMaster,
  deleteWorkMasters,
  fetchWorkMasterData,
  mapWorkMasterRow
} from "@/lib/repositories/work-master-supabase-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MaterialMaster, WorkMaster } from "@/lib/types/domain";
import type {
  BatchWorkMasterResponse,
  BatchWorkMasterRowDto,
  CreateWorkMasterResponse,
  DraftWorkMasterDto,
  ProductUsageRowDto,
  WorkMasterDataResponse,
  WorkMaterialRowDto
} from "@/lib/types/work-master-api";

function createMockWorkMaster(draft: DraftWorkMasterDto, departmentId: string, shipperId: string): WorkMaster {
  return {
    id: `wm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    department_id: departmentId,
    shipper_id: shipperId,
    code: draft.code.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    is_active: draft.isActive
  };
}

function mockData(departmentId: string, shipperId: string, warning?: string): WorkMasterDataResponse {
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });
  const materials = appRepository.listMaterials({ departmentId, shipperId });

  return {
    source: "mock",
    warning,
    workMasters,
    materials,
    materialRowsByWork: workMasters.reduce<Record<string, WorkMaterialRowDto[]>>((acc, workMaster) => {
      acc[workMaster.id] = appRepository.listWorkMasterMaterials(workMaster.id).map((mapping) => ({
        id: mapping.id,
        workMasterId: mapping.work_master_id,
        materialId: mapping.material_id,
        unitQuantity: mapping.inspection_order
      }));
      return acc;
    }, {}),
    productRowsByWork: {},
    metaByWork: {}
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("department_id");
  const shipperId = searchParams.get("shipper_id");

  if (!departmentId || !shipperId) {
    return NextResponse.json({ error: "department_id와 shipper_id가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(mockData(departmentId, shipperId));
  }

  try {
    const scope = await resolveScopeIds(supabase, departmentId, shipperId);
    return NextResponse.json(await fetchWorkMasterData(supabase, scope.departmentId, scope.shipperId));
  } catch (error) {
    const message = errorMessage(error, "Supabase 작업마스터 조회에 실패했습니다.");
    return NextResponse.json(mockData(departmentId, shipperId, message));
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    mode?: "single" | "batch";
    departmentId?: string;
    shipperId?: string;
    draft?: DraftWorkMasterDto;
    rows?: BatchWorkMasterRowDto[];
  };
  const departmentId = body.departmentId;
  const shipperId = body.shipperId;

  if (!departmentId || !shipperId) {
    return NextResponse.json({ error: "departmentId와 shipperId가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (body.mode === "batch") {
    const rows = body.rows ?? [];
    if (rows.length === 0) return NextResponse.json({ error: "등록할 행이 없습니다." }, { status: 400 });

    if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
      const createdMaterials: MaterialMaster[] = [];
      const workMasters = rows.map((row) => createMockWorkMaster(row, departmentId, shipperId));
      const mockMaterials = appRepository.listMaterials({ departmentId, shipperId });
      const materialRowsByWork = workMasters.reduce<Record<string, WorkMaterialRowDto[]>>((acc, workMaster, index) => {
        acc[workMaster.id] = rows[index].materialCodes.map((code, materialIndex) => {
          let material = mockMaterials.find((item) => item.code === code) ?? createdMaterials.find((item) => item.code === code);

          if (!material) {
            material = {
              id: `mat-batch-${code}-${Date.now()}-${materialIndex}`,
              department_id: departmentId,
              shipper_id: shipperId,
              name: `${code} (부자재마스터 등록 필요)`,
              code,
              inspection_method: "BOTH",
              reference_image_path: "",
              remark: "작업마스터 일괄등록에서 자동 생성됨. 부자재마스터 등록 필요",
              is_active: true
            };
            createdMaterials.push(material);
          }

          return {
            id: `wmm-batch-${workMaster.id}-${material.id}`,
            workMasterId: workMaster.id,
            materialId: material.id,
            unitQuantity: 1
          };
        });
        return acc;
      }, {});
      const productRowsByWork = workMasters.reduce<Record<string, ProductUsageRowDto[]>>((acc, workMaster, index) => {
        acc[workMaster.id] = rows[index].productCodes.map((productCode, productIndex) => ({
          id: `prod-batch-${workMaster.id}-${productCode}`,
          workMasterId: workMaster.id,
          productCode,
          productName: `${productCode} 제품명 확인 필요`,
          unitQuantity: 1,
          productType: productIndex === 0 ? "정상품" : "세트제품"
        }));
        return acc;
      }, {});
      const response: BatchWorkMasterResponse = {
        source: "mock",
        workMasters,
        materialRowsByWork,
        productRowsByWork,
        metaByWork: Object.fromEntries(workMasters.map((workMaster, index) => [workMaster.id, { workType: rows[index].workType, type: rows[index].type || "일괄" }])),
        createdMaterials
      };
      return NextResponse.json(response);
    }

    try {
      const scope = await resolveScopeIds(supabase, departmentId, shipperId);
      const created = await createBatchWorkMasters(supabase, scope.departmentId, scope.shipperId, rows);
      const response: BatchWorkMasterResponse = {
        source: "supabase",
        workMasters: created.workMasters,
        materialRowsByWork: created.materialRowsByWork,
        productRowsByWork: created.productRowsByWork,
        metaByWork: created.metaByWork,
        createdMaterials: created.materials
      };
      return NextResponse.json(response);
    } catch (error) {
      const message = errorMessage(error, "작업마스터 일괄등록에 실패했습니다.");
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (!body.draft) return NextResponse.json({ error: "작업마스터 입력값이 필요합니다." }, { status: 400 });

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    const workMaster = createMockWorkMaster(body.draft, departmentId, shipperId);
    const response: CreateWorkMasterResponse = {
      source: "mock",
      workMaster,
      materialRows: [],
      productRows: [],
      meta: { workType: body.draft.workType, type: body.draft.type || "신규" }
    };
    return NextResponse.json(response);
  }

  try {
    const scope = await resolveScopeIds(supabase, departmentId, shipperId);
    const row = await createWorkMaster(supabase, scope.departmentId, scope.shipperId, body.draft);
    const mapped = mapWorkMasterRow(row);
    const response: CreateWorkMasterResponse = {
      source: "supabase",
      workMaster: mapped.workMaster,
      materialRows: [],
      productRows: [],
      meta: mapped.meta
    };
    return NextResponse.json(response);
  } catch (error) {
    const message = errorMessage(error, "작업마스터 등록에 실패했습니다.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { ids?: string[] };
  const ids = body.ids ?? [];

  if (ids.length === 0) return NextResponse.json({ error: "삭제할 작업마스터가 없습니다." }, { status: 400 });

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", deletedIds: ids });
  }

  try {
    await deleteWorkMasters(supabase, ids);
    return NextResponse.json({ source: "supabase", deletedIds: ids });
  } catch (error) {
    const message = errorMessage(error, "작업마스터 삭제에 실패했습니다.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
