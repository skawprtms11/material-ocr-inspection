import type { MaterialMaster } from "@/lib/types/domain";

export type MissingReference = "OCR" | "VISION";

// 서버가 영역 등록 여부까지 반영해 채우는 선택 필드(목록 API 응답용)
export type MaterialWithReferenceStatus = MaterialMaster & { missing_reference?: MissingReference[] };

export const missingReferenceBadgeText = "기준 미등록";
export const missingReferenceHint = "현장 진행 불가 — 기준 등록 또는 체크 해제 필요";

type ReferenceFacts = {
  ocrRegion: boolean;
  ocrExpectedText: boolean;
  visionRegion: boolean;
};

// 체크(inspection_method)된 방식 중 기준(이미지·영역·검증값)이 없는 방식을 돌려준다. NONE(사진검수)은 항상 빈 배열.
export function findMissingReferences(
  material: Pick<MaterialMaster, "inspection_method" | "ocr_image_path" | "vision_image_path" | "verification_value">,
  facts: ReferenceFacts
): MissingReference[] {
  const method = material.inspection_method;
  const missing: MissingReference[] = [];

  if (method === "OCR" || method === "BOTH") {
    const hasValue = Boolean(material.verification_value?.trim()) || facts.ocrExpectedText;
    if (!material.ocr_image_path || !facts.ocrRegion || !hasValue) missing.push("OCR");
  }
  if (method === "VISION" || method === "BOTH") {
    if (!material.vision_image_path || !facts.visionRegion) missing.push("VISION");
  }

  return missing;
}

// 서버 판정값이 없을 때(mock)는 경로 컬럼만으로 판정한다.
export function getMissingReferences(material: MaterialWithReferenceStatus): MissingReference[] {
  if (material.missing_reference) return material.missing_reference;
  return findMissingReferences(material, {
    ocrRegion: Boolean(material.ocr_image_path),
    ocrExpectedText: false,
    visionRegion: Boolean(material.vision_image_path)
  });
}
