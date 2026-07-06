import type { AdminReviewStatus, InspectionMethod, InspectionStatus, Role, WorkStatus } from "@/lib/types/domain";

export const roleLabels: Record<Role, string> = {
  admin: "관리자",
  manager: "매니저",
  worker: "작업자",
  viewer: "조회자"
};

export const workStatusLabels: Record<WorkStatus, string> = {
  registered: "작업등록",
  in_progress: "검수 진행",
  inspection_failed: "불합격",
  admin_review_requested: "관리자 확인",
  passed: "합격",
  completed: "완료"
};

export const inspectionStatusLabels: Record<InspectionStatus, string> = {
  pending: "대기",
  passed: "합격",
  failed: "불합격",
  retrying: "재검수",
  admin_requested: "관리자 요청",
  admin_approved: "관리자 승인"
};

export const adminReviewStatusLabels: Record<AdminReviewStatus, string> = {
  requested: "확인 요청",
  approved: "수동 합격",
  retry_requested: "재검수 요청",
  rejected: "불합격 유지"
};

export const inspectionMethodLabels: Record<InspectionMethod, string> = {
  OCR: "OCR",
  VISION: "비전",
  BOTH: "OCR + 비전"
};

export const workStatusOrder: WorkStatus[] = [
  "registered",
  "in_progress",
  "inspection_failed",
  "admin_review_requested",
  "passed",
  "completed"
];
