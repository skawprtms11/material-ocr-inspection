import type { AdminReviewRequest, InspectionImage, Work, WorkInspection } from "@/lib/types/domain";

export type AdjustmentStatusDto = "requested" | "approved" | "rejected" | "retry_requested";

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
  inspections: WorkInspection[];
  images: InspectionImage[];
  adjustmentStatus?: AdjustmentStatusDto;
  inspectionCompleted: boolean;
};

export type WorkInspectionDataResponse = {
  source: "supabase" | "mock";
  warning?: string;
  rows: InspectionTableRowDto[];
};

export type WorkInspectionAction =
  | {
      type: "complete";
    }
  | {
      type: "adjustment";
      requestId: string;
      status: AdjustmentStatusDto;
    };

export type WorkInspectionActionResponse = {
  source: "supabase" | "mock";
  workId: string;
  requestId?: string;
  status?: AdjustmentStatusDto;
};
