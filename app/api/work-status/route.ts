import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds, toMockScopeIds } from "@/lib/repositories/supabase-scope";
import { fetchWorkMasterData } from "@/lib/repositories/work-master-supabase-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getDisplayStatus } from "@/lib/constants/status";
import { getInspectionAggregateStatus, getInspectionCompletedAt } from "@/lib/server/inspection-status";
import type { InspectionStatus, Work, WorkInspectionStage, WorkStatus } from "@/lib/types/domain";
import type { UpdateWorkStatusResponse, WorkStatusDataResponse, WorkStatusRowDto } from "@/lib/types/work-status-api";

type DbRow = Record<string, unknown>;

const workTypeOptions = ["리드레싱", "세트작업", "해체작업", "기타작업"];

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getFallbackFinishedProductLot(work: Work, index: number) {
  return `LOT-${work.work_date.replaceAll("-", "").slice(2)}-${String(index + 1).padStart(2, "0")}`;
}

function toWork(
  row: DbRow
): Work & { work_type?: string; quantity?: number; finished_product_lot?: string; completed_at?: string } {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    work_master_id: text(row.work_master_id),
    document_no: text(row.document_no),
    work_date: text(row.work_date),
    status: text(row.status, "registered") as WorkStatus,
    worker_name: text(row.worker_name),
    memo: text(row.memo),
    latest_inspected_at: text(row.latest_inspected_at) || undefined,
    work_type: text(row.work_type) || undefined,
    quantity: typeof row.quantity === "number" ? row.quantity : undefined,
    finished_product_lot: text(row.finished_product_lot) || undefined,
    completed_at: text(row.completed_at) || undefined
  };
}

function mockRows(departmentId: string, shipperId: string): WorkStatusRowDto[] {
  const scope = toMockScopeIds(departmentId, shipperId);
  const works = appRepository.listWorks(scope);
  const workMasters = appRepository.listWorkMasters(scope);

  return works.map((work, index) => {
    const workMaster = workMasters.find((item) => item.id === work.work_master_id);
    const inspectionStatuses = appRepository.listInspections(work.id).map((inspection) => inspection.status);
    // mock 데이터에는 stage 개념이 없어 확인요청은 항상 시작검수("검수확인중")로 본다.
    const mockReviewStage = inspectionStatuses.includes("admin_requested") ? ("start" as WorkInspectionStage) : undefined;

    return {
      work,
      displayStatus: getDisplayStatus(work.status),
      inspectionStatus: getInspectionAggregateStatus(inspectionStatuses),
      reviewStage: mockReviewStage,
      workType: workTypeOptions[index % workTypeOptions.length],
      productCode: workMaster?.code ?? "-",
      productName: workMaster?.name ?? "-",
      lot: getFallbackFinishedProductLot(work, index),
      quantity: 80 + index * 25,
      // mock 데이터에는 work_inspections.updated_at/works.completed_at이 없어 항상 미완료("-")로 표시된다.
      workStartedAt: undefined,
      completedAt: undefined
    };
  });
}

