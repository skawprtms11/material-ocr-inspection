export type Role = "admin" | "manager" | "worker" | "viewer";
export type InspectionMethod = "OCR" | "VISION" | "BOTH";
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
  | "admin_approved";
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
};

export type MaterialInspectionRegion = {
  id: string;
  material_id: string;
  method: Exclude<InspectionMethod, "BOTH">;
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

export type WorkInspection = {
  id: string;
  work_id: string;
  material_id: string;
  method: Exclude<InspectionMethod, "BOTH">;
  status: InspectionStatus;
  ocr_result_text?: string;
  vision_similarity?: number;
  result_summary: string;
  attempt_count: number;
};

export type InspectionImage = {
  id: string;
  work_id: string;
  inspection_id: string;
  image_type: "ocr_capture" | "vision_capture" | "admin_review";
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
};

export type WorkerSignature = {
  id: string;
  work_id: string;
  worker_id: string;
  signature_path: string;
  signed_at: string;
};
