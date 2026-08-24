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
