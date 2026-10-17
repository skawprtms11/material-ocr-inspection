import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/repositories/supabase-scope";
import { checkPhotoSubmittable } from "@/lib/server/inspection-guard";
import {
  INSPECTION_IMAGE_BUCKET,
  ensureInspectionImageBucket,
  loadPhotoReviewImages,
  nextPhotoSubmissionNo,
  removeSupersededSubmittedPhotos
} from "@/lib/server/inspection-images";
import { buildReadiness, loadActiveStageRows } from "@/lib/server/photo-review";
import {
  assertInspectionBelongsToWork,
  assertUuid,
  assertWorkInScope,
  guardErrorResponse,
  missingScopeResponse,
  resolveRequestScope,
  scopeFromFormData,
  scopeFromSearchParams
} from "@/lib/server/scope-guard";
import { maybeAdvanceWorkStatus } from "@/lib/server/work-auto-status";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { WorkInspectionStage, WorkStatus } from "@/lib/types/domain";
import type { PhotoReviewItemDto, PhotoReviewItemStatus, PhotoReviewResponse, PhotoSubmitResponse } from "@/lib/types/work-inspection-api";

export const runtime = "nodejs";

// 사진검수(PHOTO) 항목 제출/조회 API.
// POST: 항목당 현재 사진 1장. 승인대기 전 교체는 이전 submitted 사진을 지우고, 반려 사진은 이력으로 남긴다.
// GET : 작업·단계별 PHOTO 항목 + 현재/이력 사진 서명URL + 작업승인 가능 여부(readiness).

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

type DbRow = Record<string, unknown>;

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function toItemStatus(status: string): PhotoReviewItemStatus {
  return status === "submitted" || status === "admin_approved" || status === "rejected" ? status : "pending";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const workId = text(formData.get("workId"));
  const inspectionId = text(formData.get("inspectionId"));
  const image = formData.get("image");
  const requestScope = scopeFromFormData(formData);

  if (!requestScope) return missingScopeResponse();
  if (!workId || !inspectionId) {
    return NextResponse.json({ error: "workId와 inspectionId가 필요합니다." }, { status: 400 });
  }
  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "촬영 이미지가 필요합니다." }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(image.type)) {
    return NextResponse.json({ error: "jpeg/png/webp 이미지만 제출할 수 있습니다." }, { status: 400 });
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "이미지는 8MB 이하여야 합니다." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      source: "mock",
      status: "submitted",
      photo: { id: "mock", url: "" },
      workStatus: "registered"
    } satisfies PhotoSubmitResponse);
  }

  let uploadedPath: string | null = null;
  let insertedImageId: string | null = null;

  try {
    assertUuid(workId, "workId");
    assertUuid(inspectionId, "inspectionId");
    const workRow = await assertWorkInScope(supabase, workId, await resolveRequestScope(supabase, requestScope));
    await assertInspectionBelongsToWork(supabase, inspectionId, workId);

    const { data: inspectionRow, error: inspectionError } = await supabase
      .from("work_inspections")
      .select("*")
      .eq("id", inspectionId)
      .maybeSingle();
    if (inspectionError) throw inspectionError;
    const inspection = inspectionRow as DbRow | null;
    if (!inspection) return NextResponse.json({ error: "검수 항목을 찾을 수 없습니다." }, { status: 404 });

    const failure = checkPhotoSubmittable(inspection, text(workRow.status));
    if (failure) return NextResponse.json({ error: failure.error }, { status: failure.status });

    const priorStatus = text(inspection.status, "pending");
    const submissionNo = await nextPhotoSubmissionNo(supabase, inspectionId);

    await ensureInspectionImageBucket(supabase);
    const savedAt = new Date().toISOString();
    const storagePath = `${workId}/${inspectionId}/${Date.now()}-photo.jpg`;
    const { error: uploadError } = await supabase.storage.from(INSPECTION_IMAGE_BUCKET).upload(storagePath, image, {
      cacheControl: "3600",
      contentType: image.type,
      upsert: false
    });
    if (uploadError) throw uploadError;
    uploadedPath = storagePath;

    const { data: insertedImage, error: imageInsertError } = await supabase
      .from("inspection_images")
      .insert({
        work_id: workId,
        inspection_id: inspectionId,
        image_type: "photo_review",
        storage_path: `${INSPECTION_IMAGE_BUCKET}/${storagePath}`,
        original_file_name: image.name,
        mime_type: image.type,
        is_compressed: true,
        metadata: { submissionNo, reviewStatus: "submitted", savedAt }
      })
      .select("id")
      .single();
    if (imageInsertError) throw imageInsertError;
    insertedImageId = (insertedImage as { id: string }).id;

    // 같은 항목이 그 사이 다른 상태로 바뀌었다면(동시 승인 등) 갱신되지 않도록 이전 상태를 조건으로 건다.
    const { data: updatedRows, error: updateError } = await supabase
      .from("work_inspections")
      .update({
        status: "submitted",
        submitted_at: savedAt,
        attempt_count: (typeof inspection.attempt_count === "number" ? inspection.attempt_count : 0) + 1,
        result_summary: "사진 제출(승인대기)",
        updated_at: savedAt
      })
      .eq("id", inspectionId)
      .eq("status", priorStatus)
      .select("id");
    if (updateError) throw updateError;
    if (!updatedRows || updatedRows.length === 0) {
      await cleanup(supabase, uploadedPath, insertedImageId);
      return NextResponse.json({ error: "다른 처리로 항목 상태가 변경되어 제출하지 못했습니다. 새로고침 후 다시 시도해주세요." }, { status: 409 });
    }
    uploadedPath = null;
    insertedImageId = null;

    await removeSupersededSubmittedPhotos(supabase, inspectionId, (insertedImage as { id: string }).id);

    const workStatus = await maybeAdvanceWorkStatus(supabase, workId);
    if (!workStatus) {
      return NextResponse.json({ error: "사진은 저장되었으나 작업 상태 갱신에 실패했습니다. 잠시 후 다시 확인해주세요." }, { status: 502 });
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from(INSPECTION_IMAGE_BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    if (signedError) throw signedError;

    return NextResponse.json({
      source: "supabase",
      status: "submitted",
      photo: { id: (insertedImage as { id: string }).id, url: signed?.signedUrl ?? "" },
      workStatus
    } satisfies PhotoSubmitResponse);
  } catch (error) {
    if (uploadedPath || insertedImageId) await cleanup(supabase, uploadedPath, insertedImageId);
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "사진 제출 저장에 실패했습니다.") }, { status: 502 });
  }
}

