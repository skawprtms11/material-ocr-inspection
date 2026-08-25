import type { MaterialMaster } from "@/lib/types/domain";
import type { InspectionWithVerificationDto } from "@/lib/types/work-inspection-api";

// 부자재 마스터에서 해당 검수방법이 체크돼 있는지 판정한다
// (자재 마스터의 "OCR등록" / "비전스캔등록" 체크박스 = material_masters.inspection_method).
// 마스터를 찾지 못한 경우(스코프 밖 등)는 숨기지 않고 그대로 노출한다(검수 누락 방지).
function isMethodEnabled(material: MaterialMaster | undefined, method: string) {
  if (!material) return true;
  if (material.inspection_method === "BOTH") return method === "OCR" || method === "VISION";
  return material.inspection_method === method;
}

// 실제로 진행할 부자재 검수 항목만 남긴다. 마스터에서 체크가 해제된 뒤에도 남아있는 과거 검수 행을 걸러내
// 화면과 완료 판정이 어긋나지 않게 한다(PRODUCT = 완료제품 사진 항목은 여기서 제외한다).
export function getVisibleMaterialInspections(
  inspections: InspectionWithVerificationDto[],
  materials: MaterialMaster[]
) {
  return inspections
    .filter((inspection) => inspection.method !== "PRODUCT")
    .filter((inspection) =>
      isMethodEnabled(
        materials.find((item) => item.id === inspection.material_id),
        inspection.method
      )
    );
}

// 화면에 실제 표시되는 검수 항목(부자재 + 완료제품 사진)만 모아준다. 완료 판정은 이 목록으로만 한다.
export function getActiveInspections(
  inspections: InspectionWithVerificationDto[],
  materials: MaterialMaster[]
) {
  const productPhotos = inspections.filter((inspection) => inspection.method === "PRODUCT");
  return [...getVisibleMaterialInspections(inspections, materials), ...productPhotos];
}
