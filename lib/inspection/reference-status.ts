import { getMissingReferences } from "@/lib/inspection/material-reference";
import type { InspectionMethod, MaterialMaster } from "@/lib/types/domain";

export type ReferenceMethod = "OCR" | "VISION";

export type ReferenceButtonState = "register" | "complete" | "incomplete" | "unused" | "unused-registered";

export function hasInspectionMethod(method: InspectionMethod | undefined, target: ReferenceMethod) {
  return method === target || method === "BOTH";
}

export function getReferencePath(material: MaterialMaster, method: ReferenceMethod) {
  return method === "OCR" ? material.ocr_image_path : material.vision_image_path;
}

// 판정은 목록의 "기준 미등록" 경고 배지(getMissingReferences)와 같은 기준을 쓴다.
export function getReferenceButtonState(material: MaterialMaster, method: ReferenceMethod): ReferenceButtonState {
  const checked = hasInspectionMethod(material.inspection_method, method);
  const hasPath = Boolean(getReferencePath(material, method));

  if (!checked) return hasPath ? "unused-registered" : "unused";
  if (!hasPath) return "register";
  return getMissingReferences(material).includes(method) ? "incomplete" : "complete";
}

export const referenceMethodLabels: Record<ReferenceMethod, string> = { OCR: "OCR", VISION: "비전" };

// 서버(registration POST)와 같은 규칙: 체크 안 된 방식은 신규 등록 불가, 기존 기준이 있으면 재등록 허용.
export function isReferenceRegistrationBlocked(material: MaterialMaster, method: ReferenceMethod) {
  return getReferenceButtonState(material, method) === "unused";
}

export function getReferenceBlockedMessage(material: MaterialMaster, method: ReferenceMethod) {
  if (material.inspection_method === "NONE") return "부자재마스터에서 OCR/비전이 체크되지 않아 등록할 수 없습니다.";
  return `부자재마스터에서 ${referenceMethodLabels[method]}이 체크되지 않아 등록할 수 없습니다.`;
}
