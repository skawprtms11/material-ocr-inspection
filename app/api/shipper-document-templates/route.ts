import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { toMockScopeIds } from "@/lib/repositories/supabase-scope";
import {
  fetchTemplateInDepartment,
  isMockMode,
  isUniqueViolation,
  readJsonBody,
  routeErrorResponse,
  toMappingRow,
  toTemplate
} from "@/lib/server/document-templates";
import {
  assertShipperInDepartment,
  assertUuid,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromBody,
  scopeFromSearchParams
} from "@/lib/server/scope-guard";
import { RouteError, type DbRow } from "@/lib/server/work-register-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  CreateShipperDocumentMappingRequest,
  CreateShipperDocumentMappingResponse,
  DocumentTemplate,
  ShipperDocumentMappingDto,
  ShipperDocumentTemplateListResponse
} from "@/lib/types/document-template";

export async function GET(request: NextRequest) {
  const requested = scopeFromSearchParams(new URL(request.url).searchParams);
  if (!requested) return missingScopeResponse();

  const supabase = createServerSupabaseClient();

  if (isMockMode(supabase)) {
    const mock = toMockScopeIds(requested.departmentId, requested.shipperId);
    const templates = appRepository.listDocumentTemplates({ departmentId: mock.departmentId });
    const mappings = appRepository
      .listShipperDocumentTemplates(mock.shipperId)
      .flatMap((mapping) => {
        const template = templates.find((item) => item.id === mapping.template_id);
        return template ? [{ ...mapping, template }] : [];
      })
      .sort((a, b) => a.sort_order - b.sort_order);
    const mappedIds = new Set(mappings.map((mapping) => mapping.template_id));
    return NextResponse.json({
      source: "mock",
      mappings,
      candidates: templates.filter((template) => template.is_active && !mappedIds.has(template.id))
    } satisfies ShipperDocumentTemplateListResponse);
  }

  try {
    const scope = await resolveRequestScope(supabase!, requested);
    assertUuid(scope.departmentId, "department_id");
    assertUuid(scope.shipperId, "shipper_id");
    await assertShipperInDepartment(supabase!, scope.shipperId, scope.departmentId);

    const [mappingResult, templateResult] = await Promise.all([
      supabase!
        .from("shipper_document_templates")
        .select("*")
        .eq("shipper_id", scope.shipperId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase!
        .from("document_templates")
        .select("*")
        .eq("department_id", scope.departmentId)
        .eq("doc_kind", "work_order")
        .order("code", { ascending: true })
        .order("revision_date", { ascending: false })
    ]);
    if (mappingResult.error) throw mappingResult.error;
    if (templateResult.error) throw templateResult.error;

    const templates = ((templateResult.data ?? []) as DbRow[]).map(toTemplate);
    const templateById = new Map(templates.map((template) => [template.id, template]));
    const mappings: ShipperDocumentMappingDto[] = [];
    for (const row of (mappingResult.data ?? []) as DbRow[]) {
      const mapping = toMappingRow(row);
      const template = templateById.get(mapping.template_id);
      if (template) mappings.push({ ...mapping, template });
    }
    const mappedIds = new Set(mappings.map((mapping) => mapping.template_id));

    return NextResponse.json({
      source: "supabase",
      mappings,
      candidates: templates.filter((template) => template.is_active && !mappedIds.has(template.id))
    } satisfies ShipperDocumentTemplateListResponse);
  } catch (error) {
    return routeErrorResponse(error, "Supabase 화주별 문서양식 조회에 실패했습니다.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBody<Partial<CreateShipperDocumentMappingRequest>>(request);
    const requested = scopeFromBody(body);
    if (!requested) return missingScopeResponse();
    const templateId = typeof body.templateId === "string" ? body.templateId.trim() : "";
    if (!templateId) throw new RouteError("templateId가 필요합니다.", 400);
    if (body.isDefault !== undefined && typeof body.isDefault !== "boolean") throw new RouteError("isDefault가 올바르지 않습니다.", 400);

    const supabase = createServerSupabaseClient();

    if (isMockMode(supabase)) {
      const mock = toMockScopeIds(requested.departmentId, requested.shipperId);
      const template = appRepository.listDocumentTemplates({}).find((item) => item.id === templateId);
      const now = new Date().toISOString();
      const mapping: ShipperDocumentMappingDto = {
        id: `shipdoc-mock-${Date.now()}`,
        shipper_id: mock.shipperId,
        template_id: templateId,
        is_default: body.isDefault === true,
        sort_order: 0,
        created_at: now,
        updated_at: now,
        template: template ?? ({ id: templateId } as DocumentTemplate)
      };
      return NextResponse.json({ source: "mock", mapping } satisfies CreateShipperDocumentMappingResponse, { status: 201 });
    }

    assertUuid(templateId, "templateId");
    const scope = await resolveRequestScope(supabase!, requested);
    assertUuid(scope.departmentId, "departmentId");
    assertUuid(scope.shipperId, "shipperId");
    await assertShipperInDepartment(supabase!, scope.shipperId, scope.departmentId);
    const template = await fetchTemplateInDepartment(supabase!, templateId, scope.departmentId);
    if (!template.is_active) throw new RouteError("사용중지된 양식은 화주에 추가할 수 없습니다.", 409);
    if (template.template_type !== "layout") throw new RouteError("편집형·파일형 양식은 준비 중입니다.", 400);

    const { data: existing, error: existingError } = await supabase!
      .from("shipper_document_templates")
      .select("*")
      .eq("shipper_id", scope.shipperId);
    if (existingError) throw existingError;
    const rows = ((existing ?? []) as DbRow[]).map(toMappingRow);
    if (rows.some((row) => row.template_id === templateId)) throw new RouteError("이미 화주에 매핑된 양식입니다.", 409);

    // 첫 양식은 자동으로 기본 지정, 이후는 isDefault 요청 시에만 기본 전환(기존 기본 해제 → 신규 지정).
    const makeDefault = body.isDefault === true || rows.length === 0;
    const previousDefault = makeDefault ? rows.find((row) => row.is_default) : undefined;
    if (previousDefault) {
      const { error } = await supabase!
        .from("shipper_document_templates")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("id", previousDefault.id);
      if (error) throw error;
    }

    const { data, error } = await supabase!
      .from("shipper_document_templates")
      .insert({
        shipper_id: scope.shipperId,
        template_id: templateId,
        is_default: makeDefault,
        sort_order: rows.reduce((max, row) => Math.max(max, row.sort_order), 0) + 1
      })
      .select("*")
      .single();
    if (error) {
      if (previousDefault) {
        await supabase!
          .from("shipper_document_templates")
          .update({ is_default: true, updated_at: new Date().toISOString() })
          .eq("id", previousDefault.id);
      }
      if (isUniqueViolation(error)) throw new RouteError("이미 화주에 매핑된 양식입니다.", 409);
      throw error;
    }

    const mapping: ShipperDocumentMappingDto = { ...toMappingRow(data as DbRow), template };
    return NextResponse.json({ source: "supabase", mapping } satisfies CreateShipperDocumentMappingResponse, { status: 201 });
  } catch (error) {
    return routeErrorResponse(error, "화주별 문서양식 추가에 실패했습니다.");
  }
}

