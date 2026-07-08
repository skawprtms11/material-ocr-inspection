import type { AppUser, MaterialMaster, WorkMaster } from "@/lib/types/domain";
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
};
