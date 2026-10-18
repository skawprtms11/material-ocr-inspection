import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { isMockMode, readJsonBody, routeErrorResponse, toMappingRow, toTemplate } from "@/lib/server/document-templates";
import {
  assertShipperInDepartment,
  assertUuid,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromBody,
  scopeFromSearchParams,
  type RequestScope
} from "@/lib/server/scope-guard";
import { RouteError, text, type DbRow, type ServerSupabase } from "@/lib/server/work-register-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  DeleteShipperDocumentMappingResponse,
  DocumentTemplate,
  ShipperDocumentMappingDto,
  UpdateShipperDocumentMappingRequest,
  UpdateShipperDocumentMappingResponse
} from "@/lib/types/document-template";

type RouteContext = { params: Promise<{ mappingId: string }> };

// 매핑 존재(404)·요청 화주 일치(403)·화주의 부서 소속을 대조한다.
async function loadMappingInScope(supabase: ServerSupabase, mappingId: string, requested: RequestScope) {
  assertUuid(mappingId, "mappingId");
  const scope = await resolveRequestScope(supabase, requested);
  assertUuid(scope.departmentId, "departmentId");
  assertUuid(scope.shipperId, "shipperId");
  await assertShipperInDepartment(supabase, scope.shipperId, scope.departmentId);

  const { data, error } = await supabase.from("shipper_document_templates").select("*").eq("id", mappingId).maybeSingle();
  if (error) throw error;
  if (!data) throw new RouteError("화주 양식 매핑을 찾을 수 없습니다.", 404);
  const mapping = toMappingRow(data as DbRow);
  if (mapping.shipper_id !== scope.shipperId) throw new RouteError("선택한 화주에 속하지 않는 매핑입니다.", 403);
  return mapping;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { mappingId } = await context.params;
    const body = await readJsonBody<Partial<UpdateShipperDocumentMappingRequest>>(request);
    const requested = scopeFromBody(body);
    if (!requested) return missingScopeResponse();

    if (body.isDefault !== undefined && typeof body.isDefault !== "boolean") throw new RouteError("isDefault가 올바르지 않습니다.", 400);
    if (body.sortOrder !== undefined && (!Number.isInteger(body.sortOrder) || body.sortOrder < 0 || body.sortOrder > 9999)) {
      throw new RouteError("sortOrder는 0~9999 정수여야 합니다.", 400);
    }
    if (body.isDefault === undefined && body.sortOrder === undefined) throw new RouteError("수정할 항목이 없습니다.", 400);

    const supabase = createServerSupabaseClient();

    if (isMockMode(supabase)) {
      const mock = appRepository.listShipperDocumentTemplates().find((item) => item.id === mappingId);
      const now = new Date().toISOString();
      const mapping: ShipperDocumentMappingDto = {
        id: mappingId,
        shipper_id: mock?.shipper_id ?? requested.shipperId,
        template_id: mock?.template_id ?? "",
        is_default: body.isDefault ?? mock?.is_default ?? false,
        sort_order: body.sortOrder ?? mock?.sort_order ?? 0,
        created_at: mock?.created_at ?? now,
        updated_at: now,
        template: appRepository.listDocumentTemplates({}).find((item) => item.id === mock?.template_id) ?? ({} as DocumentTemplate)
      };
      return NextResponse.json({ source: "mock", mapping } satisfies UpdateShipperDocumentMappingResponse);
    }

    const current = await loadMappingInScope(supabase!, mappingId, requested);
    if (body.isDefault === false && current.is_default) {
      throw new RouteError("기본 양식은 해제할 수 없습니다. 다른 양식을 기본으로 지정해 주세요.", 409);
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };
    if (body.sortOrder !== undefined) update.sort_order = body.sortOrder;

    // 화주당 기본 1개(부분 유니크) → 기존 기본 해제 후 대상 지정, 실패 시 원복.
    let released: string[] = [];
    if (body.isDefault === true && !current.is_default) {
      const { data: defaults, error: defaultsError } = await supabase!
        .from("shipper_document_templates")
        .select("id")
        .eq("shipper_id", current.shipper_id)
        .eq("is_default", true);
      if (defaultsError) throw defaultsError;
      released = ((defaults ?? []) as DbRow[]).map((row) => text(row.id));
      if (released.length > 0) {
        const { error } = await supabase!
          .from("shipper_document_templates")
          .update({ is_default: false, updated_at: now })
          .in("id", released);
        if (error) throw error;
      }
      update.is_default = true;
    }

    const { data, error } = await supabase!.from("shipper_document_templates").update(update).eq("id", mappingId).select("*").single();
    if (error) {
      if (released.length > 0) {
        await supabase!.from("shipper_document_templates").update({ is_default: true, updated_at: now }).in("id", released);
      }
      throw error;
    }

    const { data: templateRow, error: templateError } = await supabase!
      .from("document_templates")
      .select("*")
      .eq("id", current.template_id)
      .single();
    if (templateError) throw templateError;

    const mapping: ShipperDocumentMappingDto = { ...toMappingRow(data as DbRow), template: toTemplate(templateRow as DbRow) };
    return NextResponse.json({ source: "supabase", mapping } satisfies UpdateShipperDocumentMappingResponse);
  } catch (error) {
    return routeErrorResponse(error, "화주별 문서양식 수정에 실패했습니다.");
  }
}

