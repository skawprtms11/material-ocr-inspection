import type { Work, WorkStatus } from "@/lib/types/domain";

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
