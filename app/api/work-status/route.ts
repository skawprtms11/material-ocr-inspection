import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import { fetchWorkMasterData } from "@/lib/repositories/work-master-supabase-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Work, WorkStatus } from "@/lib/types/domain";
import type { DisplayWorkStatusDto, UpdateWorkStatusResponse, WorkStatusDataResponse, WorkStatusRowDto } from "@/lib/types/work-status-api";

type DbRow = Record<string, unknown>;

const workTypeOptions = ["리드레싱", "세트작업", "해체작업", "기타작업"];

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function getDisplayStatus(status: WorkStatus): DisplayWorkStatusDto {
  if (status === "registered") return "waiting";
  if (status === "in_progress") return "progress";
  if (status === "on_hold" || status === "inspection_failed" || status === "admin_review_requested") return "hold";
  if (status === "canceled") return "cancel";
  return "complete";
}

function getFallbackFinishedProductLot(work: Work, index: number) {
  return `LOT-${work.work_date.replaceAll("-", "").slice(2)}-${String(index + 1).padStart(2, "0")}`;
}

function toWork(row: DbRow): Work & { work_type?: string; quantity?: number; finished_product_lot?: string } {
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
    finished_product_lot: text(row.finished_product_lot) || undefined
  };
}

function mockRows(departmentId: string, shipperId: string): WorkStatusRowDto[] {
  const works = appRepository.listWorks({ departmentId, shipperId });
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });

  return works.map((work, index) => {
    const workMaster = workMasters.find((item) => item.id === work.work_master_id);

    return {
      work,
      displayStatus: getDisplayStatus(work.status),
      workType: workTypeOptions[index % workTypeOptions.length],
      productCode: workMaster?.code ?? "-",
      productName: workMaster?.name ?? "-",
      lot: getFallbackFinishedProductLot(work, index),
      quantity: 80 + index * 25
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

    const workMasterById = new Map(masterData.workMasters.map((workMaster) => [workMaster.id, workMaster]));
    const rows = ((data ?? []) as DbRow[]).map((row, index): WorkStatusRowDto => {
      const work = toWork(row);
      const workMaster = workMasterById.get(work.work_master_id);

      return {
        work,
        displayStatus: getDisplayStatus(work.status),
        workType: work.work_type ?? workTypeOptions[index % workTypeOptions.length],
        productCode: workMaster?.code ?? "-",
        productName: workMaster?.name ?? "-",
        lot: work.finished_product_lot ?? getFallbackFinishedProductLot(work, index),
        quantity: work.quantity ?? 80 + index * 25
      };
    });

    return NextResponse.json({ source: "supabase", rows } satisfies WorkStatusDataResponse);
  } catch (error) {
    return NextResponse.json(mockData(departmentId, shipperId, errorMessage(error, "Supabase 작업현황 조회에 실패했습니다.")));
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

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", workId: body.workId, status: body.status } satisfies UpdateWorkStatusResponse);
  }

  try {
    const { error } = await supabase
      .from("works")
      .update({
        status: body.status,
        latest_inspected_at: new Date().toISOString()
      })
      .eq("id", body.workId);

    if (error) throw error;

    return NextResponse.json({ source: "supabase", workId: body.workId, status: body.status } satisfies UpdateWorkStatusResponse);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "작업상태 저장에 실패했습니다.") }, { status: 500 });
  }
}
