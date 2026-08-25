import type { InspectionMethod, InspectionStatus, Work, WorkInspectionStage, WorkStatus } from "@/lib/types/domain";

export type DisplayWorkStatusDto = "waiting" | "progress" | "hold" | "cancel" | "complete";

// 작업에 연결된 work_inspections 집계 상태(취소 > 완료 > 대기 우선순위).
export type InspectionAggregateStatusDto = "completed" | "waiting" | "canceled";

export type WorkStatusRowDto = {
  work: Work & {
    work_type?: string;
    quantity?: number;
    finished_product_lot?: string;
  };
  displayStatus: DisplayWorkStatusDto;
  inspectionStatus: InspectionAggregateStatusDto;
  // 처리 대기 중인 확인요청이 걸린 검수 단계. 있으면 작업현황 상태 라벨을 "검수확인중"(start) /
  // "완료확인중"(complete)으로 표시한다. 두 단계에 모두 걸려 있으면 더 진행된 "complete"를 쓴다.
  reviewStage?: WorkInspectionStage;
  workType: string;
  productCode: string;
  productName: string;
  lot: string;
  quantity: number;
  // 작업시작: 검수완료 처리된 일자(work_inspections.updated_at 최댓값). 검수완료 전이면 undefined.
  workStartedAt?: string;
  // 완료일자: 작업상태를 완료 그룹(passed/completed)으로 처리한 일자(works.completed_at). 미완료면 undefined.
  completedAt?: string;
};

export type WorkStatusDataResponse = {
  source: "supabase" | "mock";
  warning?: string;
  rows: WorkStatusRowDto[];
};

export type UpdateWorkStatusResponse = {
  source: "supabase" | "mock";
  workId: string;
  status: WorkStatus;
};

// 작업현황 표에서 문서번호 클릭 시 여는 상세 팝업(제품내역/부자재 내역) 응답.
export type WorkDetailProductDto = {
  id: string;
  productCode: string;
  productName: string;
  unitQuantity?: number;
  productType?: "정상품" | "샘플" | "세트제품";
  lot?: string;
  requiredQuantity?: number;
  allocatedQuantity?: number;
  // 사용수량: allocatedQuantity가 있으면 그 값, 없으면 unitQuantity × 작업수량(works.quantity) 계산값.
  usedQuantity?: number;
  memo?: string;
};

// 제품내역 출처: 실제 작업에 배분된 work_components(LOT 단위) 우선, 없으면 work_master_products(마스터 구성) 폴백.
export type WorkDetailProductsSourceDto = "work_components" | "work_master";

export type WorkDetailMaterialInspectionDto = {
  method: Exclude<InspectionMethod, "BOTH">;
  status: InspectionStatus;
};

export type WorkDetailMaterialDto = {
  id: string;
  materialId: string;
  materialCode: string;
  materialName: string;
  inspectionMethod: InspectionMethod;
  unitQuantity: number;
  // 사용수량: unitQuantity × 작업수량(works.quantity) 계산값. 값 없으면 undefined("-" 표시).
  usedQuantity?: number;
  verificationValue: string;
  inspections: WorkDetailMaterialInspectionDto[];
  imageUrls: string[];
};

export type WorkDetailInfoDto = {
  workId: string;
  documentNo: string;
  productCode: string;
  productName: string;
  quantity: number;
  lot: string;
  workerName: string;
  workDate: string;
};

// 완료검수(작업완료 시 검수) 항목 1건. "완료제품사진"(material 없음)과 부자재 완료검수 항목을 함께 담는다.
export type WorkDetailCompletionPhotoDto = {
  id: string;
  // "완료제품사진" 또는 부자재명.
  label: string;
  method: "OCR" | "VISION" | "PRODUCT";
  status: InspectionStatus;
  imageUrls: string[];
};

export type WorkDetailResponse = {
  source: "supabase" | "mock";
  work: WorkDetailInfoDto;
  products: WorkDetailProductDto[];
  productsSource: WorkDetailProductsSourceDto;
  materials: WorkDetailMaterialDto[];
  // 완료검수 사진 구역(부자재 내역 표 아래). 완료검수가 아직 없으면 빈 배열.
  completionPhotos: WorkDetailCompletionPhotoDto[];
};
