import { NextRequest, NextResponse } from "next/server";
import { issueToRenderableTemplate, toRenderableTemplate } from "@/lib/documents/layout-meta";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import {
  assertUuid,
  assertWorkInScope,
  guardErrorResponse,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromSearchParams
} from "@/lib/server/scope-guard";
import {
  buildMockPrintDto,
  buildWorkOrderPrintDto,
  countIssuesUpTo,
  loadIssueForWork,
  loadMappedTemplate,
  mockMappedTemplates,
  mockWorkInScope
} from "@/lib/server/work-order";
import { RouteError } from "@/lib/server/work-register-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WorkOrderPrintDataResponse } from "@/lib/types/document-template";

type RouteContext = {
  params: Promise<{
    workId: string;
  }>;
};

// #10 출력 데이터: issue_id가 있으면 출력 당시 양식 스냅샷, 없으면 template_id 양식(화주 매핑·활성 필수)으로 렌더 데이터를 만든다.
export async function GET(request: NextRequest, context: RouteContext) {
  const { workId } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const requestScope = scopeFromSearchParams(searchParams);
  if (!requestScope) return missingScopeResponse();

  const templateId = searchParams.get("template_id")?.trim() ?? "";
  const issueId = searchParams.get("issue_id")?.trim() ?? "";
  if (!templateId && !issueId) {
    return NextResponse.json({ error: "template_id 또는 issue_id가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  try {
    if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
      const { work, scope } = mockWorkInScope(workId, requestScope.departmentId, requestScope.shipperId);
      const mapped = mockMappedTemplates(scope).find((item) => item.template.id === templateId);
      if (!mapped) throw new RouteError("해당 화주에 등록되지 않은 양식입니다.", 409);
      const { template } = mapped;
      return NextResponse.json({
        source: "mock",
        template: { ...toRenderableTemplate(template), id: template.id },
        data: buildMockPrintDto(work, scope, {
          templateCode: template.code,
          templateName: template.name,
          revisionDate: template.revision_date
        })
      } satisfies WorkOrderPrintDataResponse);
    }

    assertUuid(workId, "작업 ID");
    if (templateId) assertUuid(templateId, "양식 ID");
    if (issueId) assertUuid(issueId, "출력 이력 ID");

    const scope = await resolveRequestScope(supabase, requestScope);
    const work = await assertWorkInScope(supabase, workId, scope);

    if (issueId) {
      const issue = await loadIssueForWork(supabase, workId, issueId);
      const data = await buildWorkOrderPrintDto(supabase, work, {
        templateCode: issue.template_code,
        templateName: issue.template_name,
        revisionDate: issue.revision_date,
        issueId: issue.id,
        issuedAt: issue.issued_at,
        issueSeq: await countIssuesUpTo(supabase, workId, issue.issued_at)
      });
      return NextResponse.json({
        source: "supabase",
        template: { ...issueToRenderableTemplate(issue), id: issue.template_id },
        data
      } satisfies WorkOrderPrintDataResponse);
    }

    const template = await loadMappedTemplate(supabase, scope, templateId);
    const data = await buildWorkOrderPrintDto(supabase, work, {
      templateCode: template.code,
      templateName: template.name,
      revisionDate: template.revision_date
    });
    return NextResponse.json({
      source: "supabase",
      template: { ...toRenderableTemplate(template), id: template.id },
      data
    } satisfies WorkOrderPrintDataResponse);
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "작업지시서 출력 데이터를 불러오지 못했습니다.") }, { status: 502 });
  }
}
