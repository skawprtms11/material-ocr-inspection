import { NextRequest, NextResponse } from "next/server";
import {
  mapProductRows,
  replaceWorkMasterProducts
} from "@/lib/repositories/work-master-supabase-repository";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProductUsageRowDto } from "@/lib/types/work-master-api";

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
  const body = (await request.json()) as { rows?: ProductUsageRowDto[] };
  const rows = body.rows ?? [];
  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      source: "mock",
      rows: rows.map((row, index) => ({
        ...row,
        id: row.id || `prod-mock-${workMasterId}-${index}`,
        workMasterId
      }))
    });
  }

  try {
    const savedRows = await replaceWorkMasterProducts(supabase, workMasterId, rows);
    return NextResponse.json({ source: "supabase", rows: mapProductRows(savedRows) });
  } catch (error) {
    const message = errorMessage(error, "작업마스터 사용제품코드 저장에 실패했습니다.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
