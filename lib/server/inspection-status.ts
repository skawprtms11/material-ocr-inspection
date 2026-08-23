import type { InspectionStatus } from "@/lib/types/domain";
import type { InspectionAggregateStatusDto } from "@/lib/types/work-status-api";

// 작업 하나에 연결된 work_inspections 행들의 상태를 집계해 검수취소/검수완료/검수대기로 판정한다.
// work-status/work-register API가 공유하며, 우선순위는 취소 > 완료 > 대기.
export function getInspectionAggregateStatus(statuses: InspectionStatus[]): InspectionAggregateStatusDto {
  if (statuses.some((status) => status === "admin_requested")) return "canceled";
  if (statuses.length > 0 && statuses.every((status) => status === "passed" || status === "admin_approved")) return "completed";
  return "waiting";
}
