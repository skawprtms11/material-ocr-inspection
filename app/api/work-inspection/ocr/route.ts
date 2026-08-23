import { NextRequest, NextResponse } from "next/server";
import { appRepository } from "@/lib/repositories/app-repository";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { runOcr, type RoiRect } from "@/lib/server/ocr";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

const inspectionImageBucket = "inspection-images";
const fullRoi: RoiRect = { x: 0, y: 0, width: 100, height: 100 };

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseRoi(raw: string): RoiRect {
  const parsed = JSON.parse(raw) as Partial<RoiRect>;
  const x = numberField(parsed.x);
  const y = numberField(parsed.y);
  const width = numberField(parsed.width);
  const height = numberField(parsed.height);

  if (x === null || y === null || width === null || height === null) throw new Error("roi 값은 숫자여야 합니다.");
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 100 || y + height > 100) {
    throw new Error("roi 범위는 0~100 안에 있어야 합니다.");
  }

  return { x, y, width, height };
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

function buildMockResponse(inspectionId: string, workId: string) {
  const inspection = appRepository.listInspections(workId).find((item) => item.id === inspectionId);
  const material = inspection ? appRepository.listMaterials({}).find((item) => item.id === inspection.material_id) : undefined;
  const expectedValue = material?.verification_value ?? "";
  const canVerify = Boolean(expectedValue);

  return {
    source: "mock" as const,
    status: canVerify ? "passed" : inspection?.status ?? "pending",
    recognizedText: canVerify ? expectedValue : "",
    expectedValue,
    matched: canVerify,
    canVerify,
    saved: canVerify
  };
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const inspectionId = text(formData.get("inspectionId"));
  const workId = text(formData.get("workId"));
  const image = formData.get("image");
  const roiRaw = formData.get("roi");

  if (!inspectionId || !workId) {
    return NextResponse.json({ error: "inspectionId와 workId가 필요합니다." }, { status: 400 });
  }

  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "검수 촬영 이미지가 필요합니다." }, { status: 400 });
  }

  if (typeof roiRaw !== "string" || !roiRaw) {
    return NextResponse.json({ error: "roi가 필요합니다." }, { status: 400 });
  }

  let roi: RoiRect;
  try {
    roi = parseRoi(roiRaw);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "roi 형식이 올바르지 않습니다.") }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json(buildMockResponse(inspectionId, workId));
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
    const materialId = text(inspection.material_id);

    const { data: materialRow, error: materialError } = await supabase
      .from("material_masters")
      .select("verification_value")
      .eq("id", materialId)
      .maybeSingle();

    if (materialError) throw materialError;
    const expectedValue = text((materialRow as DbRow | null)?.verification_value);

    // 검증값 미등록 부자재는 빈값-빈값 매칭으로 합격 처리되는 것을 막기 위해 판정 자체를 거부한다
    if (!expectedValue.trim()) {
      return NextResponse.json(
        { error: "이 부자재는 검증값이 등록되지 않아 OCR 검수를 진행할 수 없습니다. 부자재등록에서 OCR 등록을 먼저 해주세요." },
        { status: 409 }
      );
    }

    const ocrResult = await runOcr({ image, isCropped: true, roi: fullRoi, originalRoi: roi });

    if (!ocrResult.ok) {
      return NextResponse.json({ error: ocrResult.error }, { status: ocrResult.status });
    }

    if (!ocrResult.canVerify) {
      // OCR 서버 미설정 등으로 판정이 불가능하면 DB를 변경하지 않고 안내만 반환한다.
      return NextResponse.json({
        source: "supabase",
        status: text(inspection.status, "pending"),
        recognizedText: "",
        expectedValue,
        matched: false,
        canVerify: false,
        saved: false
      });
    }

    const recognizedText = ocrResult.extractedText;
    const matched = normalize(recognizedText) === normalize(expectedValue);

    // 불합격 판정은 재검수가 전제이므로 스토리지 업로드·DB 갱신 없이 판정 결과만 응답한다.
    if (!matched) {
      return NextResponse.json({
        source: "supabase",
        status: text(inspection.status, "pending"),
        recognizedText,
        expectedValue,
        matched: false,
        canVerify: true,
        saved: false
      });
    }

    const nextStatus = "passed";
    const attemptCount = (numberField(inspection.attempt_count) ?? 0) + 1;
    const resultSummary = `OCR 일치 (기대값: ${expectedValue || "-"})`;

    await ensureInspectionImageBucket(supabase);
    const storagePath = `${workId}/${inspectionId}/${Date.now()}-ocr.jpg`;
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
          status: nextStatus,
          ocr_result_text: recognizedText,
          result_summary: resultSummary,
          attempt_count: attemptCount,
          updated_at: new Date().toISOString()
        })
        .eq("id", inspectionId);
      if (updateError) throw updateError;

      const { error: imageInsertError } = await supabase.from("inspection_images").insert({
        work_id: workId,
        inspection_id: inspectionId,
        image_type: "ocr_capture",
        storage_path: `${inspectionImageBucket}/${storagePath}`,
        original_file_name: image.name,
        mime_type: image.type || "image/jpeg",
        is_compressed: false,
        metadata: {
          roi,
          expectedValue,
          recognizedText,
          matched,
          savedAt: new Date().toISOString()
        }
      });
      if (imageInsertError) throw imageInsertError;
    } catch (dbError) {
      // 업로드 성공 후 DB 저장이 실패하면 고아 파일이 남지 않도록 스토리지를 정리한다.
      try {
        await supabase.storage.from(inspectionImageBucket).remove([storagePath]);
      } catch (cleanupError) {
        console.error("검수 이미지 정리에 실패했습니다.", cleanupError);
      }
      throw dbError;
    }

    return NextResponse.json({
      source: "supabase",
      status: nextStatus,
      recognizedText,
      expectedValue,
      matched,
      canVerify: true,
      saved: true
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "OCR 검수 저장에 실패했습니다.") }, { status: 500 });
  }
}
