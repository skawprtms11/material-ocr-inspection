import { NextRequest, NextResponse } from "next/server";
import { normalizeMaterialInspectionMethod } from "@/lib/inspection/method-plan";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds, toMockScopeIds } from "@/lib/repositories/supabase-scope";
import {
  assertMaterialInScope,
  guardErrorResponse,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromBody
} from "@/lib/server/scope-guard";
import { attachMissingReferences } from "@/lib/server/material-reference";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { InspectionMethod, MaterialMaster } from "@/lib/types/domain";

type DbRow = Record<string, unknown>;

type MaterialPayload = {
  id?: string;
  departmentId?: string;
  shipperId?: string;
  code: string;
  name: string;
  lot?: string;
  inspection_method: InspectionMethod;
  ocr_image_path?: string;
  vision_image_path?: string;
  reference_image_path?: string;
  remark?: string;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toMaterial(row: DbRow): MaterialMaster {
  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    code: text(row.code),
    name: text(row.name),
    lot: text(row.lot) || undefined,
    inspection_method: normalizeMaterialInspectionMethod(row.inspection_method),
    reference_image_path: text(row.reference_image_path),
    ocr_image_path: text(row.ocr_image_path) || undefined,
    vision_image_path: text(row.vision_image_path) || undefined,
    remark: text(row.remark) || undefined,
    is_active: typeof row.is_active === "boolean" ? row.is_active : true,
    verification_value: text(row.verification_value)
  };
}

function mockData(departmentId: string, shipperId: string, warning?: string) {
  const scope = toMockScopeIds(departmentId, shipperId);

  return {
    source: "mock" as const,
    warning,
    materials: appRepository.listMaterials(scope)
  };
}

const allowedInspectionMethods: readonly string[] = ["OCR", "VISION", "BOTH", "NONE"];

// 미전송은 NONE(사진검수)으로 보고, 전송된 값이 허용값이 아니면 거부한다.
function invalidInspectionMethod(payload: MaterialPayload) {
  const value: unknown = payload.inspection_method;
  if (value === undefined) {
    payload.inspection_method = "NONE";
    return false;
  }
  return typeof value !== "string" || !allowedInspectionMethods.includes(value);
}

function inspectionMethodErrorResponse() {
  return NextResponse.json({ error: "inspection_method는 OCR, VISION, BOTH, NONE 중 하나여야 합니다." }, { status: 400 });
}

function payloadToDb(payload: MaterialPayload, departmentId?: string, shipperId?: string) {
  return {
    ...(departmentId ? { department_id: departmentId } : {}),
    ...(shipperId ? { shipper_id: shipperId } : {}),
    code: payload.code,
    name: payload.name,
    lot: payload.lot ?? "",
    inspection_method: payload.inspection_method,
    reference_image_path: payload.reference_image_path ?? payload.ocr_image_path ?? payload.vision_image_path ?? "",
    ocr_image_path: payload.ocr_image_path ?? "",
    vision_image_path: payload.vision_image_path ?? "",
    remark: payload.remark ?? "",
    is_active: true
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("department_id");
  const shipperId = searchParams.get("shipper_id");
  const materialId = searchParams.get("material_id");

  if (!departmentId || !shipperId) {
    return NextResponse.json({ error: "department_id와 shipper_id가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(mockData(departmentId, shipperId));
  }

  try {
    const scope = await resolveScopeIds(supabase, departmentId, shipperId);
    const { data, error } = await supabase
      .from("material_masters")
      .select("*")
      .eq("department_id", scope.departmentId)
      .eq("shipper_id", scope.shipperId)
      .order("code", { ascending: true });

    if (error) throw error;
    const rows = (data ?? []) as DbRow[];

    // material_id 단독 조회(모바일 부자재사진)도 스코프 안의 부자재만 허용한다. 스코프 밖이면 403/404.
    if (materialId && !rows.some((row) => text(row.id) === materialId)) {
      const material = await assertMaterialInScope(supabase, materialId, scope);
      rows.unshift(material);
    }

    return NextResponse.json({ source: "supabase", materials: await attachMissingReferences(supabase, rows.map(toMaterial)) });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "Supabase 부자재마스터 조회에 실패했습니다.") }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as MaterialPayload;

  if (!body.departmentId || !body.shipperId || !body.code || !body.name) {
    return NextResponse.json({ error: "부서, 화주, 부자재코드, 부자재명이 필요합니다." }, { status: 400 });
  }
  if (invalidInspectionMethod(body)) return inspectionMethodErrorResponse();

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      source: "mock",
      material: {
        id: `mat-${Date.now()}`,
        department_id: body.departmentId,
        shipper_id: body.shipperId,
        reference_image_path: body.reference_image_path ?? "",
        is_active: true,
        ...body
      }
    });
  }

  try {
    const scope = await resolveScopeIds(supabase, body.departmentId, body.shipperId);
    const { data, error } = await supabase.from("material_masters").insert(payloadToDb(body, scope.departmentId, scope.shipperId)).select("*").single();
    if (error) throw error;

    const [material] = await attachMissingReferences(supabase, [toMaterial(data as DbRow)]);
    return NextResponse.json({ source: "supabase", material });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "부자재 저장에 실패했습니다.") }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as MaterialPayload;

  const requestScope = scopeFromBody(body);
  if (!requestScope) return missingScopeResponse();

  if (!body.id || !body.code || !body.name) {
    return NextResponse.json({ error: "부자재 ID, 코드, 명칭이 필요합니다." }, { status: 400 });
  }
  if (invalidInspectionMethod(body)) return inspectionMethodErrorResponse();

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", material: body });
  }

  try {
    const scope = await resolveRequestScope(supabase, requestScope);
    await assertMaterialInScope(supabase, body.id, scope);

    const { data, error } = await supabase
      .from("material_masters")
      .update(payloadToDb(body))
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) throw error;

    const [material] = await attachMissingReferences(supabase, [toMaterial(data as DbRow)]);
    return NextResponse.json({ source: "supabase", material });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "부자재 수정에 실패했습니다.") }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { id?: string; departmentId?: string; shipperId?: string };
  const requestScope = scopeFromBody(body);
  if (!requestScope) return missingScopeResponse();

  if (!body.id) return NextResponse.json({ error: "삭제할 부자재 ID가 필요합니다." }, { status: 400 });

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", id: body.id });
  }

  try {
    const scope = await resolveRequestScope(supabase, requestScope);
    await assertMaterialInScope(supabase, body.id, scope);

    const { error } = await supabase.from("material_masters").delete().eq("id", body.id);
    if (error) throw error;

    return NextResponse.json({ source: "supabase", id: body.id });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "부자재 삭제에 실패했습니다.") }, { status: 502 });
  }
}
