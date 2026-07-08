import type { Work, WorkStatus } from "@/lib/types/domain";

export type DisplayWorkStatusDto = "waiting" | "progress" | "hold" | "cancel" | "complete";

export type WorkStatusRowDto = {
  work: Work & {
    work_type?: string;
    quantity?: number;
    finished_product_lot?: string;
  };
  displayStatus: DisplayWorkStatusDto;
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
