import type {
  AdminReviewRequest,
  InspectionImage,
  Work,
  WorkInspection,
  WorkInspectionStage,
  WorkStatus
} from "@/lib/types/domain";

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
  // 사진검수(PHOTO) 단계별 요약. 웹 "승인대기" 섹션·목록의 "사진 검수" 버튼이 쓴다(PHOTO 항목이 없으면 생략).
  photoReview?: Partial<Record<WorkInspectionStage, PhotoReviewSummaryDto>>;
};

// 단계별 사진검수 요약(제출 n/m, 반려 k, OCR·비전 등 사진 외 미완료 수).
export type PhotoReviewSummaryDto = {
  totalPhotos: number;
  submittedPhotos: number;
  approvedPhotos: number;
  rejectedPhotos: number;
  nonPhotoIncomplete: number;
  latestSubmittedAt?: string;
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
    }
  | {
      // 항목 단위(일괄) 사진 승인/반려. 승인대기(submitted) PHOTO 항목만 대상. 반려는 reason 필수.
      type: "photo_review";
      decisions: PhotoReviewDecision[];
    }
  | {
      // 작업승인: 조건 R 충족(미진행·불합격·확인요청 0 + 승인대기 ≥1) 시 해당 단계 승인대기 전부 승인. start -> in_progress, complete -> completed.
      type: "photo_approve_work";
      stage: WorkInspectionStage;
    }
  | {
      // 작업반려: 해당 단계 승인대기 전부 반려(reason 필수).
      type: "photo_reject_work";
      stage: WorkInspectionStage;
      reason: string;
    };

export type PhotoReviewDecision = {
  inspectionId: string;
  decision: "approved" | "rejected";
  reason?: string;
};

export type WorkInspectionActionResponse = {
  source: "supabase" | "mock";
  workId: string;
  requestId?: string;
  status?: AdjustmentStatusDto;
  // 사진 승인/반려 액션 후의 작업상태
  workStatus?: WorkStatus;
};

// ---- 사진검수(PHOTO) API 계약: POST/GET /api/work-inspection/photo ----

export type PhotoReviewItemStatus = "pending" | "submitted" | "admin_approved" | "rejected";

// 사진 확인 팝업 상단 작업 요약
export type PhotoReviewWorkDto = {
  documentNo: string;
  workType: string;
  finishedProductCode: string;
  finishedProductName: string;
  quantity: number;
  finishedProductLot: string;
  workDate: string;
  dueDate: string;
};

// 항목별 기대 정보(구성품 → 없으면 작업마스터 BOM). LOT 분할이 여럿이고 항목 LOT와 일치하는 행이 없으면 합계·LOT 나열.
export type PhotoReviewExpectedDto = {
  code: string;
  name: string;
  lot: string;
  unitQuantity: number;
  requiredQuantity: number;
  allocatedQuantity: number;
  memo: string;
  inspectionMethodLabel?: string;
};

export type PhotoReviewItemDto = {
  inspectionId: string;
  targetType: "product" | "material";
  label: string;
  code: string;
  lot?: string;
  materialId?: string;
  status: PhotoReviewItemStatus;
  reviewComment?: string;
  submittedAt?: string;
  reviewedAt?: string;
  photo?: { id: string; url: string };
  expected?: PhotoReviewExpectedDto;
  // 부자재마스터 기준 이미지 서명 URL(등록된 경우만)
  referenceImageUrl?: string;
  history?: { id: string; url: string; submissionNo: number; reviewStatus: string; reason?: string; savedAt: string }[];
};

export type PhotoReviewReadinessDto = {
  // 작업승인 버튼 활성 판단(조건 R)
  canApproveWork: boolean;
  pendingPhotos: number;
  rejectedPhotos: number;
  // OCR/VISION/완료제품사진 등 사진 외 항목의 미완료 수
  nonPhotoIncomplete: number;
  adminRequested: number;
};

export type PhotoReviewResponse = {
  source: "supabase" | "mock";
  workId: string;
  workStatus: WorkStatus;
  stage: WorkInspectionStage;
  work?: PhotoReviewWorkDto;
  items: PhotoReviewItemDto[];
  readiness: PhotoReviewReadinessDto;
};

export type PhotoSubmitResponse = {
  source: "supabase" | "mock";
  status: "submitted";
  photo: { id: string; url: string };
  workStatus: WorkStatus;
};
