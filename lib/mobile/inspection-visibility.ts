import { getInspectionTargetType, planMaterialMethods } from "@/lib/inspection/method-plan";
import type { MaterialInspectionMethod } from "@/lib/types/domain";

// 가시성 판정에 필요한 최소 필드. 모바일 DTO와 서버 집계(lib/server/work-auto-status.ts)가 함께 쓴다.
type VisibilityInspection = { method: string; material_id: string; target_type?: string | null };
type VisibilityMaterial = { id: string; inspection_method?: MaterialInspectionMethod | string };

// 부자재마스터 inspection_method 체크 여부로 만든 현재 검수 계획(planMaterialMethods)에 해당 방식이 포함되는지 판정한다
// (OCR·비전 둘 다 미체크 = PHOTO). 마스터를 찾지 못한 경우(스코프 밖 등)는 숨기지 않고 그대로 노출한다(검수 누락 방지).
function isMethodEnabled(material: VisibilityMaterial | undefined, method: string) {
  if (!material) return true;
  return (planMaterialMethods(material.inspection_method) as string[]).includes(method);
}

// 실제로 진행할 부자재 검수 항목만 남긴다. 마스터에서 체크가 바뀐 뒤에도 남아있는 과거 검수 행을 걸러내
// 화면과 완료 판정이 어긋나지 않게 한다(제품 PHOTO·완료제품사진 항목은 여기서 제외한다).
export function getVisibleMaterialInspections<T extends VisibilityInspection>(
  inspections: T[],
  materials: VisibilityMaterial[]
) {
  return inspections
    .filter((inspection) => getInspectionTargetType(inspection) === "material")
    .filter((inspection) =>
      isMethodEnabled(
        materials.find((item) => item.id === inspection.material_id),
        inspection.method
      )
    );
}

// 제품 구성 행별 PHOTO 항목(항상 표시).
export function getProductPhotoInspections<T extends VisibilityInspection>(inspections: T[]) {
  return inspections.filter((inspection) => getInspectionTargetType(inspection) === "product");
}

// 화면에 실제 표시되는 검수 항목(부자재 + 제품 PHOTO + 완료제품 사진)만 모아준다. 완료 판정은 이 목록으로만 한다.
export function getActiveInspections<T extends VisibilityInspection>(inspections: T[], materials: VisibilityMaterial[]) {
  const productPhotos = getProductPhotoInspections(inspections);
  const completionPhotos = inspections.filter((inspection) => getInspectionTargetType(inspection) === "completion");
  return [...getVisibleMaterialInspections(inspections, materials), ...productPhotos, ...completionPhotos];
}
