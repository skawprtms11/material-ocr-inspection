import type { AppUser, MaterialMaster, WorkMaster } from "@/lib/types/domain";
import type { InspectionSetupResult } from "@/lib/server/inspection-setup";
import type { ProductUsageRowDto, WorkMaterialRowDto, WorkMasterMetaDto } from "@/lib/types/work-master-api";

export type ComponentKindDto = "제품" | "부자재";

export type WorkComponentRowDto = {
  rowId: string;
  groupId: string;
  kind: ComponentKindDto;
  code: string;
  name: string;
  unitQuantity: number;
  requiredQuantity: number;
  lot: string;
  allocatedQuantity: number;
  memo: string;
  // 부자재 행 전용 OCR 검수 텍스트(OCR 대상 부자재는 필수, 그 외는 서버가 무시). 기존 호출 호환을 위해 선택 필드.
  ocrExpectedText?: string;
};

// 작업지시서 출력 이력 집계(GET 목록 전용). 이력이 없으면 null.
export type WorkOrderSummaryDto = {
  issueCount: number;
  lastIssuedAt: string;
  lastTemplateName: string;
};

export type PendingAssignmentWorkDto = {
  id: string;
  registeredAt: string;
  workMasterId: string;
  workType: string;
  documentNo: string;
  finishedProductCode: string;
  finishedProductName: string;
  finishedProductLot: string;
  quantity: number;
  dueDate: string;
  memo: string;
  componentRows?: WorkComponentRowDto[];
  assignedAt?: string | null;
  workOrder?: WorkOrderSummaryDto | null;
};

export type WorkRegisterDataResponse = {
  source: "supabase" | "mock";
  warning?: string;
  pendingWorks: PendingAssignmentWorkDto[];
  workMasters: WorkMaster[];
  materials: MaterialMaster[];
  users: AppUser[];
  materialRowsByWork: Record<string, WorkMaterialRowDto[]>;
  productRowsByWork: Record<string, ProductUsageRowDto[]>;
  metaByWork: Record<string, WorkMasterMetaDto>;
};

export type CreateWorkRegistrationRequest = {
  departmentId: string;
  shipperId: string;
  workMasterId: string;
  workType: string;
  documentNo: string;
  finishedProductLot: string;
  quantity: number;
  dueDate: string;
  memo: string;
  componentRows: WorkComponentRowDto[];
};

export type CreateWorkRegistrationResponse = {
  source: "supabase" | "mock";
  work: PendingAssignmentWorkDto;
  inspectionSetup?: InspectionSetupResult;
};
