import type { AdminReviewRequest, InspectionImage, Work, WorkInspection } from "@/lib/types/domain";

export type AdjustmentStatusDto = "requested" | "approved" | "rejected" | "retry_requested";

// material_masters.verification_value(모바일 OCR 검수 확정값)를 검수 항목별 참고 기준값으로 함께 내려준다.
export type InspectionWithVerificationDto = WorkInspection & { materialVerificationValue?: string };

export type InspectionTableRowDto = {
  work: Work & {
    work_type?: string;
    quantity?: number;
    finished_product_lot?: string;
    assigned_to?: string;
    assigned_at?: string;
  };
  registeredAt: string;
  workType: string;
  finishedProductCode: string;
  finishedProductName: string;
  quantity: number;
  inspectionStep: string;
  request?: AdminReviewRequest;
  inspections: InspectionWithVerificationDto[];
  images: InspectionImage[];
  adjustmentStatus?: AdjustmentStatusDto;
  inspectionCompleted: boolean;
};

// 검수 중 특이사항 확인요청(미처리 admin_review_requests) 1건. 웹 작업검수 목록 상단 "확인요청" 섹션이 사용한다.
export type PendingReviewRequestDto = {
  requestId: string;
  workId: string;
  documentNo: string;
  materialName: string;
  method: string;
  inspectionId: string;
  reason: string;
  requestedAt?: string;
};

export type WorkInspectionDataResponse = {
  source: "supabase" | "mock";
  warning?: string;
  rows: InspectionTableRowDto[];
  pendingReviewRequests: PendingReviewRequestDto[];
};

export type WorkInspectionAction =
  | {
      type: "complete";
    }
  | {
      type: "adjustment";
      requestId: string;
      status: AdjustmentStatusDto;
      // 특정 검수 항목 1건만 대상으로 좁힐 때 사용(확인요청 섹션의 승인/재검수 버튼). 없으면 기존처럼 work의
      // admin_requested 검수 항목 전체를 대상으로 처리한다(AdjustmentReviewModal 기존 동작 유지).
      inspectionId?: string;
    }
  | {
      // 모바일 현장에서 검수 특이사항을 "관리자 확인 요청" 상태로 전환한다(검수 취소도 확인요청의 한 형태).
      type: "request_review";
      inspectionId: string;
      reason?: string;
      // 저장되는 사유의 접두 라벨(기본값 "현장 검수 취소 요청"). 예: "현장 확인요청"
      label?: string;
    };

export type WorkInspectionActionResponse = {
  source: "supabase" | "mock";
  workId: string;
  requestId?: string;
  status?: AdjustmentStatusDto;
};
