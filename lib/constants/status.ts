import type {
  AdminReviewStatus,
  InspectionMethod,
  InspectionStatus,
  Role,
  WorkInspectionStage,
  WorkStatus
} from "@/lib/types/domain";
import type { DisplayWorkStatusDto } from "@/lib/types/work-status-api";

export const roleLabels: Record<Role, string> = {
  admin: "관리자",
  manager: "매니저",
  worker: "작업자",
  viewer: "조회자"
};

export const workStatusLabels: Record<WorkStatus, string> = {
  registered: "대기",
  in_progress: "진행",
  on_hold: "보류",
  canceled: "취소",
  inspection_failed: "불합격",
  admin_review_requested: "관리자 확인",
  passed: "합격",
  completed: "완료"
};

// 확인요청(admin_review_requested) 중인 작업의 작업현황 표시 라벨. 어느 단계에서 확인요청이 걸렸는지에 따라
// 나뉜다: 작업전 검수 중이면 "검수확인중", 완료검수 중이면 "완료확인중". 관리자가 승인하면 검수 집계에 따라
// 진행/완료 등 원래 상태로 돌아간다(app/api/work-inspection/route.ts의 adjustment 처리).
export const reviewStageLabels: Record<WorkInspectionStage, string> = {
  start: "검수확인중",
  complete: "완료확인중"
};

// 작업현황에 표시할 작업상태 라벨. 확인요청 중이면 단계별 라벨("검수확인중"/"완료확인중")로 대체한다.
export function getWorkStatusLabel(status: WorkStatus, reviewStage?: WorkInspectionStage) {
  if (status === "admin_review_requested") {
    return reviewStageLabels[reviewStage ?? "start"];
  }
  return workStatusLabels[status] ?? status;
}

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

// 작업상태를 화면 표시용 상태(대기/진행/보류/취소/완료)로 묶는다. work-status 웹/API/모바일이 공유한다.
export function getDisplayStatus(status: WorkStatus): DisplayWorkStatusDto {
  if (status === "registered") return "waiting";
  if (status === "in_progress") return "progress";
  if (status === "on_hold" || status === "inspection_failed" || status === "admin_review_requested") return "hold";
  if (status === "canceled") return "cancel";
  return "complete";
}

export const workStatusOrder: WorkStatus[] = [
  "registered",
  "in_progress",
  "on_hold",
  "canceled",
  "inspection_failed",
  "admin_review_requested",
  "passed",
  "completed"
];
