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
