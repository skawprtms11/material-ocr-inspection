import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import { fetchWorkMasterData } from "@/lib/repositories/work-master-supabase-repository";
import { setupWorkInspections } from "@/lib/server/inspection-setup";
import { getInspectionAggregateStatus } from "@/lib/server/inspection-status";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  EDIT_LOCKED_REASON,
  RouteError,
  addDays,
  fetchComponentsByWorkIds,
  fetchScopedWorkMaster,
  insertWorkComponents,
  makePendingWork,
  text,
  validateRegistrationBody,
  type DbRow
} from "@/lib/server/work-register-shared";
import type { AppUser, InspectionStatus } from "@/lib/types/domain";
import type {
  CreateWorkRegistrationRequest,
  CreateWorkRegistrationResponse,
  PendingAssignmentWorkDto,
  WorkRegisterDataResponse
} from "@/lib/types/work-register-api";
import type { WorkMasterDataResponse } from "@/lib/types/work-master-api";

function mockPendingWorks(departmentId: string, shipperId: string) {
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });

  return appRepository
    .listWorks({ departmentId, shipperId })
    .filter((work) => work.status === "registered")
    // 검수완료 작업은 등록 목록에서 제외하고 작업현황에서만 조회한다(대표님 스펙)
    .filter((work) => {
      const statuses = appRepository.listInspections(work.id).map((inspection) => inspection.status);
      return getInspectionAggregateStatus(statuses) !== "completed";
    })
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

async function fetchUsers(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>) {
  const { data, error } = await supabase.from("app_users").select("*").neq("role", "viewer");
  if (error) throw error;
  return ((data ?? []) as DbRow[]).map(userFromRow).filter((user) => user.is_active);
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

    const unassignedRows = ((workRows ?? []) as DbRow[]).filter((row) => !row.assigned_to && !row.assigned_at);
    const startStatusesByWorkId = new Map<string, InspectionStatus[]>();
    const startedWorkIds = new Set<string>();
    const unassignedWorkIds = unassignedRows.map((row) => text(row.id));

    if (unassignedWorkIds.length > 0) {
      const { data: inspectionRows, error: inspectionError } = await supabase
        .from("work_inspections")
        .select("work_id, status, stage")
        .in("work_id", unassignedWorkIds);

      if (inspectionError) throw inspectionError;

      for (const inspectionRow of (inspectionRows ?? []) as DbRow[]) {
        const workId = text(inspectionRow.work_id);
        const status = text(inspectionRow.status) as InspectionStatus;
        // 수정 잠금은 모든 stage 기준(pending이 아닌 행이 하나라도 있으면 검수 시작으로 본다)
        if (status !== "pending") startedWorkIds.add(workId);
        // 검수완료 제외 판정은 시작검수(stage="start") 기준이다(완료검수는 배정 이후 단계라 여기서는 무관).
        if (text(inspectionRow.stage) === "start") {
          const list = startStatusesByWorkId.get(workId) ?? [];
          list.push(status);
          startStatusesByWorkId.set(workId, list);
        }
      }
    }

    // 검수완료 작업은 등록 목록에서 제외하고 작업현황에서만 조회한다(대표님 스펙)
    const rows = unassignedRows.filter(
      (row) => getInspectionAggregateStatus(startStatusesByWorkId.get(text(row.id)) ?? []) !== "completed"
    );
    const componentsByWork = await fetchComponentsByWorkIds(supabase, rows.map((row) => text(row.id)));
    const workMasterById = new Map(masterData.workMasters.map((workMaster) => [workMaster.id, workMaster]));

    return NextResponse.json({
      source: "supabase",
      pendingWorks: rows.map((row) =>
        makePendingWork(
          row,
          workMasterById.get(text(row.work_master_id)),
          componentsByWork[text(row.id)],
          startedWorkIds.has(text(row.id)) ? EDIT_LOCKED_REASON : undefined
        )
      ),
      workMasters: masterData.workMasters,
      materials: masterData.materials,
      users: await fetchUsers(supabase),
      materialRowsByWork: masterData.materialRowsByWork,
      productRowsByWork: masterData.productRowsByWork,
      metaByWork: masterData.metaByWork
    } satisfies WorkRegisterDataResponse);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Supabase 작업등록 조회에 실패했습니다.") }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as CreateWorkRegistrationRequest;
  const supabase = createServerSupabaseClient();
  const isMock = !supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  const validationError = validateRegistrationBody(body, !isMock);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const registeredAt = new Date().toISOString().slice(0, 10);

  if (!supabase || isMock) {
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

  let createdWorkId: string | null = null;

  try {
    const scope = await resolveScopeIds(supabase, body.departmentId, body.shipperId);
    const workMaster = await fetchScopedWorkMaster(supabase, body.workMasterId, scope);

    const { data: workData, error: workError } = await supabase
      .from("works")
      .insert({
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
      })
      .select("*")
      .single();
    if (workError) throw workError;

    const workRow = workData as DbRow;
    const workId = text(workRow.id);
    createdWorkId = workId;

    await insertWorkComponents(supabase, workId, body.componentRows);

    // 작업 등록 직후 검수 대상 행을 생성한다. 실패(failed)는 성공으로 보지 않고 아래 catch에서 등록 전체를 롤백한다.
    const inspectionSetup = await setupWorkInspections(supabase, workId, body.workMasterId);
    if (inspectionSetup === "failed") throw new Error("검수 행 생성에 실패해 작업등록을 취소했습니다.");

    const response: CreateWorkRegistrationResponse = {
      source: "supabase",
      inspectionSetup,
      work: makePendingWork(workRow, workMaster, body.componentRows)
    };

    return NextResponse.json(response);
  } catch (error) {
    // 구성품 저장 실패 시 방금 만든 작업 행이 구성품 없이 남지 않도록 롤백한다
    if (createdWorkId) {
      await supabase.from("work_components").delete().eq("work_id", createdWorkId);
      await supabase.from("work_inspections").delete().eq("work_id", createdWorkId);
      const { error: rollbackError } = await supabase.from("works").delete().eq("id", createdWorkId);
      if (rollbackError) {
        return NextResponse.json(
          { error: `${errorMessage(error, "작업등록 저장에 실패했습니다.")} (작업 롤백 실패: ${rollbackError.message})` },
          { status: 502 }
        );
      }
    }
    const status = error instanceof RouteError ? error.status : 502;
    return NextResponse.json({ error: errorMessage(error, "작업등록 저장에 실패했습니다.") }, { status });
  }
}
