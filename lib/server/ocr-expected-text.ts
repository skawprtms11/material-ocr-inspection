import { DEFAULT_OCR_PASS_THRESHOLD } from "@/lib/inspection/ocr-match";
import type { createServerSupabaseClient } from "@/lib/supabase/server";

type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

export type OcrExpectedSource = "work" | "master" | "none";

export type OcrExpectedText = { text: string; source: OcrExpectedSource };

type DbRow = Record<string, unknown>;

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

// 서버 전용 env. 숫자가 아니거나 50~100 범위 밖이면 기본값을 쓴다.
export function getOcrPassThreshold() {
  const parsed = Number(process.env.OCR_MATCH_PASS_THRESHOLD);
  return Number.isFinite(parsed) && parsed >= 50 && parsed <= 100 ? parsed : DEFAULT_OCR_PASS_THRESHOLD;
}

// 우선순위: 작업별 지정 텍스트(work_components.ocr_expected_text, 부자재코드로 매칭) → 부자재마스터 verification_value → 없음.
export function pickOcrExpectedText(workText: string | undefined, masterValue: string | undefined): OcrExpectedText {
  if (workText && workText.trim()) return { text: workText, source: "work" };
  if (masterValue && masterValue.trim()) return { text: masterValue, source: "master" };
  return { text: "", source: "none" };
}

export async function resolveOcrExpectedText(
  supabase: ServerSupabase,
  workId: string,
  materialId: string
): Promise<OcrExpectedText> {
  const { data: materialRow, error: materialError } = await supabase
    .from("material_masters")
    .select("code, verification_value")
    .eq("id", materialId)
    .maybeSingle();
  if (materialError) throw materialError;

  const material = materialRow as DbRow | null;
  const code = str(material?.code);
  let workText = "";

  if (code) {
    const { data: componentRows, error: componentError } = await supabase
      .from("work_components")
      .select("ocr_expected_text")
      .eq("work_id", workId)
      .eq("component_type", "부자재")
      .eq("component_code", code);
    if (componentError) throw componentError;
    workText = ((componentRows ?? []) as DbRow[]).map((row) => str(row.ocr_expected_text)).find((value) => value.trim()) ?? "";
  }

  return pickOcrExpectedText(workText, str(material?.verification_value));
}

// 목록 조회용: 대상 작업들의 부자재 지정 텍스트를 1쿼리로 읽어 "workId|code" 맵으로 돌려준다(N+1 방지).
export async function loadWorkOcrTexts(supabase: ServerSupabase, workIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (workIds.length === 0) return map;

  const { data, error } = await supabase
    .from("work_components")
    .select("work_id, component_code, ocr_expected_text")
    .in("work_id", workIds)
    .eq("component_type", "부자재")
    .not("ocr_expected_text", "is", null);
  if (error) throw error;

  for (const row of (data ?? []) as DbRow[]) {
    const value = str(row.ocr_expected_text);
    const key = `${str(row.work_id)}|${str(row.component_code)}`;
    if (value.trim() && !map.has(key)) map.set(key, value);
  }
  return map;
}
