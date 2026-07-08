import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, isUuid, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import { fetchWorkMasterData } from "@/lib/repositories/work-master-supabase-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AppUser, WorkMaster } from "@/lib/types/domain";
import type {
  CreateWorkRegistrationRequest,
  CreateWorkRegistrationResponse,
  PendingAssignmentWorkDto,
  WorkComponentRowDto,
  WorkRegisterDataResponse
} from "@/lib/types/work-register-api";
import type { WorkMasterDataResponse } from "@/lib/types/work-master-api";

type DbRow = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function addDays(dateValue: string, days: number) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function mockPendingWorks(departmentId: string, shipperId: string) {
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });

  return appRepository
    .listWorks({ departmentId, shipperId })
    .filter((work) => work.status === "registered")
    .map((work, index): PendingAssignmentWorkDto => {
      const workMaster = workMasters.find((item) => item.id === work.work_master_id);

      return {
        id: work.id,
        registeredAt: work.work_date,
        workMasterId: work.work_master_id,
        workType: ["리드레싱", "세트작업", "해체작업", "기타작업"][index % 4],
        documentNo: work.document_no,
        finishedProductCode: workMaster?.code ?? "-",
        finishedProductName: workMaster?.name ?? "-",
        finishedProductLot: `LOT-${work.work_date.replaceAll("-", "").slice(2)}-${String(index + 1).padStart(2, "0")}`,
        quantity: 80 + index * 25,
        dueDate: addDays(work.work_date, 2 + index),
        memo: work.memo
      };
    });
}

