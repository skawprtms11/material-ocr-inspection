import { NextRequest, NextResponse } from "next/server";
import { resolveSettings } from "@/lib/documents/layout-meta";
import {
  UNIQUE_TEMPLATE_MESSAGE,
  fetchTemplateInDepartment,
  isForeignKeyViolation,
  isMockMode,
  isUniqueViolation,
  normalizeSettings,
  readJsonBody,
  routeErrorResponse,
  toTemplate,
  updateTemplateSchema,
  validationMessage
} from "@/lib/server/document-templates";
import { assertUuid, resolveRequestScope } from "@/lib/server/scope-guard";
import { RouteError, type DbRow } from "@/lib/server/work-register-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  DeleteDocumentTemplateResponse,
  DocumentTemplate,
  UpdateDocumentTemplateRequest,
  UpdateDocumentTemplateResponse
} from "@/lib/types/document-template";

type RouteContext = { params: Promise<{ templateId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { templateId } = await context.params;
    const body = await readJsonBody<Partial<UpdateDocumentTemplateRequest> & { templateType?: unknown }>(request);
    const departmentId = typeof body.departmentId === "string" ? body.departmentId.trim() : "";
    if (!departmentId) throw new RouteError("departmentId가 필요합니다.", 400);
    if (body.templateType !== undefined && body.templateType !== "layout") {
      throw new RouteError("양식 종류(templateType)는 변경할 수 없습니다.", 400);
    }

    const parsed = updateTemplateSchema.safeParse(body);
    if (!parsed.success) throw new RouteError(validationMessage(parsed.error), 400);
    const input = parsed.data;
    if (Object.keys(input).length === 0) throw new RouteError("수정할 항목이 없습니다.", 400);

    const supabase = createServerSupabaseClient();

    if (isMockMode(supabase)) {
      const now = new Date().toISOString();
      const layoutKey = input.layoutKey ?? "standard";
      return NextResponse.json({
        source: "mock",
        template: {
          id: templateId,
          department_id: departmentId,
          doc_kind: "work_order",
          code: input.code ?? "",
          name: input.name ?? "",
          revision_date: input.revisionDate ?? "",
          template_type: "layout",
          layout_key: layoutKey,
          settings: input.settings ? normalizeSettings(layoutKey, input.settings) : {},
          schema_version: 1,
          is_active: input.isActive ?? true,
          memo: input.memo?.trim() || null,
          created_by: null,
          created_at: now,
          updated_at: now
        } satisfies DocumentTemplate
      } satisfies UpdateDocumentTemplateResponse);
    }

    assertUuid(templateId, "templateId");
    const scope = await resolveRequestScope(supabase!, { departmentId, shipperId: "" });
    assertUuid(scope.departmentId, "departmentId");
    const current = await fetchTemplateInDepartment(supabase!, templateId, scope.departmentId);
    if (current.template_type !== "layout") throw new RouteError("편집형·파일형 양식은 준비 중입니다.", 400);

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.code !== undefined) update.code = input.code;
    if (input.name !== undefined) update.name = input.name;
    if (input.revisionDate !== undefined) update.revision_date = input.revisionDate;
    if (input.isActive !== undefined) update.is_active = input.isActive;
    if (input.memo !== undefined) update.memo = input.memo.trim() || null;

    const nextLayoutKey = input.layoutKey ?? current.layout_key;
    if (input.layoutKey !== undefined) update.layout_key = input.layoutKey;
    if (nextLayoutKey && (input.settings || input.layoutKey)) {
      const base = input.settings ?? resolveSettings(nextLayoutKey, current.settings);
      update.settings = normalizeSettings(nextLayoutKey, base);
    }

    const { data, error } = await supabase!.from("document_templates").update(update).eq("id", templateId).select("*").single();
    if (error) {
      if (isUniqueViolation(error)) throw new RouteError(UNIQUE_TEMPLATE_MESSAGE, 409);
      throw error;
    }

    return NextResponse.json({ source: "supabase", template: toTemplate(data as DbRow) } satisfies UpdateDocumentTemplateResponse);
  } catch (error) {
    return routeErrorResponse(error, "문서양식 수정에 실패했습니다.");
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { templateId } = await context.params;
    const departmentId = new URL(request.url).searchParams.get("department_id")?.trim();
    if (!departmentId) throw new RouteError("department_id가 필요합니다.", 400);

    const supabase = createServerSupabaseClient();

    if (isMockMode(supabase)) {
      return NextResponse.json({ source: "mock", deletedId: templateId } satisfies DeleteDocumentTemplateResponse);
    }

    assertUuid(templateId, "templateId");
    const scope = await resolveRequestScope(supabase!, { departmentId, shipperId: "" });
    assertUuid(scope.departmentId, "department_id");
    await fetchTemplateInDepartment(supabase!, templateId, scope.departmentId);

    // 이력 FK는 SET NULL이라 DB가 막지 않으므로 매핑·이력을 사전 조회해 삭제를 거부한다.
    const [mappings, issues] = await Promise.all([
      supabase!.from("shipper_document_templates").select("id", { count: "exact", head: true }).eq("template_id", templateId),
      supabase!.from("work_order_issues").select("id", { count: "exact", head: true }).eq("template_id", templateId)
    ]);
    if (mappings.error) throw mappings.error;
    if (issues.error) throw issues.error;
    if ((mappings.count ?? 0) > 0) throw new RouteError("화주에 매핑된 양식은 삭제할 수 없습니다. 사용중지로 전환해 주세요.", 409);
    if ((issues.count ?? 0) > 0) throw new RouteError("출력 이력이 있는 양식은 삭제할 수 없습니다. 사용중지로 전환해 주세요.", 409);

    const { error } = await supabase!.from("document_templates").delete().eq("id", templateId);
    if (error) {
      if (isForeignKeyViolation(error)) throw new RouteError("사용 중인 양식은 삭제할 수 없습니다. 사용중지로 전환해 주세요.", 409);
      throw error;
    }

    return NextResponse.json({ source: "supabase", deletedId: templateId } satisfies DeleteDocumentTemplateResponse);
  } catch (error) {
    return routeErrorResponse(error, "문서양식 삭제에 실패했습니다.");
  }
}
