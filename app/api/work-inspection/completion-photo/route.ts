import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { pruneStaleInspectionImages, relativeStoragePath } from "@/lib/server/inspection-images";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { maybeAdvanceWorkStatus } from "@/lib/server/work-auto-status";

export const runtime = "nodejs";

// 검수 사진 저장 API(체크리스트 없이 촬영 즉시 저장·합격 처리).
// - method="PRODUCT"(완료제품 사진): 최소 1장 ~ 최대 3장까지 누적 저장한다. 사진이 1장 이상이면 합격,
//   전부 삭제되면 다시 대기로 되돌린다.
// - 그 외(부자재 비전검수): 기존과 동일하게 최신 사진 1장만 유지한다.
// 저장 성공 직후 maybeAdvanceWorkStatus()로 작업상태 자동 전이를 재판정한다.

type DbRow = Record<string, unknown>;

const inspectionImageBucket = "inspection-images";
// 완료제품 사진 최대 장수(대표님 지시: 최소 1장 ~ 최대 3장).
const maxProductPhotoCount = 3;

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

function resultSummaryFor(method: unknown, photoCount = 1) {
  return method === "PRODUCT" ? `완료제품 사진 저장 (${photoCount}장)` : "완료검수 사진 저장(비전)";
}

// 검수 항목에 저장된 사진 목록을 서명 URL과 함께 돌려준다(완료제품 사진 갤러리용).
async function listInspectionPhotos(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  inspectionId: string
) {
  const { data: rows, error } = await supabase
    .from("inspection_images")
    .select("id, storage_path, created_at")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const images = (rows ?? []) as { id: string; storage_path: string }[];
  if (images.length === 0) return [];

  const paths = images.map((row) => relativeStoragePath(inspectionImageBucket, row.storage_path));
  const { data: signedUrls, error: signedUrlError } = await supabase.storage
    .from(inspectionImageBucket)
    .createSignedUrls(paths, 60 * 60);
  // 서명 URL 발급 실패는 저장 자체를 막지 않는다(미리보기 없이 장수만 표시된다).
  if (signedUrlError) return images.map((row) => ({ id: row.id, url: "" }));

  return images.map((row, index) => ({
    id: row.id,
    url: (signedUrls ?? [])[index]?.signedUrl ?? ""
  }));
}

// 저장된 사진 장수에 따라 검수 상태를 재판정한다(1장 이상이면 합격, 0장이면 대기).
async function syncInspectionStatusByPhotoCount(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  inspectionId: string,
  method: unknown,
  photoCount: number,
  attemptCount: number
) {
  const passed = photoCount > 0;
  const { error } = await supabase
    .from("work_inspections")
    .update({
      status: passed ? "passed" : "pending",
      result_summary: passed ? resultSummaryFor(method, photoCount) : "",
      attempt_count: attemptCount,
      updated_at: new Date().toISOString()
    })
    .eq("id", inspectionId);
  if (error) throw error;
}

