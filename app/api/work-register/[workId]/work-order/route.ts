import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { setupWorkInspections } from "@/lib/server/inspection-setup";
import {
  assertUuid,
  assertWorkInScope,
  guardErrorResponse,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromBody,
  scopeFromSearchParams
} from "@/lib/server/scope-guard";
import {
  listMappedTemplates,
  listRecentIssues,
  loadMappedTemplate,
  mockMappedTemplates,
  mockWorkInScope
} from "@/lib/server/work-order";
import { RouteError, text } from "@/lib/server/work-register-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  IssueWorkOrderRequest,
  IssueWorkOrderResponse,
  WorkOrderOptionsResponse
} from "@/lib/types/document-template";

type RouteContext = {
  params: Promise<{
    workId: string;
  }>;
};

const isMockMode = (supabase: ReturnType<typeof createServerSupabaseClient>) =>
  !supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false";

// #9 작업지시서 팝업 옵션: 작업 화주에 매핑된 활성 양식 + 최근 출력 이력
export async function GET(request: NextRequest, context: RouteContext) {
  const { workId } = await context.params;
  const requestScope = scopeFromSearchParams(new URL(request.url).searchParams);
  if (!requestScope) return missingScopeResponse();

  const supabase = createServerSupabaseClient();

  try {
    if (!supabase || isMockMode(supabase)) {
      const { work, scope } = mockWorkInScope(workId, requestScope.departmentId, requestScope.shipperId);
      return NextResponse.json({
        source: "mock",
        work: { id: work.id, documentNo: work.document_no, status: work.status, assignedAt: null },
        templates: mockMappedTemplates(scope),
        issues: []
      } satisfies WorkOrderOptionsResponse);
    }

    assertUuid(workId, "작업 ID");
    const scope = await resolveRequestScope(supabase, requestScope);
    const work = await assertWorkInScope(supabase, workId, scope);

    const [templates, issues] = await Promise.all([listMappedTemplates(supabase, scope), listRecentIssues(supabase, workId)]);

    return NextResponse.json({
      source: "supabase",
      work: {
        id: workId,
        documentNo: text(work.document_no),
        status: text(work.status),
        assignedAt: typeof work.assigned_at === "string" ? work.assigned_at : null
      },
      templates,
      issues
    } satisfies WorkOrderOptionsResponse);
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "작업지시서 정보를 불러오지 못했습니다.") }, { status: 502 });
  }
}

function buildPrintUrl(workId: string, body: IssueWorkOrderRequest, issueId: string) {
  const params = new URLSearchParams({
    department_id: body.departmentId,
    shipper_id: body.shipperId,
    template_id: body.templateId,
    issue_id: issueId,
    autoprint: "1"
  });
  return `/print/work-order/${workId}?${params.toString()}`;
}

