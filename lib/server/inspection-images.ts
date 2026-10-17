import type { createServerSupabaseClient } from "@/lib/supabase/server";

// inspection_images.storage_path는 "{버킷명}/{경로}" 형태로 저장돼 있어 스토리지 API 호출 전 버킷
// 프리픽스를 제거해야 한다(app/api/work-status/detail/route.ts의 relativeStoragePath()와 동일 규칙).
export function relativeStoragePath(bucket: string, path: string) {
  return path.startsWith(`${bucket}/`) ? path.slice(bucket.length + 1) : path;
}

// OCR/제품검수/완료검수 사진 저장 API가 새 사진 저장에 성공한 뒤 호출한다. 같은 검수 항목(inspection_id)에
// 남아있는 이전 사진들을 스토리지+DB에서 모두 제거해 "검증을 통과한 사진 1장만 유지"되도록 한다(재촬영/재검수로
// 여러 번 성공 저장되면 이전 판정 사진이 계속 누적되던 문제 수정). 정리 실패는 이미 저장된 새 사진에 영향을
// 주지 않도록 조용히 무시한다(로그만 남김).
export async function pruneStaleInspectionImages(
  supabase: NonNullable<ReturnType<typeof createServerSupabaseClient>>,
  bucket: string,
  inspectionId: string,
  keepImageId: string
) {
  try {
    const { data: staleRows, error: staleError } = await supabase
      .from("inspection_images")
      .select("id, storage_path")
      .eq("inspection_id", inspectionId)
      .neq("id", keepImageId);
    if (staleError) throw staleError;

    const stale = (staleRows ?? []) as { id: string; storage_path: string }[];
    if (stale.length === 0) return;

    const relativePaths = stale.map((row) => relativeStoragePath(bucket, row.storage_path));
    const { error: removeError } = await supabase.storage.from(bucket).remove(relativePaths);
    if (removeError) throw removeError;

    const { error: deleteError } = await supabase
      .from("inspection_images")
      .delete()
      .in("id", stale.map((row) => row.id));
    if (deleteError) throw deleteError;
  } catch (error) {
    console.error("이전 검수 사진 정리에 실패했습니다.", error);
  }
}

// ---- 사진검수(PHOTO) 이미지 ----

export const INSPECTION_IMAGE_BUCKET = "inspection-images";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type ServerSupabase = NonNullable<ReturnType<typeof createServerSupabaseClient>>;

// photo_review 이미지의 metadata. reviewStatus는 제출 시 submitted, 관리자 처리 시 approved/rejected로 갱신한다.
export type PhotoReviewMetadata = {
  submissionNo: number;
  reviewStatus: "submitted" | "approved" | "rejected";
  reason?: string;
  savedAt: string;
  decidedAt?: string;
};

export type PhotoReviewImage = {
  id: string;
  url: string;
  submissionNo: number;
  reviewStatus: PhotoReviewMetadata["reviewStatus"];
  reason?: string;
  savedAt: string;
};

export async function ensureInspectionImageBucket(supabase: ServerSupabase) {
  const { error } = await supabase.storage.getBucket(INSPECTION_IMAGE_BUCKET);
  if (!error) return;

  const { error: createError } = await supabase.storage.createBucket(INSPECTION_IMAGE_BUCKET, {
    public: false,
    fileSizeLimit: 1024 * 1024 * 8,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  });
  if (createError && !createError.message.toLowerCase().includes("already exists")) throw createError;
}

function parseMetadata(value: unknown, fallbackSavedAt: string, fallbackNo: number): PhotoReviewMetadata {
  const meta = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const reviewStatus = meta.reviewStatus === "approved" || meta.reviewStatus === "rejected" ? meta.reviewStatus : "submitted";
  return {
    submissionNo: typeof meta.submissionNo === "number" ? meta.submissionNo : fallbackNo,
    reviewStatus,
    ...(typeof meta.reason === "string" && meta.reason ? { reason: meta.reason } : {}),
    savedAt: typeof meta.savedAt === "string" ? meta.savedAt : fallbackSavedAt,
    ...(typeof meta.decidedAt === "string" ? { decidedAt: meta.decidedAt } : {})
  };
}