// 기본 매핑이 해제되면 남은 활성 양식 중 sort_order가 가장 작은 행을 기본으로 올린다. 실패해도 삭제는 유지하고 경고만 돌려준다.
async function promoteNextDefault(supabase: ServerSupabase, shipperId: string) {
  try {
    const { data: rows, error } = await supabase.from("shipper_document_templates").select("*").eq("shipper_id", shipperId);
    if (error) throw error;
    const remaining = ((rows ?? []) as DbRow[]).map(toMappingRow);
    if (remaining.length === 0 || remaining.some((item) => item.is_default)) return {};

    const { data: templates, error: templateError } = await supabase
      .from("document_templates")
      .select("id")
      .in("id", remaining.map((item) => item.template_id))
      .eq("is_active", true);
    if (templateError) throw templateError;
    const activeIds = new Set(((templates ?? []) as DbRow[]).map((row) => text(row.id)));

    const next = remaining.filter((item) => activeIds.has(item.template_id)).sort((a, b) => a.sort_order - b.sort_order)[0];
    if (!next) return { warning: "기본 양식이 해제됐고 승격할 활성 양식이 없습니다. 기본 양식을 지정해주세요." };

    const { error: updateError } = await supabase
      .from("shipper_document_templates")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", next.id);
    if (updateError) throw updateError;
    return { promotedId: next.id };
  } catch {
    return { warning: "기본 양식이 해제됐지만 다른 양식을 기본으로 승격하지 못했습니다. 기본 양식을 지정해주세요." };
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { mappingId } = await context.params;
    const requested = scopeFromSearchParams(new URL(request.url).searchParams);
    if (!requested) return missingScopeResponse();

    const supabase = createServerSupabaseClient();

    if (isMockMode(supabase)) {
      return NextResponse.json({ source: "mock", deletedId: mappingId } satisfies DeleteShipperDocumentMappingResponse);
    }

    const target = await loadMappingInScope(supabase!, mappingId, requested);
    const { error } = await supabase!.from("shipper_document_templates").delete().eq("id", mappingId);
    if (error) throw error;

    const promotion = target.is_default ? await promoteNextDefault(supabase!, target.shipper_id) : {};
    return NextResponse.json({
      source: "supabase",
      deletedId: mappingId,
      ...promotion
    } satisfies DeleteShipperDocumentMappingResponse);
  } catch (error) {
    return routeErrorResponse(error, "화주별 문서양식 해제에 실패했습니다.");
  }
}
