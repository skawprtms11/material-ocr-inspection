import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
import { reconcileInspectionPlan } from "@/lib/server/inspection-setup";
import { assertWorkInScope } from "@/lib/server/scope-guard";
import {
  EDIT_LOCKED_REASON,
  RouteError,
  fetchComponentsByWorkIds,
  fetchScopedWorkMaster,
  inspectionEditLockReason,
  makePendingWork,
  prepareOcrComponentRows,
  replaceWorkComponents,
  text,
  validateRegistrationBody,
  type DbRow
} from "@/lib/server/work-register-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CreateWorkRegistrationRequest, CreateWorkRegistrationResponse, WorkComponentRowDto } from "@/lib/types/work-register-api";

type RouteContext = {
  params: Promise<{
    workId: string;
  }>;
};

// 작업 수정: 검수 시작 전(status=registered + 모든 검수행 pending) 작업만 허용한다.
export async function PATCH(request: NextRequest, context: RouteContext) {
  const { workId } = await context.params;
  const body = (await request.json()) as CreateWorkRegistrationRequest;
  const supabase = createServerSupabaseClient();
  const isMock = !supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

  const validationError = validateRegistrationBody(body, !isMock);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  if (!supabase || isMock) {
    let mockComponentRows: WorkComponentRowDto[];
    try {
      mockComponentRows = await prepareOcrComponentRows(null, body, body.workMasterId, body.componentRows);
    } catch (error) {
      return NextResponse.json({ error: errorMessage(error, "OCR 검수 텍스트 검증에 실패했습니다.") }, { status: error instanceof RouteError ? error.status : 400 });
    }
    const workMaster = appRepository.listWorkMasters({ departmentId: body.departmentId, shipperId: body.shipperId }).find((item) => item.id === body.workMasterId);
    const response: CreateWorkRegistrationResponse = {
      source: "mock",
      work: {
        id: workId,
        registeredAt: new Date().toISOString().slice(0, 10),
        workMasterId: body.workMasterId,
        workType: body.workType,
        documentNo: body.documentNo,
        finishedProductCode: workMaster?.code ?? "-",
        finishedProductName: workMaster?.name ?? "-",
        finishedProductLot: body.finishedProductLot,
        quantity: body.quantity,
        dueDate: body.dueDate,
        memo: body.memo,
        componentRows: mockComponentRows
      }
    };
    return NextResponse.json(response);
  }

  let restoreComponents: (() => Promise<void>) | null = null;

  try {
    const scope = await resolveScopeIds(supabase, body.departmentId, body.shipperId);

    const current = await assertWorkInScope(supabase, workId, scope);

    const { data: inspectionData, error: inspectionError } = await supabase
      .from("work_inspections")
      .select("status, stage, attempt_count")
      .eq("work_id", workId);
    if (inspectionError) throw inspectionError;

    const inspections = (inspectionData ?? []) as DbRow[];
    if (text(current.status) !== "registered") throw new RouteError(EDIT_LOCKED_REASON, 409);
    const lockReason = inspectionEditLockReason(inspections);
    if (lockReason) throw new RouteError(lockReason, 409);

    const workMaster = await fetchScopedWorkMaster(supabase, body.workMasterId, scope);
    const componentRows = await prepareOcrComponentRows(supabase, scope, body.workMasterId, body.componentRows);

    const replaced = await replaceWorkComponents(supabase, workId, componentRows);
    restoreComponents = replaced?.restore ?? null;

    // status=registered 조건을 함께 걸어 그 사이 상태가 바뀐 작업은 갱신되지 않게 한다
    const { data: updatedData, error: updateError } = await supabase
      .from("works")
      .update({
        work_master_id: body.workMasterId,
        document_no: body.documentNo,
        work_type: body.workType,
        quantity: body.quantity,
        due_date: body.dueDate,
        finished_product_lot: body.finishedProductLot,
        memo: body.memo
      })
      .eq("id", workId)
      .eq("status", "registered")
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updatedData) throw new RouteError(EDIT_LOCKED_REASON, 409);
    restoreComponents = null;

    // 검수행은 (부자재 × 검수방식) + 제품 구성 행별 사진검수 단위다. 작업마스터가 바뀌면 pending 행을 모두 지우고 새로 만들고,
    // 같은 마스터면 reconcile이 제품 구성 변경분(추가·삭제)과 부자재 방식 변경분을 pending 행에 한해 반영한다.
    // (수정은 모든 검수행이 pending일 때만 허용되므로 지워도 제출 이력·사진이 없다.)
    const masterChanged = text(current.work_master_id) !== body.workMasterId;
    if (masterChanged) {
      const { error: deleteError } = await supabase.from("work_inspections").delete().eq("work_id", workId).eq("status", "pending");
      if (deleteError) throw new RouteError(`작업은 수정되었으나 검수행 재생성에 실패했습니다: ${deleteError.message}`, 502);
    }
    const inspectionSetup = await reconcileInspectionPlan(supabase, workId, body.workMasterId);
    // 수정 내용은 이미 저장된 상태이므로 롤백하지 않고, 같은 내용으로 재저장하면 검수행 생성이 재시도된다
    if (inspectionSetup === "failed") {
      throw new RouteError("작업 수정은 저장되었으나 검수 행 생성에 실패했습니다. 다시 저장해 주세요.", 502);
    }

    const componentsByWork = await fetchComponentsByWorkIds(supabase, [workId]);
    const response: CreateWorkRegistrationResponse = {
      source: "supabase",
      inspectionSetup,
      work: makePendingWork(updatedData as DbRow, workMaster, componentsByWork[workId])
    };

    return NextResponse.json(response);
  } catch (error) {
    if (restoreComponents) {
      try {
        await restoreComponents();
      } catch (restoreError) {
        return NextResponse.json({ error: errorMessage(restoreError, "구성품 복원에 실패했습니다.") }, { status: 502 });
      }
    }
    const status = error instanceof RouteError ? error.status : 502;
    return NextResponse.json({ error: errorMessage(error, "작업 수정 저장에 실패했습니다.") }, { status });
  }
}
