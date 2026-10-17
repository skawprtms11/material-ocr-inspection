import { NextRequest, NextResponse } from "next/server";
import {
  mapMaterialRows,
  replaceWorkMasterMaterials,
  validateMaterialRows,
  WorkMasterValidationError
} from "@/lib/repositories/work-master-supabase-repository";
import {
  assertMaterialsInScope,
  assertWorkMasterInScope,
  guardErrorResponse,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromBody
} from "@/lib/server/scope-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WorkMaterialRowDto } from "@/lib/types/work-master-api";

type RouteContext = {
  params: Promise<{
    workMasterId: string;
  }>;
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { workMasterId } = await context.params;
  let body: { departmentId?: string; shipperId?: string; rows?: WorkMaterialRowDto[] };
  try {
    body = (await request.json()) as { departmentId?: string; shipperId?: string; rows?: WorkMaterialRowDto[] };
  } catch {
    return NextResponse.json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, { status: 400 });
  }
  const requestScope = scopeFromBody(body);
  if (!requestScope) return missingScopeResponse();
  const rows = body.rows ?? [];
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows는 배열이어야 합니다." }, { status: 400 });

  try {
    validateMaterialRows(rows);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "입력값이 올바르지 않습니다.") }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      source: "mock",
      rows: rows.map((row, index) => ({
        ...row,
        id: row.id || `wmm-mock-${workMasterId}-${index}`,
        workMasterId
      }))
    });
  }

  try {
    const scope = await resolveRequestScope(supabase, requestScope);
    await assertWorkMasterInScope(supabase, workMasterId, scope);
    await assertMaterialsInScope(supabase, rows.map((row) => row.materialId), scope);
    const savedRows = await replaceWorkMasterMaterials(supabase, workMasterId, rows);
    return NextResponse.json({ source: "supabase", rows: mapMaterialRows(savedRows) });
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    const message = errorMessage(error, "작업마스터 부자재 저장에 실패했습니다.");
    const status = error instanceof WorkMasterValidationError ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
