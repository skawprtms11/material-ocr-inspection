import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

type ProductChecks = {
  productCode?: boolean;
  productName?: boolean;
  lot?: boolean;
};

const inspectionImageBucket = "inspection-images";
const resultSummary = "제품검수 수동 합격 (코드/명/LOT 확인)";

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseChecks(raw: string): ProductChecks {
  const parsed = JSON.parse(raw) as ProductChecks;
  if (!parsed.productCode || !parsed.productName || !parsed.lot) {
    throw new Error("제품코드/제품명/LOT 체크를 모두 확인해야 저장할 수 있습니다.");
  }

  return parsed;
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

function buildMockResponse() {
  return {
    source: "mock" as const,
    status: "passed",
    resultSummary
  };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const inspectionId = text(formData.get("inspectionId"));
  const workId = text(formData.get("workId"));
  const checksRaw = formData.get("checks");
  const image = formData.get("image");

  if (!inspectionId || !workId) {
    return NextResponse.json({ error: "inspectionId와 workId가 필요합니다." }, { status: 400 });
  }

  if (typeof checksRaw !== "string" || !checksRaw) {
    return NextResponse.json({ error: "checks가 필요합니다." }, { status: 400 });
  }

  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "검수 촬영 이미지가 필요합니다." }, { status: 400 });
  }

  let checks: ProductChecks;
  try {
    checks = parseChecks(checksRaw);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "checks 형식이 올바르지 않습니다.") }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(buildMockResponse());
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

    await ensureInspectionImageBucket(supabase);
    const storagePath = `${workId}/${inspectionId}/${Date.now()}-product.jpg`;
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

      const { error: imageInsertError } = await supabase.from("inspection_images").insert({
        work_id: workId,
        inspection_id: inspectionId,
        image_type: "product",
        storage_path: `${inspectionImageBucket}/${storagePath}`,
        original_file_name: image.name,
        mime_type: image.type || "image/jpeg",
        is_compressed: true,
        metadata: {
          checks,
          savedAt: new Date().toISOString()
        }
      });
      if (imageInsertError) throw imageInsertError;
    } catch (dbError) {
      // 업로드 성공 후 DB 저장이 실패하면 고아 파일이 남지 않도록 스토리지를 정리한다.
      try {
        await supabase.storage.from(inspectionImageBucket).remove([storagePath]);
      } catch (cleanupError) {
        console.error("제품검수 이미지 정리에 실패했습니다.", cleanupError);
      }
      throw dbError;
    }

    return NextResponse.json({
      source: "supabase",
      status: "passed",
      resultSummary
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "제품검수 저장에 실패했습니다.") }, { status: 500 });
  }
}
