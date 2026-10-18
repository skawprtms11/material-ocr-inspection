import { NextRequest, NextResponse } from "next/server";
import { LAYOUT_META } from "@/lib/documents/layout-meta";
import { nextTemplateCode } from "@/lib/documents/template-code";
import { appRepository } from "@/lib/repositories/app-repository";
import { toMockScopeIds } from "@/lib/repositories/supabase-scope";
import {
  UNIQUE_TEMPLATE_MESSAGE,
  assertLayoutType,
  createTemplateSchema,
  fetchTemplateInDepartment,
  findNextTemplateCode,
  isForeignKeyViolation,
  isMockMode,
  isUniqueViolation,
  normalizeSettings,
  readJsonBody,
  routeErrorResponse,
  toMappingRow,
  toTemplate,
  validationMessage
} from "@/lib/server/document-templates";
import { assertUuid, resolveRequestScope } from "@/lib/server/scope-guard";
import { RouteError, text, type DbRow, type ServerSupabase } from "@/lib/server/work-register-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  CreateDocumentTemplateRequest,
  CreateDocumentTemplateResponse,
  DocumentTemplateListResponse
} from "@/lib/types/document-template";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("department_id")?.trim();
  const includeInactive = searchParams.get("include_inactive") === "true";

  if (!departmentId) return NextResponse.json({ error: "department_id가 필요합니다." }, { status: 400 });

  const supabase = createServerSupabaseClient();

  if (isMockMode(supabase)) {
    const mockDepartmentId = toMockScopeIds(departmentId, "").departmentId;
    const templates = appRepository
      .listDocumentTemplates({ departmentId: mockDepartmentId })
      .filter((template) => includeInactive || template.is_active)
      .map((template) => ({
        ...template,
        mappedShipperCount: appRepository.listShipperDocumentTemplates().filter((mapping) => mapping.template_id === template.id).length
      }));
    return NextResponse.json({ source: "mock", templates, layouts: LAYOUT_META } satisfies DocumentTemplateListResponse);
  }

  try {
    const scope = await resolveRequestScope(supabase!, { departmentId, shipperId: "" });
    assertUuid(scope.departmentId, "department_id");

    let query = supabase!
      .from("document_templates")
      .select("*")
      .eq("department_id", scope.departmentId)
      .eq("doc_kind", "work_order")
      .order("code", { ascending: true })
      .order("revision_date", { ascending: false });
    if (!includeInactive) query = query.eq("is_active", true);

    const { data, error } = await query;
    if (error) throw error;

    const templates = ((data ?? []) as DbRow[]).map(toTemplate);
    const counts = new Map<string, number>();
    if (templates.length > 0) {
      const { data: mappings, error: mappingError } = await supabase!
        .from("shipper_document_templates")
        .select("template_id")
        .in("template_id", templates.map((template) => template.id));
      if (mappingError) throw mappingError;
      for (const row of (mappings ?? []) as DbRow[]) {
        const templateId = text(row.template_id);
        counts.set(templateId, (counts.get(templateId) ?? 0) + 1);
      }
    }

    return NextResponse.json({
      source: "supabase",
      templates: templates.map((template) => ({ ...template, mappedShipperCount: counts.get(template.id) ?? 0 })),
      layouts: LAYOUT_META
    } satisfies DocumentTemplateListResponse);
  } catch (error) {
    return routeErrorResponse(error, "Supabase 문서양식 조회에 실패했습니다.");
  }
}

// 원본 양식의 화주 매핑을 새 양식으로 이어받는다. 화주당 기본은 1개뿐이라 원본 기본은 먼저 해제하고 새 양식을 기본으로 둔다.
async function inheritMappings(supabase: ServerSupabase, sourceTemplateId: string, newTemplateId: string) {
  const { data, error } = await supabase.from("shipper_document_templates").select("*").eq("template_id", sourceTemplateId);
  if (error) throw error;

  const source = ((data ?? []) as DbRow[]).map(toMappingRow);
  if (source.length === 0) return;

  const defaultIds = source.filter((mapping) => mapping.is_default).map((mapping) => mapping.id);
  const now = new Date().toISOString();
  const restoreDefaults = () =>
    defaultIds.length > 0
      ? supabase.from("shipper_document_templates").update({ is_default: true, updated_at: now }).in("id", defaultIds)
      : Promise.resolve({ error: null });

  if (defaultIds.length > 0) {
    const { error: releaseError } = await supabase
      .from("shipper_document_templates")
      .update({ is_default: false, updated_at: now })
      .in("id", defaultIds);
    if (releaseError) throw releaseError;
  }

  const { error: insertError } = await supabase.from("shipper_document_templates").insert(
    source.map((mapping) => ({
      shipper_id: mapping.shipper_id,
      template_id: newTemplateId,
      is_default: mapping.is_default,
      sort_order: mapping.sort_order
    }))
  );
  if (insertError) {
    await restoreDefaults();
    throw insertError;
  }
}

const MAX_NUMBERING_ATTEMPTS = 6;

/** 동시 채번 재시도 간격(시도 횟수에 비례 + 무작위 지터)만큼 대기한다. */
function numberingBackoff(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, attempt * 40 + Math.floor(Math.random() * 60)));
}
const NUMBERING_CONFLICT_MESSAGE = "문서코드 자동채번이 동시 등록과 충돌했습니다. 잠시 후 다시 시도해 주세요.";

