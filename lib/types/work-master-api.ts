import type { MaterialMaster, WorkMaster } from "@/lib/types/domain";

export type WorkMaterialRowDto = {
  id: string;
  workMasterId: string;
  materialId: string;
  unitQuantity: number;
};

export type ProductUsageRowDto = {
  id: string;
  workMasterId: string;
  productCode: string;
  productName: string;
  unitQuantity: number;
  productType: "정상품" | "샘플" | "세트제품";
};

export type WorkMasterMetaDto = {
  workType: string;
  type: string;
};

export type DraftWorkMasterDto = {
  workType: string;
  code: string;
  type: string;
  name: string;
  description: string;
  isActive: boolean;
};

export type BatchWorkMasterRowDto = DraftWorkMasterDto & {
  productCodes: string[];
  materialCodes: string[];
  unknownMaterialCodes?: string[];
};

export type WorkMasterDataResponse = {
  source: "supabase" | "mock";
  warning?: string;
  workMasters: WorkMaster[];
  materials: MaterialMaster[];
  materialRowsByWork: Record<string, WorkMaterialRowDto[]>;
  productRowsByWork: Record<string, ProductUsageRowDto[]>;
  metaByWork: Record<string, WorkMasterMetaDto>;
};

export type CreateWorkMasterResponse = {
  source: "supabase" | "mock";
  workMaster: WorkMaster;
  materialRows: WorkMaterialRowDto[];
  productRows: ProductUsageRowDto[];
  meta: WorkMasterMetaDto;
  createdMaterials?: MaterialMaster[];
};

export type BatchWorkMasterResponse = {
  source: "supabase" | "mock";
  workMasters: WorkMaster[];
  materialRowsByWork: Record<string, WorkMaterialRowDto[]>;
  productRowsByWork: Record<string, ProductUsageRowDto[]>;
  metaByWork: Record<string, WorkMasterMetaDto>;
  createdMaterials: MaterialMaster[];
};