function mockData(departmentId: string, shipperId: string, warning?: string): WorkRegisterDataResponse {
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });

  return {
    source: "mock",
    warning,
    pendingWorks: mockPendingWorks(departmentId, shipperId),
    workMasters,
    materials: appRepository.listMaterials({ departmentId, shipperId }),
    users: appRepository.listUsers().filter((user) => user.is_active && user.role !== "viewer"),
    materialRowsByWork: workMasters.reduce<WorkRegisterDataResponse["materialRowsByWork"]>((acc, workMaster) => {
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

function userFromRow(row: DbRow): AppUser {
  return {
    id: text(row.id),
    name: text(row.name),
    email: text(row.email),
    role: text(row.role, "worker") as AppUser["role"],
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    department_ids: [],
    shipper_ids: [],
    created_at: text(row.created_at),
    updated_at: text(row.updated_at)
  };
}

function makePendingWork(row: DbRow, workMaster?: WorkMaster, components?: WorkComponentRowDto[]): PendingAssignmentWorkDto {
  const workDate = text(row.work_date, new Date().toISOString().slice(0, 10));

  return {
    id: text(row.id),
    registeredAt: workDate,
    workMasterId: text(row.work_master_id),
    workType: text(row.work_type, "리드레싱"),
    documentNo: text(row.document_no),
    finishedProductCode: workMaster?.code ?? text(row.finished_product_code, "-"),
    finishedProductName: workMaster?.name ?? text(row.finished_product_name, "-"),
    finishedProductLot: text(row.finished_product_lot, ""),
    quantity: numberValue(row.quantity),
    dueDate: text(row.due_date, addDays(workDate, 2)),
    memo: text(row.memo),
    componentRows: components
  };
}

function componentFromRow(row: DbRow): WorkComponentRowDto {
  const kind = text(row.component_kind, text(row.kind, "제품"));
  const code = text(row.item_code, text(row.code));

  return {
    rowId: text(row.id, `component-${code}`),
    groupId: text(row.group_id, code),
    kind: kind === "부자재" ? "부자재" : "제품",
    code,
    name: text(row.item_name, text(row.name)),
    unitQuantity: numberValue(row.unit_quantity, 1),
    requiredQuantity: numberValue(row.required_quantity),
    lot: text(row.lot),
    allocatedQuantity: numberValue(row.allocated_quantity),
    memo: text(row.memo)
  };
}

async function fetchUsers() {
  const supabase = createServerSupabaseClient();
  if (!supabase) return appRepository.listUsers().filter((user) => user.is_active && user.role !== "viewer");

  const { data, error } = await supabase.from("app_users").select("*").neq("role", "viewer");
  if (error) return appRepository.listUsers().filter((user) => user.is_active && user.role !== "viewer");
  return ((data ?? []) as DbRow[]).map(userFromRow).filter((user) => user.is_active);
}

async function fetchComponentsByWorkIds(workIds: string[]) {
  const supabase = createServerSupabaseClient();
  if (!supabase || workIds.length === 0) return {};

  const { data, error } = await supabase.from("work_components").select("*").in("work_id", workIds);
  if (error) return {};

  return ((data ?? []) as DbRow[]).reduce<Record<string, WorkComponentRowDto[]>>((acc, row) => {
    const workId = text(row.work_id);
    acc[workId] = [...(acc[workId] ?? []), componentFromRow(row)];
    return acc;
  }, {});
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
    const masterData: WorkMasterDataResponse = await fetchWorkMasterData(supabase, scope.departmentId, scope.shipperId);
    const { data: workRows, error } = await supabase
      .from("works")
      .select("*")
      .eq("department_id", scope.departmentId)
      .eq("shipper_id", scope.shipperId)
      .eq("status", "registered");

    if (error) throw error;

    const rows = ((workRows ?? []) as DbRow[]).filter((row) => !row.assigned_to && !row.assigned_at);
    const componentsByWork = await fetchComponentsByWorkIds(rows.map((row) => text(row.id)));
    const workMasterById = new Map(masterData.workMasters.map((workMaster) => [workMaster.id, workMaster]));

    return NextResponse.json({
      source: "supabase",
      pendingWorks: rows.map((row) => makePendingWork(row, workMasterById.get(text(row.work_master_id)), componentsByWork[text(row.id)])),
      workMasters: masterData.workMasters,
      materials: masterData.materials,
      users: await fetchUsers(),
      materialRowsByWork: masterData.materialRowsByWork,
      productRowsByWork: masterData.productRowsByWork,
      metaByWork: masterData.metaByWork
    } satisfies WorkRegisterDataResponse);
  } catch (error) {
    return NextResponse.json(mockData(departmentId, shipperId, errorMessage(error, "Supabase 작업등록 조회에 실패했습니다.")));
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CreateWorkRegistrationRequest;
  const supabase = createServerSupabaseClient();

  if (!body.departmentId || !body.shipperId || !body.workMasterId || !body.documentNo) {
    return NextResponse.json({ error: "작업등록 필수값이 부족합니다." }, { status: 400 });
  }

  const registeredAt = new Date().toISOString().slice(0, 10);

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    const workMaster = appRepository.listWorkMasters({ departmentId: body.departmentId, shipperId: body.shipperId }).find((item) => item.id === body.workMasterId);
    const response: CreateWorkRegistrationResponse = {
      source: "mock",
      work: {
        id: `pending-${Date.now()}`,
        registeredAt,
        workMasterId: body.workMasterId,
        workType: body.workType,
        documentNo: body.documentNo,
        finishedProductCode: workMaster?.code ?? "-",
        finishedProductName: workMaster?.name ?? "-",
        finishedProductLot: body.finishedProductLot,
        quantity: body.quantity,
        dueDate: body.dueDate,
        memo: body.memo,
        componentRows: body.componentRows
      }
    };
    return NextResponse.json(response);
  }

  try {
    const scope = await resolveScopeIds(supabase, body.departmentId, body.shipperId);
    const { data: workMasterData } = await supabase.from("work_masters").select("*").eq("id", body.workMasterId).maybeSingle();
    const workMaster = workMasterData as DbRow | null;
    const payload = {
      department_id: scope.departmentId,
      shipper_id: scope.shipperId,
      work_master_id: body.workMasterId,
      document_no: body.documentNo,
      work_date: registeredAt,
      status: "registered",
      worker_name: "",
      memo: body.memo,
      work_type: body.workType,
      quantity: body.quantity,
      due_date: body.dueDate,
      finished_product_lot: body.finishedProductLot
    };

    let insertResult = await supabase.from("works").insert(payload).select("*").single();

    if (insertResult.error) {
      const { work_type: _workType, quantity: _quantity, due_date: _dueDate, finished_product_lot: _lot, ...fallbackPayload } = payload;
      insertResult = await supabase.from("works").insert(fallbackPayload).select("*").single();
    }

    if (insertResult.error) throw insertResult.error;

    const workRow = insertResult.data as DbRow;
    const workId = text(workRow.id);

    if (body.componentRows.length > 0) {
      const componentPayload = body.componentRows.map((row, index) => ({
        work_id: workId,
        component_kind: row.kind,
        group_id: row.groupId,
        item_code: row.code,
        item_name: row.name,
        unit_quantity: row.unitQuantity,
        required_quantity: row.requiredQuantity,
        lot: row.lot,
        allocated_quantity: row.allocatedQuantity,
        memo: row.memo,
        sort_order: index + 1
      }));

      await supabase.from("work_components").insert(componentPayload);
    }

    const response: CreateWorkRegistrationResponse = {
      source: "supabase",
      work: makePendingWork(
        workRow,
        workMaster
          ? {
              id: text(workMaster.id),
              department_id: text(workMaster.department_id),
              shipper_id: text(workMaster.shipper_id),
              code: text(workMaster.code),
              name: text(workMaster.name),
              description: text(workMaster.description),
              is_active: typeof workMaster.is_active === "boolean" ? workMaster.is_active : true
            }
          : undefined,
        body.componentRows
      )
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "작업등록 저장에 실패했습니다.") }, { status: 500 });
  }
}
