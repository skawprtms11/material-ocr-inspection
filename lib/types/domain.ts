export type Role = "admin" | "manager" | "worker" | "viewer";
// 부자재마스터 inspection_method(체크 값). NONE = OCR·비전 모두 미체크 → 사진검수(PHOTO) 대상.
export type MaterialInspectionMethod = "OCR" | "VISION" | "BOTH" | "NONE";
export type InspectionMethod = MaterialInspectionMethod;
// work_inspections.method. PHOTO = 사진검수(관리자 승인), PRODUCT = 완료제품사진(자동 합격).
export type WorkInspectionMethod = "OCR" | "VISION" | "PRODUCT" | "PHOTO";
// work_inspections.target_type. 값이 없는 과거 행은 material(PRODUCT 행은 completion)로 취급한다.
export type InspectionTargetType = "material" | "product" | "completion";
export type WorkStatus =
  | "registered"
  | "in_progress"
  | "on_hold"
  | "canceled"
  | "inspection_failed"
  | "admin_review_requested"
  | "passed"
  | "completed";
export type InspectionStatus =
  | "pending"
  | "passed"
  | "failed"
  | "retrying"
  | "admin_requested"
  | "admin_approved"
  // PHOTO 항목 전용: submitted = 사진 제출(승인대기), rejected = 관리자 반려(재촬영 필요).
  | "submitted"
  | "rejected";
export type AdminReviewStatus = "requested" | "approved" | "retry_requested" | "rejected";

export type RoiRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Department = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Shipper = {
  id: string;
  department_id: string;
  code: string;
  name: string;
  foreman_name: string;
  crew_leader_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  department_ids: string[];
  shipper_ids: string[];
  created_at: string;
  updated_at: string;
};

export type MaterialMaster = {
  id: string;
  department_id: string;
  shipper_id: string;
  name: string;
  code: string;
  lot?: string;
  inspection_method: InspectionMethod;
  reference_image_path: string;
  ocr_image_path?: string;
  vision_image_path?: string;
  remark?: string;
  is_active: boolean;
  verification_value: string;
};

export type MaterialInspectionRegion = {
  id: string;
  material_id: string;
  method: "OCR" | "VISION";
  name: string;
  roi: RoiRect;
  expected_text?: string;
  similarity_threshold?: number;
  options: Record<string, unknown>;
};

export type WorkMaster = {
  id: string;
  department_id: string;
  shipper_id: string;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
};

export type WorkMasterMaterial = {
  id: string;
  work_master_id: string;
  material_id: string;
  is_required: boolean;
  inspection_order: number;
};

export type Work = {
  id: string;
  department_id: string;
  shipper_id: string;
  work_master_id: string;
  document_no: string;
  work_date: string;
  status: WorkStatus;
  worker_name: string;
  memo: string;
  latest_inspected_at?: string;
};

// start: 작업시작 전 검수(기존), complete: 작업완료 시 검수(신규). DB 컬럼 work_inspections.stage,
// 마이그레이션 전 기존 행에는 값이 없어 옵셔널로 두고 미지정 시 "start"로 취급한다.
export type WorkInspectionStage = "start" | "complete";

export type WorkInspection = {
  id: string;
  work_id: string;
  // 제품 PHOTO·완료제품사진 행은 material_id가 없다(DB NULL → 빈 문자열로 매핑).
  material_id: string;
  // PRODUCT: 완료검수 전용 "완료제품사진" 항목(material_id 없음, 체크리스트 없이 사진 1장 무조건 저장).
  // PHOTO: 사진검수 항목(제품 구성 행별 또는 NONE 부자재). 제출 → 관리자 승인/반려.
  method: WorkInspectionMethod;
  status: InspectionStatus;
  stage?: WorkInspectionStage;
  target_type?: InspectionTargetType;
  // target_type="product" 행의 제품 스냅샷(work_components.id는 작업 수정 시 바뀌어 FK 대신 값으로 보관).
  product_code?: string;
  product_name?: string;
  product_lot?: string;
  // 최근 반려 사유(재제출 중 유지, 승인 시 비움)
  review_comment?: string;
  submitted_at?: string;
  reviewed_at?: string;
  ocr_result_text?: string;
  // OCR 판정 당시 기준 텍스트 스냅샷과 최근 일치율(%, 0~100). 기존 행은 없음.
  ocr_expected_text?: string;
  ocr_match_rate?: number;
  vision_similarity?: number;
  result_summary: string;
  attempt_count: number;
};

export type InspectionImage = {
  id: string;
  work_id: string;
  inspection_id: string;
  // completion_photo: 완료검수 사진(완료제품사진 또는 부자재 비전 완료검수 사진) 저장 시 사용.
  // photo_review: PHOTO 항목 제출 사진(반려 사진은 이력으로 보존).
  image_type: "ocr_capture" | "vision_capture" | "admin_review" | "product" | "completion_photo" | "photo_review";
  storage_path: string;
  is_compressed: boolean;
  metadata: Record<string, unknown>;
};

export type AdminReviewRequest = {
  id: string;
  work_id: string;
  inspection_id: string;
  requester_id: string;
  reason: string;
  status: AdminReviewStatus;
  admin_id?: string;
  admin_comment?: string;
  processed_at?: string;
  created_at?: string;
};

export type WorkerSignature = {
  id: string;
  work_id: string;
  worker_id: string;
  signature_path: string;
  signed_at: string;
};