// #11 출력: (미배정이면) 작업자 없이 자동 배정 → 검수행 멱등 생성 → 이력 INSERT. 중간 실패는 배정 원복 후 502.
export async function POST(request: NextRequest, context: RouteContext) {
  const { workId } = await context.params;
  const body = (await request.json().catch(() => null)) as IssueWorkOrderRequest | null;
  const requestScope = scopeFromBody(body);
  if (!body || !requestScope) return missingScopeResponse();
  if (typeof body.templateId !== "string" || !body.templateId.trim()) {
    return NextResponse.json({ error: "templateId가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || isMockMode(supabase)) {
    try {
      const { work } = mockWorkInScope(workId, requestScope.departmentId, requestScope.shipperId);
      // mock에는 assigned_at이 없어 미배정(registered)만 최초 출력·배정으로 본다. 이미 진행 중인 작업은 재출력이다.
      const assigned = work.status === "registered";
      const issuedAt = new Date().toISOString();
      const issueId = `mock-issue-${Date.now()}`;
      return NextResponse.json({
        source: "mock",
        workId,
        assigned,
        assignedAt: assigned ? issuedAt : null,
        issue: { id: issueId, issuedAt, issueKind: assigned ? "initial" : "reprint", seq: 1 },
        printUrl: buildPrintUrl(workId, body, issueId)
      } satisfies IssueWorkOrderResponse);
    } catch (error) {
      const guardResponse = guardErrorResponse(error);
      if (guardResponse) return guardResponse;
      return NextResponse.json({ error: errorMessage(error, "작업지시서 출력에 실패했습니다.") }, { status: 502 });
    }
  }

  let assignedAt: string | null = null;
  const revertAssignment = async () => {
    if (!assignedAt) return "";
    const { error } = await supabase.from("works").update({ assigned_at: null }).eq("id", workId).eq("assigned_at", assignedAt);
    return error ? ` (배정 되돌리기 실패: ${error.message})` : "";
  };

  try {
    assertUuid(workId, "작업 ID");
    assertUuid(body.templateId, "양식 ID");
    const scope = await resolveRequestScope(supabase, requestScope);
    const work = await assertWorkInScope(supabase, workId, scope);
    if (text(work.status) === "canceled") throw new RouteError("취소된 작업은 작업지시서를 출력할 수 없습니다.", 409);

    const template = await loadMappedTemplate(supabase, scope, body.templateId);

    // 작업자 지정 없이 배정 시각만 기록한다. status·worker_name·assigned_to는 건드리지 않는다.
    if (!work.assigned_at) {
      const claimedAt = new Date().toISOString();
      const { data: claimed, error: claimError } = await supabase
        .from("works")
        .update({ assigned_at: claimedAt })
        .eq("id", workId)
        .is("assigned_at", null)
        .select("id");
      if (claimError) throw claimError;
      if ((claimed ?? []).length > 0) assignedAt = claimedAt;
    }

    const assigned = assignedAt !== null;
    let inspectionSetup: IssueWorkOrderResponse["inspectionSetup"];

    if (assigned) {
      inspectionSetup = await setupWorkInspections(supabase, workId, typeof work.work_master_id === "string" ? work.work_master_id : null);
      if (inspectionSetup === "failed") {
        const suffix = await revertAssignment();
        return NextResponse.json({ error: `검수 행 생성에 실패해 출력을 취소했습니다.${suffix}` }, { status: 502 });
      }
    }

    const { count: priorIssues, error: priorError } = await supabase
      .from("work_order_issues")
      .select("id", { count: "exact", head: true })
      .eq("work_id", workId);
    if (priorError) {
      const suffix = await revertAssignment();
      return NextResponse.json({ error: `${errorMessage(priorError, "출력 이력 조회에 실패했습니다.")}${suffix}` }, { status: 502 });
    }

    const { data: issueRow, error: issueError } = await supabase
      .from("work_order_issues")
      .insert({
        work_id: workId,
        department_id: scope.departmentId,
        shipper_id: scope.shipperId,
        template_id: template.id,
        template_code: template.code,
        template_name: template.name,
        revision_date: template.revision_date,
        template_type: template.template_type,
        layout_key: template.layout_key,
        settings_snapshot: template.settings,
        issue_kind: assigned || (priorIssues ?? 0) === 0 ? "initial" : "reprint",
        assigned_on_issue: assigned
      })
      .select("id, issue_kind, issued_at")
      .single();

    if (issueError || !issueRow) {
      const suffix = await revertAssignment();
      return NextResponse.json(
        { error: `${errorMessage(issueError, "출력 이력 저장에 실패했습니다.")}${suffix}` },
        { status: 502 }
      );
    }

    const issuedAt = text(issueRow.issued_at);
    const seq = (priorIssues ?? 0) + 1;

    return NextResponse.json({
      source: "supabase",
      workId,
      assigned,
      assignedAt: assignedAt ?? (typeof work.assigned_at === "string" ? work.assigned_at : null),
      inspectionSetup,
      issue: { id: text(issueRow.id), issuedAt, issueKind: issueRow.issue_kind === "reprint" ? "reprint" : "initial", seq },
      printUrl: buildPrintUrl(workId, body, text(issueRow.id))
    } satisfies IssueWorkOrderResponse);
  } catch (error) {
    const suffix = await revertAssignment();
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: `${errorMessage(error, "작업지시서 출력에 실패했습니다.")}${suffix}` }, { status: 502 });
  }
}
