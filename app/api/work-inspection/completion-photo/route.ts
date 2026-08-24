import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { pruneStaleInspectionImages } from "@/lib/server/inspection-images";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { maybeAdvanceWorkStatus } from "@/lib/server/work-auto-status";

export const runtime = "nodejs";

// 완료검수 전용 사진 저장 API. 시작 전 "제품검수"(체크리스트 3개)와 달리 체크리스트 없이 사진 1장을
// 촬영하면 무조건 저장·합격 처리한다. "완료제품사진"(material_id 없음, method: PRODUCT) 항목과
// 부자재 비전 완료검수 항목이 공유한다(둘 다 "촬영 즉시 저장" 동작이 동일하므로 API를 나누지 않음).

type DbRow = Record<string, unknown>;

const inspectionImageBucket = "inspection-images";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function ensureInspectionImageBucket(supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>) {
  const { error } = await supabase.storage.getBucket(inspectionImageBucket);
  if (!error) return;

  const { error: createError } = await supabase.storage.createBucket(inspectionImageBucket, {
    public: false,
    fileSizeLimit: 1024 * 1024 * 8,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  });

  if (createError && !createError.message.toLowerCase().includes("already exists")) throw createError;
}

function resultSummaryFor(method: unknown) {
  return method === "PRODUCT" ? "완료제품 사진 저장" : "완료검수 사진 저장(비전)";
}

function buildMockResponse(method: unknown) {
  return {
    source: "mock" as const,
    status: "passed",
    resultSummary: resultSummaryFor(method)
  };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const inspectionId = text(formData.get("inspectionId"));
  const workId = text(formData.get("workId"));
  const image = formData.get("image");

  if (!inspectionId || !workId) {
    return NextResponse.json({ error: "inspectionId와 workId가 필요합니다." }, { status: 400 });
  }

  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "완료검수 촬영 이미지가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(buildMockResponse("PRODUCT"));
  }

  try {
    const { data: inspectionRow, error: inspectionError } = await supabase
      .from("work_inspections")
      .select("*")
      .eq("id", inspectionId)
      .eq("work_id", workId)
      .maybeSingle();

    if (inspectionError) throw inspectionError;
    if (!inspectionRow) {
      return NextResponse.json({ error: "검수 대상을 찾을 수 없습니다." }, { status: 404 });
    }

    const inspection = inspectionRow as DbRow;
    const attemptCount = (numberField(inspection.attempt_count) ?? 0) + 1;
    const resultSummary = resultSummaryFor(inspection.method);

    await ensureInspectionImageBucket(supabase);
    const storagePath = `${workId}/${inspectionId}/${Date.now()}-completion.jpg`;
    const { error: uploadError } = await supabase.storage.from(inspectionImageBucket).upload(storagePath, image, {
      cacheControl: "3600",
      contentType: image.type || "image/jpeg",
      upsert: true
    });
    if (uploadError) throw uploadError;

    try {
      const { error: updateError } = await supabase
        .from("work_inspections")
        .update({
          status: "passed",
          result_summary: resultSummary,
          attempt_count: attemptCount,
          updated_at: new Date().toISOString()
        })
        .eq("id", inspectionId);
      if (updateError) throw updateError;

      const { data: insertedImage, error: imageInsertError } = await supabase
        .from("inspection_images")
        .insert({
          work_id: workId,
          inspection_id: inspectionId,
          image_type: "completion_photo",
          storage_path: `${inspectionImageBucket}/${storagePath}`,
          original_file_name: image.name,
          mime_type: image.type || "image/jpeg",
          is_compressed: true,
          metadata: { savedAt: new Date().toISOString() }
        })
        .select("id")
        .single();
      if (imageInsertError) throw imageInsertError;

      // 사진 1장만 유지한다(다시 촬영으로 이전에 저장된 사진이 있으면 정리).
      await pruneStaleInspectionImages(supabase, inspectionImageBucket, inspectionId, (insertedImage as { id: string }).id);
    } catch (dbError) {
      // 업로드 성공 후 DB 저장이 실패하면 고아 파일이 남지 않도록 스토리지를 정리한다.
      try {
        await supabase.storage.from(inspectionImageBucket).remove([storagePath]);
      } catch (cleanupError) {
        console.error("완료검수 이미지 정리에 실패했습니다.", cleanupError);
      }
      throw dbError;
    }

    await maybeAdvanceWorkStatus(supabase, workId);

    return NextResponse.json({ source: "supabase", status: "passed", resultSummary });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "완료검수 사진 저장에 실패했습니다.") }, { status: 500 });
  }
}
