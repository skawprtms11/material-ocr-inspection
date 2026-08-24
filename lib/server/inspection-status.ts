import type { InspectionStatus } from "@/lib/types/domain";
import type { InspectionAggregateStatusDto } from "@/lib/types/work-status-api";

// 작업 하나에 연결된 work_inspections 행들의 상태를 집계해 검수취소/검수완료/검수대기로 판정한다.
// work-status/work-register API가 공유하며, 우선순위는 취소 > 완료 > 대기.
export function getInspectionAggregateStatus(statuses: InspectionStatus[]): InspectionAggregateStatusDto {
  if (statuses.some((status) => status === "admin_requested")) return "canceled";
  if (statuses.length > 0 && statuses.every((status) => status === "passed" || status === "admin_approved")) return "completed";
  return "waiting";
}

// 작업이 "검수완료" 상태일 때 그 시점(=작업 시작일)을 work_inspections.updated_at 최댓값으로 판정한다.
// 검수완료가 아니거나 updated_at이 없으면 undefined(미완료 "-" 표시).
export function getInspectionCompletedAt(rows: { status: InspectionStatus; updated_at?: string }[]): string | undefined {
  if (getInspectionAggregateStatus(rows.map((row) => row.status)) !== "completed") return undefined;

  const timestamps = rows.map((row) => row.updated_at).filter((value): value is string => Boolean(value));
  if (timestamps.length === 0) return undefined;

  return timestamps.reduce((latest, current) => (current > latest ? current : latest));
}
