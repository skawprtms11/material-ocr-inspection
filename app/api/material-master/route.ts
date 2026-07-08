import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage, resolveScopeIds } from "@/lib/repositories/supabase-scope";
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
  const method = text(row.inspection_method, "BOTH");

  return {
    id: text(row.id),
    department_id: text(row.department_id),
    shipper_id: text(row.shipper_id),
    code: text(row.code),
    name: text(row.name),
    lot: text(row.lot) || undefined,
    inspection_method: method === "OCR" || method === "VISION" || method === "BOTH" ? method : "BOTH",
    reference_image_path: text(row.reference_image_path),
    ocr_image_path: text(row.ocr_image_path) || undefined,
    vision_image_path: text(row.vision_image_path) || undefined,
    remark: text(row.remark) || undefined,
    is_active: typeof row.is_active === "boolean" ? row.is_active : true
  };
}

function mockData(departmentId: string, shipperId: string, warning?: string) {
  return {
    source: "mock" as const,
    warning,
    materials: appRepository.listMaterials({ departmentId, shipperId })
  };
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

  if (!departmentId || !shipperId) return NextResponse.json({ error: "department_id와 shipper_id가 필요합니다." }, { status: 400 });

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

    return NextResponse.json({ source: "supabase", materials: ((data ?? []) as DbRow[]).map(toMaterial) });
  } catch (error) {
    return NextResponse.json(mockData(departmentId, shipperId, errorMessage(error, "Supabase 부자재마스터 조회에 실패했습니다.")));
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as MaterialPayload;

  if (!body.departmentId || !body.shipperId || !body.code || !body.name) {
    return NextResponse.json({ error: "부서, 화주, 부자재코드, 부자재명이 필요합니다." }, { status: 400 });
  }

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

    return NextResponse.json({ source: "supabase", material: toMaterial(data as DbRow) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "부자재 저장에 실패했습니다.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json()) as MaterialPayload;

  if (!body.id || !body.code || !body.name) {
    return NextResponse.json({ error: "부자재 ID, 코드, 명칭이 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", material: body });
  }

  try {
    const { data, error } = await supabase
      .from("material_masters")
      .update(payloadToDb(body))
      .eq("id", body.id)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ source: "supabase", material: toMaterial(data as DbRow) });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "부자재 수정에 실패했습니다.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { id?: string };

  if (!body.id) return NextResponse.json({ error: "삭제할 부자재 ID가 필요합니다." }, { status: 400 });

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", id: body.id });
  }

  try {
    const { error } = await supabase.from("material_masters").delete().eq("id", body.id);
    if (error) throw error;

    return NextResponse.json({ source: "supabase", id: body.id });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "부자재 삭제에 실패했습니다.") }, { status: 500 });
  }
}