function mockData(departmentId: string, shipperId: string, warning?: string): WorkStatusDataResponse {
  return {
    source: "mock",
    warning,
    rows: mockRows(departmentId, shipperId)
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
    const masterData = await fetchWorkMasterData(supabase, scope.departmentId, scope.shipperId);
    const { data, error } = await supabase
      .from("works")
      .select("*")
      .eq("department_id", scope.departmentId)
      .eq("shipper_id", scope.shipperId)
      .order("work_date", { ascending: false });

    if (error) throw error;

    const works = ((data ?? []) as DbRow[]).map((row) => toWork(row));
    const workIds = works.map((work) => work.id);
    const inspectionRowsByWorkId = new Map<string, { status: InspectionStatus; updated_at?: string }[]>();
    const reviewStageByWorkId = new Map<string, WorkInspectionStage>();

    if (workIds.length > 0) {
      // "검수" 배지/작업시작 컬럼은 시작검수 전용 개념이라 완료검수(stage="complete") 행은 제외한다.
      const { data: inspectionRows, error: inspectionError } = await supabase
        .from("work_inspections")
        .select("work_id, status, updated_at")
        .eq("stage", "start")
        .in("work_id", workIds);

      if (inspectionError) throw inspectionError;

      for (const inspectionRow of (inspectionRows ?? []) as DbRow[]) {
        const workId = text(inspectionRow.work_id);
        const status = text(inspectionRow.status) as InspectionStatus;
        const updatedAt = text(inspectionRow.updated_at) || undefined;
        const list = inspectionRowsByWorkId.get(workId) ?? [];
        list.push({ status, updated_at: updatedAt });
        inspectionRowsByWorkId.set(workId, list);
      }

      // 확인요청 표시 단계: 위 조회는 시작검수 전용이라(검수 배지 정책) 완료검수까지 보려면 별도로 조회한다.
      // 처리 대기 중인 확인요청(work_inspections.status="admin_requested")이 걸린 stage를 작업별로 모은다.
      const { data: reviewRows, error: reviewError } = await supabase
        .from("work_inspections")
        .select("work_id, stage")
        .eq("status", "admin_requested")
        .in("work_id", workIds);

      if (reviewError) throw reviewError;

      for (const reviewRow of (reviewRows ?? []) as DbRow[]) {
        const workId = text(reviewRow.work_id);
        const stage: WorkInspectionStage = text(reviewRow.stage, "start") === "complete" ? "complete" : "start";
        // 두 단계에 모두 확인요청이 있으면 더 진행된 완료검수 기준("완료확인중")으로 표시한다.
        if (stage === "complete" || !reviewStageByWorkId.has(workId)) {
          reviewStageByWorkId.set(workId, stage);
        }
      }
    }

    const workMasterById = new Map(masterData.workMasters.map((workMaster) => [workMaster.id, workMaster]));
    const rows = works.map((work, index): WorkStatusRowDto => {
      const workMaster = workMasterById.get(work.work_master_id);
      const inspectionRows = inspectionRowsByWorkId.get(work.id) ?? [];

      return {
        work,
        displayStatus: getDisplayStatus(work.status),
        inspectionStatus: getInspectionAggregateStatus(inspectionRows.map((row) => row.status)),
        reviewStage: reviewStageByWorkId.get(work.id),
        workType: work.work_type ?? workTypeOptions[index % workTypeOptions.length],
        productCode: workMaster?.code ?? "-",
        productName: workMaster?.name ?? "-",
        lot: work.finished_product_lot ?? getFallbackFinishedProductLot(work, index),
        quantity: work.quantity ?? 80 + index * 25,
        workStartedAt: getInspectionCompletedAt(inspectionRows),
        completedAt: work.completed_at
      };
    });

    return NextResponse.json({ source: "supabase", rows } satisfies WorkStatusDataResponse);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Supabase 작업현황 조회에 실패했습니다.") }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as {
    workId?: string;
    status?: WorkStatus;
  };

  if (!body.workId || !body.status) {
    return NextResponse.json({ error: "workId와 status가 필요합니다." }, { status: 400 });
  }

  // 상태 모델: 대기(registered)/보류(on_hold)/취소(canceled)만 사용자가 수동으로 설정할 수 있다.
  // 진행(in_progress)/완료(passed·completed)는 검수 결과에 따라 시스템(maybeAdvanceWorkStatus)이 자동으로만
  // 전이시킨다(lib/server/work-auto-status.ts). 여기서 막아도 자동 전이 로직은 이 API를 거치지 않고
  // works 테이블을 직접 update하므로 영향받지 않는다.
  const manuallySettableStatuses: WorkStatus[] = ["registered", "on_hold", "canceled"];
  if (!manuallySettableStatuses.includes(body.status)) {
    return NextResponse.json(
      { error: "진행/완료 상태는 검수 결과에 따라 자동으로 반영됩니다. 대기/보류/취소만 수동으로 설정할 수 있습니다." },
      { status: 400 }
    );
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", workId: body.workId, status: body.status } satisfies UpdateWorkStatusResponse);
  }

  try {
    // 완료 그룹(passed/completed)으로 전환되면 completed_at을 기록하고, 그 외 상태로 되돌리면 초기화한다.
    // (이 API는 이제 완료 그룹으로의 수동 전환을 막으므로 사실상 항상 false지만, 자동 전이와 로직을
    // 통일해두기 위해 판정 함수는 그대로 둔다.)
    const isCompleteGroup = getDisplayStatus(body.status) === "complete";

    const { error } = await supabase
      .from("works")
      .update({
        status: body.status,
        latest_inspected_at: new Date().toISOString(),
        completed_at: isCompleteGroup ? new Date().toISOString() : null
      })
      .eq("id", body.workId);

    if (error) throw error;

    return NextResponse.json({ source: "supabase", workId: body.workId, status: body.status } satisfies UpdateWorkStatusResponse);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "작업상태 저장에 실패했습니다.") }, { status: 500 });
  }
}