async function isEarliestWithCode(supabase: ServerSupabase, departmentId: string, code: string, id: string) {
  const { data, error } = await supabase
    .from("document_templates")
    .select("id")
    .eq("department_id", departmentId)
    .eq("doc_kind", "work_order")
    .eq("code", code)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);
  if (error) throw error;
  const first = (data as DbRow[] | null)?.[0];
  return !first || text(first.id) === id;
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<Partial<CreateDocumentTemplateRequest> & { templateType?: unknown }>(request);
    const departmentId = typeof body.departmentId === "string" ? body.departmentId.trim() : "";
    if (!departmentId) throw new RouteError("departmentId가 필요합니다.", 400);
    assertLayoutType(body.templateType);

    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) throw new RouteError(validationMessage(parsed.error), 400);
    const input = parsed.data;
    const settings = normalizeSettings(input.layoutKey, input.settings);

    const supabase = createServerSupabaseClient();

    if (isMockMode(supabase)) {
      const now = new Date().toISOString();
      const mockCode =
        input.code ??
        nextTemplateCode(
          "layout",
          appRepository.listDocumentTemplates({ departmentId: toMockScopeIds(departmentId, "").departmentId }).map((template) => template.code)
        ).code;
      return NextResponse.json(
        {
          source: "mock",
          template: {
            id: `doctpl-mock-${Date.now()}`,
            department_id: departmentId,
            doc_kind: "work_order",
            code: mockCode,
            name: input.name,
            revision_date: input.revisionDate,
            template_type: "layout",
            layout_key: input.layoutKey,
            settings,
            schema_version: 1,
            is_active: input.isActive ?? true,
            memo: input.memo?.trim() || null,
            created_by: null,
            created_at: now,
            updated_at: now
          }
        } satisfies CreateDocumentTemplateResponse,
        { status: 201 }
      );
    }

    const scope = await resolveRequestScope(supabase!, { departmentId, shipperId: "" });
    assertUuid(scope.departmentId, "departmentId");
    if (input.inheritFromTemplateId) {
      assertUuid(input.inheritFromTemplateId, "inheritFromTemplateId");
      await fetchTemplateInDepartment(supabase!, input.inheritFromTemplateId, scope.departmentId);
    }

    // code가 없으면 새 문서로 보고 자동채번한다. 동시 등록 충돌은 23505 또는 사후 선착순 판정으로 재채번(최대 6회, 지터 대기).
    const autoNumber = !input.code;
    let created: DbRow | null = null;
    for (let attempt = 1; attempt <= MAX_NUMBERING_ATTEMPTS && !created; attempt += 1) {
      const code = input.code ?? (await findNextTemplateCode(supabase!, scope.departmentId, "layout"));
      const { data, error } = await supabase!
        .from("document_templates")
        .insert({
          department_id: scope.departmentId,
          doc_kind: "work_order",
          code,
          name: input.name,
          revision_date: input.revisionDate,
          template_type: "layout",
          layout_key: input.layoutKey,
          settings,
          schema_version: 1,
          is_active: input.isActive ?? true,
          memo: input.memo?.trim() || null
        })
        .select("*")
        .single();
      if (error) {
        if (isUniqueViolation(error)) {
          if (autoNumber && attempt < MAX_NUMBERING_ATTEMPTS) {
            await numberingBackoff(attempt);
            continue;
          }
          throw new RouteError(autoNumber ? NUMBERING_CONFLICT_MESSAGE : UNIQUE_TEMPLATE_MESSAGE, 409);
        }
        if (isForeignKeyViolation(error)) throw new RouteError("부서를 찾을 수 없습니다.", 400);
        throw error;
      }
      const row = data as DbRow;
      // 개정일자가 달라 유니크를 피한 동시 채번은 먼저 만들어진 행만 남긴다.
      if (autoNumber) {
        let earliest: boolean;
        try {
          earliest = await isEarliestWithCode(supabase!, scope.departmentId, code, text(row.id));
        } catch (checkError) {
          // 선착순 판정 조회가 실패하면 방금 만든 행을 남기지 않는다.
          await supabase!.from("document_templates").delete().eq("id", text(row.id));
          throw checkError;
        }
        if (!earliest) {
          const { error: deleteError } = await supabase!.from("document_templates").delete().eq("id", text(row.id));
          if (deleteError) throw deleteError;
          if (attempt >= MAX_NUMBERING_ATTEMPTS) throw new RouteError(NUMBERING_CONFLICT_MESSAGE, 409);
          await numberingBackoff(attempt);
          continue;
        }
      }
      created = row;
    }
    if (!created) throw new RouteError(NUMBERING_CONFLICT_MESSAGE, 409);

    const template = toTemplate(created);

    if (input.inheritFromTemplateId) {
      try {
        await inheritMappings(supabase!, input.inheritFromTemplateId, template.id);
      } catch (inheritError) {
        await supabase!.from("document_templates").delete().eq("id", template.id);
        throw inheritError;
      }
    }

    return NextResponse.json({ source: "supabase", template } satisfies CreateDocumentTemplateResponse, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, "문서양식 등록에 실패했습니다.");
  }
}