// 이미지 저장 성공 후 항목 갱신이 실패한 경우 고아 파일·행이 남지 않도록 정리한다(실패해도 원래 오류를 우선한다).
async function cleanup(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  storagePath: string | null,
  imageId: string | null
) {
  try {
    if (imageId) await supabase.from("inspection_images").delete().eq("id", imageId);
    if (storagePath) await supabase.storage.from(INSPECTION_IMAGE_BUCKET).remove([storagePath]);
  } catch (cleanupError) {
    console.error("사진검수 이미지 정리에 실패했습니다.", cleanupError);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const workId = searchParams.get("work_id") ?? "";
  const requestScope = scopeFromSearchParams(searchParams);
  const stage: WorkInspectionStage = searchParams.get("stage") === "complete" ? "complete" : "start";
  const includeHistory = searchParams.get("include_history") === "true";

  if (!workId) return NextResponse.json({ error: "work_id가 필요합니다." }, { status: 400 });
  if (!requestScope) return missingScopeResponse();

  const supabase = createServerSupabaseClient();

  if (!supabase || process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "false") {
    return NextResponse.json({
      source: "mock",
      workId,
      workStatus: "registered",
      stage,
      items: [],
      readiness: { canApproveWork: false, pendingPhotos: 0, rejectedPhotos: 0, nonPhotoIncomplete: 0, adminRequested: 0 }
    } satisfies PhotoReviewResponse);
  }

  try {
    assertUuid(workId, "work_id");
    const workRow = await assertWorkInScope(supabase, workId, await resolveRequestScope(supabase, requestScope));
    const workStatus = text(workRow.status, "registered") as WorkStatus;

    const { rows, materials } = await loadActiveStageRows(supabase, workId, stage);
    const materialById = new Map(materials.map((material) => [material.id, material]));
    const photoRows = rows.filter((row) => row.method === "PHOTO");
    const images = await loadPhotoReviewImages(supabase, photoRows.map((row) => row.id));

    const items: PhotoReviewItemDto[] = photoRows.map((row) => {
      const entry = images.get(row.id);
      const isProduct = row.target_type === "product";
      const material = materialById.get(row.material_id);
      return {
        inspectionId: row.id,
        targetType: isProduct ? "product" : "material",
        label: isProduct ? row.product_name || row.product_code : material?.name || "-",
        code: isProduct ? row.product_code : material?.code || "-",
        ...(isProduct && row.product_lot ? { lot: row.product_lot } : {}),
        ...(!isProduct && row.material_id ? { materialId: row.material_id } : {}),
        status: toItemStatus(row.status),
        ...(row.review_comment ? { reviewComment: row.review_comment } : {}),
        ...(row.submitted_at ? { submittedAt: row.submitted_at } : {}),
        ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
        ...(entry?.current ? { photo: { id: entry.current.id, url: entry.current.url } } : {}),
        ...(includeHistory && entry ? { history: entry.history } : {})
      };
    });

    // 제품 먼저, 같은 타입 안에서는 코드 -> LOT -> 항목ID 순(생성 시각이 같아도 순서가 흔들리지 않게)
    items.sort((a, b) => {
      if (a.targetType !== b.targetType) return a.targetType === "product" ? -1 : 1;
      return a.code.localeCompare(b.code) || (a.lot ?? "").localeCompare(b.lot ?? "") || a.inspectionId.localeCompare(b.inspectionId);
    });

    return NextResponse.json({
      source: "supabase",
      workId,
      workStatus,
      stage,
      items,
      readiness: buildReadiness(rows, workStatus)
    } satisfies PhotoReviewResponse);
  } catch (error) {
    const guardResponse = guardErrorResponse(error);
    if (guardResponse) return guardResponse;
    return NextResponse.json({ error: errorMessage(error, "사진검수 조회에 실패했습니다.") }, { status: 502 });
  }
}