// 항목별 photo_review 이미지를 서명 URL과 함께 읽는다. current = 가장 최근 제출 사진, history = 그 이전 사진(반려 이력 등, 최신순).
// DB·스토리지 오류는 던진다(호출 라우트가 502로 변환).
export async function loadPhotoReviewImages(
  supabase: ServerSupabase,
  inspectionIds: string[]
): Promise<Map<string, { current?: PhotoReviewImage; history: PhotoReviewImage[] }>> {
  const result = new Map<string, { current?: PhotoReviewImage; history: PhotoReviewImage[] }>();
  if (inspectionIds.length === 0) return result;

  const { data, error } = await supabase
    .from("inspection_images")
    .select("id, inspection_id, storage_path, metadata, created_at")
    .eq("image_type", "photo_review")
    .in("inspection_id", inspectionIds)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as { id: string; inspection_id: string; storage_path: string; metadata: unknown; created_at?: string }[];
  if (rows.length === 0) return result;

  const { data: signed, error: signedError } = await supabase.storage
    .from(INSPECTION_IMAGE_BUCKET)
    .createSignedUrls(rows.map((row) => relativeStoragePath(INSPECTION_IMAGE_BUCKET, row.storage_path)), SIGNED_URL_TTL_SECONDS);
  if (signedError) throw signedError;

  rows.forEach((row, index) => {
    const meta = parseMetadata(row.metadata, row.created_at ?? "", rows.length - index);
    const image: PhotoReviewImage = {
      id: row.id,
      url: signed?.[index]?.signedUrl ?? "",
      submissionNo: meta.submissionNo,
      reviewStatus: meta.reviewStatus,
      ...(meta.reason ? { reason: meta.reason } : {}),
      savedAt: meta.savedAt
    };
    const entry = result.get(row.inspection_id) ?? { history: [] };
    if (!entry.current) entry.current = image;
    else entry.history.push(image);
    result.set(row.inspection_id, entry);
  });
  return result;
}

// 새 사진 제출 후 호출한다. 검토 전(reviewStatus=submitted) 교체분은 스토리지+DB에서 지우고, 반려(rejected)·승인 사진은 이력으로 남긴다.
// 정리 실패는 새 사진에 영향을 주지 않도록 로그만 남긴다.
export async function removeSupersededSubmittedPhotos(supabase: ServerSupabase, inspectionId: string, keepImageId: string) {
  try {
    const { data, error } = await supabase
      .from("inspection_images")
      .select("id, storage_path, metadata")
      .eq("image_type", "photo_review")
      .eq("inspection_id", inspectionId)
      .neq("id", keepImageId);
    if (error) throw error;

    const stale = ((data ?? []) as { id: string; storage_path: string; metadata: unknown }[]).filter(
      (row) => parseMetadata(row.metadata, "", 0).reviewStatus === "submitted"
    );
    if (stale.length === 0) return;

    const { error: removeError } = await supabase.storage
      .from(INSPECTION_IMAGE_BUCKET)
      .remove(stale.map((row) => relativeStoragePath(INSPECTION_IMAGE_BUCKET, row.storage_path)));
    if (removeError) throw removeError;

    const { error: deleteError } = await supabase.from("inspection_images").delete().in("id", stale.map((row) => row.id));
    if (deleteError) throw deleteError;
  } catch (error) {
    console.error("교체된 사진검수 이미지 정리에 실패했습니다.", error);
  }
}

// 다음 제출 번호(submissionNo) = 해당 항목의 photo_review 이미지 수 + 1. 삭제된 교체분이 있어도 단조 증가하도록 최대값 기준으로 계산한다.
export async function nextPhotoSubmissionNo(supabase: ServerSupabase, inspectionId: string) {
  const { data, error } = await supabase
    .from("inspection_images")
    .select("metadata")
    .eq("image_type", "photo_review")
    .eq("inspection_id", inspectionId);
  if (error) throw error;
  const numbers = ((data ?? []) as { metadata: unknown }[]).map((row) => parseMetadata(row.metadata, "", 0).submissionNo);
  return Math.max(0, ...numbers) + 1;
}

// 관리자 승인/반려 시 항목의 최신 photo_review 이미지 metadata(reviewStatus/reason/decidedAt)를 갱신한다. 이미지가 없으면 아무것도 안 한다.
// DB 오류는 던진다.
export async function markPhotoReviewDecision(
  supabase: ServerSupabase,
  inspectionId: string,
  decision: "approved" | "rejected",
  reason: string | null,
  decidedAt: string
) {
  const { data, error } = await supabase
    .from("inspection_images")
    .select("id, metadata")
    .eq("image_type", "photo_review")
    .eq("inspection_id", inspectionId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;

  const latest = ((data ?? []) as { id: string; metadata: unknown }[])[0];
  if (!latest) return;

  const meta = parseMetadata(latest.metadata, "", 0);
  const nextMeta: PhotoReviewMetadata = {
    ...meta,
    reviewStatus: decision,
    decidedAt,
    ...(decision === "rejected" && reason ? { reason } : {})
  };
  if (decision === "approved") delete nextMeta.reason;

  const { error: updateError } = await supabase.from("inspection_images").update({ metadata: nextMeta }).eq("id", latest.id);
  if (updateError) throw updateError;
}
