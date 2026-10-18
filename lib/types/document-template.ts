import type { InspectionSetupResult } from "@/lib/server/inspection-setup";

export type DocKind = "work_order";
export type TemplateType = "layout" | "editor" | "file";
export type LayoutKey = "standard" | "bom-detail" | "lot-split";
export type DocumentCodeType = "qr" | "code128" | "none";
export type DocumentCodePosition = "header-right" | "footer";
export type IssueKind = "initial" | "reprint";
// print: 인쇄 라우트, preview: 축소 미리보기(읽기 전용), fill: 모바일 웹문서 작성(예약)
export type DocumentRenderMode = "print" | "preview" | "fill";

export type ApprovalLine = { label: string };

export type DocumentSections = {
  products: boolean;
  materials: boolean;
  memo: boolean;
  signature: boolean;
};

export type BaseLayoutSettings = {
  headerTitle: string;
  headerSubtitle?: string;
  companyName?: string;
  footerNote?: string;
  approvalLines: ApprovalLine[];
  code: { type: DocumentCodeType; position: DocumentCodePosition };
  sections: DocumentSections;
  blankRows?: number;
};

export type StandardLayoutSettings = BaseLayoutSettings;

export type BomDetailLayoutSettings = BaseLayoutSettings & {
  showInspectionMethod: boolean;
};

export type LotSplitLayoutSettings = BaseLayoutSettings & {
  showLotCheckbox: boolean;
};

export type LayoutSettingsMap = {
  standard: StandardLayoutSettings;
  "bom-detail": BomDetailLayoutSettings;
  "lot-split": LotSplitLayoutSettings;
};

export type DocumentLayoutSettings = LayoutSettingsMap[LayoutKey];

