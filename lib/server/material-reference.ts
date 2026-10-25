import type { SupabaseClient } from "@supabase/supabase-js";
import { findMissingReferences, type MaterialWithReferenceStatus } from "@/lib/inspection/material-reference";
import type { MaterialMaster } from "@/lib/types/domain";

type RegionRow = { material_id: string; method: string; expected_text: string | null };

// 부자재 목록에 기준 미등록 판정(missing_reference)을 붙인다. 영역 조회 실패는 호출측이 502로 처리하도록 던진다.
export async function attachMissingReferences(
  supabase: SupabaseClient,
  materials: MaterialMaster[]
): Promise<MaterialWithReferenceStatus[]> {
  const checkedIds = materials.filter((material) => material.inspection_method !== "NONE").map((material) => material.id);
  const regionsByMaterial = new Map<string, RegionRow[]>();

  if (checkedIds.length > 0) {
    const { data, error } = await supabase
      .from("material_inspection_regions")
      .select("material_id, method, expected_text")
      .in("material_id", checkedIds);
    if (error) throw error;

    for (const row of (data ?? []) as RegionRow[]) {
      regionsByMaterial.set(row.material_id, [...(regionsByMaterial.get(row.material_id) ?? []), row]);
    }
  }

  return materials.map((material) => {
    const regions = regionsByMaterial.get(material.id) ?? [];
    const ocrRegions = regions.filter((region) => region.method === "OCR");

    return {
      ...material,
      missing_reference: findMissingReferences(material, {
        ocrRegion: ocrRegions.length > 0,
        ocrExpectedText: ocrRegions.some((region) => Boolean(region.expected_text?.trim())),
        visionRegion: regions.some((region) => region.method === "VISION")
      })
    };
  });
}

export const MATERIAL_IMAGE_BUCKET = "material-images";

export function safePathSegment(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9가-힣._-]+/g, "-");
}

// 부자재 기준이미지 업로드 폴더 규칙(registration API의 storagePath와 동일): mobile/{부자재ID}/{방식}/
export function materialImageFolder(materialId: string, method?: "OCR" | "VISION") {
  return `mobile/${safePathSegment(materialId)}/${method ? `${method.toLowerCase()}/` : ""}`;
}

// 저장·서명·삭제가 공유하는 소유 검사. 해당 부자재 폴더 안의 경로만 버킷 상대경로로 돌려주고 나머지는 null.
// 버킷 프리픽스는 한 번만 허용하고, 선행 슬래시·역슬래시·빈/./.. 세그먼트로 폴더 밖을 가리키는 우회를 막는다.
export function ownedMaterialImagePath(path: string, materialId: string, method?: "OCR" | "VISION") {
  const relative = path.startsWith(`${MATERIAL_IMAGE_BUCKET}/`) ? path.slice(MATERIAL_IMAGE_BUCKET.length + 1) : path;
  if (relative.includes("\\") || /[\u0000-\u001f]/.test(relative)) return null;
  if (relative.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) return null;

  return relative.startsWith(materialImageFolder(materialId, method)) ? relative : null;
}
