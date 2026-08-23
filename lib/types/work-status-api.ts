import type { InspectionMethod, InspectionStatus, Work, WorkStatus } from "@/lib/types/domain";

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
  workType: string;
  productCode: string;
  productName: string;
  lot: string;
  quantity: number;
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

export type WorkDetailResponse = {
  source: "supabase" | "mock";
  work: WorkDetailInfoDto;
  products: WorkDetailProductDto[];
  productsSource: WorkDetailProductsSourceDto;
  materials: WorkDetailMaterialDto[];
};