export type DocumentTemplate = {
  id: string;
  department_id: string;
  doc_kind: DocKind;
  code: string;
  name: string;
  revision_date: string;
  template_type: TemplateType;
  layout_key: LayoutKey | null;
  settings: Partial<DocumentLayoutSettings>;
  schema_version: number;
  is_active: boolean;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ShipperDocumentTemplate = {
  id: string;
  shipper_id: string;
  template_id: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WorkOrderIssue = {
  id: string;
  work_id: string;
  department_id: string;
  shipper_id: string;
  template_id: string | null;
  template_code: string;
  template_name: string;
  revision_date: string;
  template_type: TemplateType;
  layout_key: LayoutKey | null;
  settings_snapshot: Partial<DocumentLayoutSettings>;
  issue_kind: IssueKind;
  assigned_on_issue: boolean;
  issued_by: string | null;
  issued_by_name: string | null;
  issued_at: string;
};

// ---- 렌더러 공용 데이터 ----

export type WorkOrderLotDto = {
  lot: string;
  allocatedQuantity: number;
  memo: string;
};

export type WorkOrderProductDto = {
  code: string;
  name: string;
  unitQuantity: number;
  requiredQuantity: number;
  lots: WorkOrderLotDto[];
};

export type WorkOrderMaterialDto = {
  code: string;
  name: string;
  unitQuantity: number;
  requiredQuantity: number;
  lot: string;
  allocatedQuantity: number;
  memo: string;
  inspectionMethodLabel?: string;
};

export type WorkOrderPrintDto = {
  document: {
    templateCode: string;
    templateName: string;
    revisionDate: string;
    issueId?: string;
    issuedAt?: string;
    issueSeq?: number;
  };
  work: {
    id: string;
    documentNo: string;
    workType: string;
    workDate: string;
    dueDate: string;
    quantity: number;
    finishedProductLot: string;
    memo: string;
    status: string;
  };
  finished: { code: string; name: string };
  shipper: { code: string; name: string };
  department: { name: string };
  products: WorkOrderProductDto[];
  materials: WorkOrderMaterialDto[];
  // QR 값 = 작업 documentNo(모바일 findWorkByDocumentNo 정확 일치 키)
  codeValue: string;
};

// 렌더러가 받는 양식 최소 형태(DB 행·이력 스냅샷 모두 변환 가능)
export type RenderableTemplate = {
  templateType: TemplateType;
  layoutKey: LayoutKey | null;
  settings: Partial<DocumentLayoutSettings>;
};

// ---- 레이아웃 메타 ----

export type LayoutMetaDto = {
  key: LayoutKey;
  label: string;
  description: string;
  defaultSettings: DocumentLayoutSettings;
};

// ---- API DTO: 문서양식 ----

export type DocumentTemplateListItemDto = DocumentTemplate & { mappedShipperCount: number };

export type DocumentTemplateListResponse = {
  source: "supabase" | "mock";
  warning?: string;
  templates: DocumentTemplateListItemDto[];
  layouts: LayoutMetaDto[];
};

export type CreateDocumentTemplateRequest = {
  departmentId: string;
  code: string;
  name: string;
  revisionDate: string;
  templateType: "layout";
  layoutKey: LayoutKey;
  settings: DocumentLayoutSettings;
  isActive: boolean;
  memo?: string;
  inheritFromTemplateId?: string;
};

export type CreateDocumentTemplateResponse = {
  source: "supabase" | "mock";
  template: DocumentTemplate;
};

export type UpdateDocumentTemplateRequest = {
  departmentId: string;
  code?: string;
  name?: string;
  revisionDate?: string;
  layoutKey?: LayoutKey;
  settings?: DocumentLayoutSettings;
  isActive?: boolean;
  memo?: string;
};

export type UpdateDocumentTemplateResponse = CreateDocumentTemplateResponse;

export type DeleteDocumentTemplateResponse = {
  source: "supabase" | "mock";
  deletedId: string;
  // 기본 매핑을 해제했을 때 자동 승격된 매핑 ID / 승격 불가·실패 경고
  promotedId?: string;
  warning?: string;
};

// ---- API DTO: 화주별 양식 매핑 ----

export type ShipperDocumentMappingDto = ShipperDocumentTemplate & {
  template: DocumentTemplate;
};

export type ShipperDocumentTemplateListResponse = {
  source: "supabase" | "mock";
  warning?: string;
  mappings: ShipperDocumentMappingDto[];
  candidates: DocumentTemplate[];
};

export type CreateShipperDocumentMappingRequest = {
  departmentId: string;
  shipperId: string;
  templateId: string;
  isDefault?: boolean;
};

export type CreateShipperDocumentMappingResponse = {
  source: "supabase" | "mock";
  mapping: ShipperDocumentMappingDto;
};

export type UpdateShipperDocumentMappingRequest = {
  departmentId: string;
  shipperId: string;
  isDefault?: boolean;
  sortOrder?: number;
};

export type UpdateShipperDocumentMappingResponse = CreateShipperDocumentMappingResponse;

export type DeleteShipperDocumentMappingResponse = {
  source: "supabase" | "mock";
  deletedId: string;
};

// ---- API DTO: 작업지시서 출력 ----

export type WorkOrderOptionTemplateDto = {
  mappingId: string;
  isDefault: boolean;
  sortOrder: number;
  template: DocumentTemplate;
};

export type WorkOrderIssueSummaryDto = Pick<
  WorkOrderIssue,
  "id" | "template_code" | "template_name" | "revision_date" | "issue_kind" | "issued_at"
> & { seq: number };

export type WorkOrderOptionsResponse = {
  source: "supabase" | "mock";
  warning?: string;
  work: { id: string; documentNo: string; status: string; assignedAt: string | null };
  templates: WorkOrderOptionTemplateDto[];
  issues: WorkOrderIssueSummaryDto[];
};

export type WorkOrderPrintDataResponse = {
  source: "supabase" | "mock";
  template: RenderableTemplate & { id: string | null };
  data: WorkOrderPrintDto;
};

export type IssueWorkOrderRequest = {
  departmentId: string;
  shipperId: string;
  templateId: string;
};

export type IssueWorkOrderResponse = {
  source: "supabase" | "mock";
  workId: string;
  assigned: boolean;
  assignedAt: string | null;
  inspectionSetup?: InspectionSetupResult;
  issue: { id: string; issuedAt: string; issueKind: IssueKind; seq: number };
  printUrl: string;
};