async function loadInspection(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  inspectionId: string,
  workId: string
) {
  const { data, error } = await supabase
    .from("work_inspections")
    .select("*")
    .eq("id", inspectionId)
    .eq("work_id", workId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as DbRow | null;
}

// 완료제품 사진 갤러리 조회(모바일 완료검수 화면이 진입 시/저장 후 호출).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const inspectionId = searchParams.get("inspection_id") ?? "";
  const workId = searchParams.get("work_id") ?? "";

  if (!inspectionId || !workId) {
    return NextResponse.json({ error: "inspection_id와 work_id가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", photos: [], maxCount: maxProductPhotoCount });
  }

  try {
    const inspection = await loadInspection(supabase, inspectionId, workId);
    if (!inspection) {
      return NextResponse.json({ error: "검수 대상을 찾을 수 없습니다." }, { status: 404 });
    }

    const photos = await listInspectionPhotos(supabase, inspectionId);
    return NextResponse.json({ source: "supabase", photos, maxCount: maxProductPhotoCount });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "검수 사진 조회에 실패했습니다.") }, { status: 502 });
  }
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
    return NextResponse.json({ error: "검수 촬영 이미지가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock" as const, status: "passed", resultSummary: resultSummaryFor("PRODUCT") });
  }

  try {
    const inspection = await loadInspection(supabase, inspectionId, workId);
    if (!inspection) {
      return NextResponse.json({ error: "검수 대상을 찾을 수 없습니다." }, { status: 404 });
    }

    const isProductPhoto = inspection.method === "PRODUCT";
    const attemptCount = (numberField(inspection.attempt_count) ?? 0) + 1;

    // 완료제품 사진은 누적 저장이므로 저장 전에 최대 장수를 확인한다.
    if (isProductPhoto) {
      const { count, error: countError } = await supabase
        .from("inspection_images")
        .select("id", { count: "exact", head: true })
        .eq("inspection_id", inspectionId);
      if (countError) throw countError;
      if ((count ?? 0) >= maxProductPhotoCount) {
        return NextResponse.json(
          { error: `완료제품 사진은 최대 ${maxProductPhotoCount}장까지 저장할 수 있습니다. 기존 사진을 삭제 후 다시 촬영해주세요.` },
          { status: 409 }
        );
      }
    }

    await ensureInspectionImageBucket(supabase);
    const storagePath = `${workId}/${inspectionId}/${Date.now()}-completion.jpg`;
    const { error: uploadError } = await supabase.storage.from(inspectionImageBucket).upload(storagePath, image, {
      cacheControl: "3600",
      contentType: image.type || "image/jpeg",
      upsert: true
    });
    if (uploadError) throw uploadError;

    let photoCount = 1;

    try {
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

      if (isProductPhoto) {
        // 완료제품 사진은 최대 3장까지 그대로 유지한다(이전 사진을 지우지 않는다).
        const { count, error: countError } = await supabase
          .from("inspection_images")
          .select("id", { count: "exact", head: true })
          .eq("inspection_id", inspectionId);
        if (countError) throw countError;
        photoCount = count ?? 1;
      } else {
        // 부자재 비전검수는 기존과 동일하게 최신 사진 1장만 유지한다.
        await pruneStaleInspectionImages(
          supabase,
          inspectionImageBucket,
          inspectionId,
          (insertedImage as { id: string }).id
        );
      }

      await syncInspectionStatusByPhotoCount(supabase, inspectionId, inspection.method, photoCount, attemptCount);
    } catch (dbError) {
      // 업로드 성공 후 DB 저장이 실패하면 고아 파일이 남지 않도록 스토리지를 정리한다.
      try {
        await supabase.storage.from(inspectionImageBucket).remove([storagePath]);
      } catch (cleanupError) {
        console.error("검수 이미지 정리에 실패했습니다.", cleanupError);
      }
      throw dbError;
    }

    await maybeAdvanceWorkStatus(supabase, workId);

    const photos = isProductPhoto ? await listInspectionPhotos(supabase, inspectionId) : [];

    return NextResponse.json({
      source: "supabase",
      status: "passed",
      resultSummary: resultSummaryFor(inspection.method, photoCount),
      photos
    });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "검수 사진 저장에 실패했습니다.") }, { status: 500 });
  }
}

// 완료제품 사진 개별 삭제(1~3장 중 잘못 찍은 사진 교체용). 마지막 1장을 지우면 검수 상태가 대기로 돌아간다.
export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { inspectionId?: string; workId?: string; imageId?: string };
  const inspectionId = text(body.inspectionId);
  const workId = text(body.workId);
  const imageId = text(body.imageId);

  if (!inspectionId || !workId || !imageId) {
    return NextResponse.json({ error: "inspectionId·workId·imageId가 필요합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({ source: "mock", photos: [] });
  }

  try {
    const inspection = await loadInspection(supabase, inspectionId, workId);
    if (!inspection) {
      return NextResponse.json({ error: "검수 대상을 찾을 수 없습니다." }, { status: 404 });
    }

    const { data: imageRow, error: imageError } = await supabase
      .from("inspection_images")
      .select("id, storage_path")
      .eq("id", imageId)
      .eq("inspection_id", inspectionId)
      .maybeSingle();
    if (imageError) throw imageError;
    if (!imageRow) {
      return NextResponse.json({ error: "삭제할 사진을 찾을 수 없습니다." }, { status: 404 });
    }

    const path = relativeStoragePath(inspectionImageBucket, text((imageRow as DbRow).storage_path));
    const { error: removeError } = await supabase.storage.from(inspectionImageBucket).remove([path]);
    if (removeError) throw removeError;

    const { error: deleteError } = await supabase.from("inspection_images").delete().eq("id", imageId);
    if (deleteError) throw deleteError;

    const photos = await listInspectionPhotos(supabase, inspectionId);
    await syncInspectionStatusByPhotoCount(
      supabase,
      inspectionId,
      inspection.method,
      photos.length,
      numberField(inspection.attempt_count) ?? 0
    );
    await maybeAdvanceWorkStatus(supabase, workId);

    return NextResponse.json({ source: "supabase", photos });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "검수 사진 삭제에 실패했습니다.") }, { status: 500 });
  }
}
