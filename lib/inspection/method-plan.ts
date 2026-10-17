import type {
  InspectionStatus,
  InspectionTargetType,
  MaterialInspectionMethod,
  WorkInspectionMethod
} from "@/lib/types/domain";

// 서버(검수 행 생성·집계)와 모바일(가시성)이 함께 쓰는 순수 함수 모음. DB·React 의존 없음.

export type PlannedMaterialMethod = "OCR" | "VISION" | "PHOTO";

// 부자재마스터 inspection_method 체크 여부만으로 부자재 검수 항목을 결정한다.
// NONE·NULL·이상값은 BOTH가 아닌 PHOTO로 폴백한다(기준 미등록으로 막히지 않고 관리자 승인으로 항상 진행 가능).
export function planMaterialMethods(method: string | null | undefined): PlannedMaterialMethod[] {
  if (method === "BOTH") return ["OCR", "VISION"];
  if (method === "OCR" || method === "VISION") return [method];
  return ["PHOTO"];
}

// DB 원시값을 마스터 체크 값으로 정규화한다. 이상값·NULL은 NONE(사진검수).
export function normalizeMaterialInspectionMethod(value: unknown): MaterialInspectionMethod {
  return value === "OCR" || value === "VISION" || value === "BOTH" || value === "NONE" ? value : "NONE";
}

// 제품 PHOTO 행(material_id 없음)·완료제품사진(PRODUCT)·부자재 행을 구분한다. target_type 컬럼이 없는 행(조회 컬럼 생략,
// 과거 행)도 method/material_id로 같은 결과를 낸다.
export function getInspectionTargetType(inspection: {
  method: string;
  material_id?: string | null;
  target_type?: string | null;
}): InspectionTargetType {
  if (inspection.target_type === "product" || inspection.target_type === "completion" || inspection.target_type === "material") {
    return inspection.target_type;
  }
  if (inspection.method === "PRODUCT") return "completion";
  if (inspection.method === "PHOTO" && !inspection.material_id) return "product";
  return "material";
}

export function isPhotoMethod(method: string): method is Extract<WorkInspectionMethod, "PHOTO"> {
  return method === "PHOTO";
}

// 제품 식별 키(work_components.id는 작업 수정 시 바뀌므로 코드+LOT 스냅샷으로 비교한다).
export function productKey(code: string, lot: string | null | undefined) {
  return `${code}|${lot ?? ""}`;
}

// ---- 단계별 집계 ----

export type StageCounts = {
  total: number;
  // passed + admin_approved
  passed: number;
  // submitted(PHOTO 승인대기)
  submitted: number;
  // failed + retrying + rejected
  failed: number;
  // admin_requested(확인요청)
  adminRequested: number;
  // 그 외(pending 포함)
  pending: number;
};

export function countStageStatuses(statuses: InspectionStatus[]): StageCounts {
  const counts: StageCounts = { total: statuses.length, passed: 0, submitted: 0, failed: 0, adminRequested: 0, pending: 0 };
  for (const status of statuses) {
    if (status === "passed" || status === "admin_approved") counts.passed += 1;
    else if (status === "submitted") counts.submitted += 1;
    else if (status === "failed" || status === "retrying" || status === "rejected") counts.failed += 1;
    else if (status === "admin_requested") counts.adminRequested += 1;
    else counts.pending += 1;
  }
  return counts;
}

// 단계 전 항목 합격(승인 포함). 항목이 0건이면 미완료.
export function isStageDone(counts: StageCounts) {
  return counts.total > 0 && counts.passed === counts.total;
}

// 조건 R: 미진행·불합격/반려·확인요청 0건 + 승인대기 1건 이상 = 관리자 작업승인 가능.
export function isStageApprovalReady(counts: StageCounts) {
  return counts.pending === 0 && counts.failed === 0 && counts.adminRequested === 0 && counts.submitted >= 1;
}
