import type {
  AdminReviewRequest,
  AppUser,
  Department,
  InspectionImage,
  MaterialInspectionRegion,
  MaterialMaster,
  Shipper,
  Work,
  WorkInspection,
  WorkMaster,
  WorkMasterMaterial,
  WorkerSignature
} from "@/lib/types/domain";

const now = "2026-07-02T09:00:00.000Z";

export const departments: Department[] = [
  { id: "dept-fulfillment", name: "풀필먼트 1팀", is_active: true, sort_order: 1, created_at: now, updated_at: now },
  { id: "dept-package", name: "패키징 센터", is_active: true, sort_order: 2, created_at: now, updated_at: now },
  { id: "dept-quality", name: "품질 지원팀", is_active: true, sort_order: 3, created_at: now, updated_at: now }
];

export const shippers: Shipper[] = [
  { id: "shipper-mint", department_id: "dept-fulfillment", name: "민트하우스", is_active: true, created_at: now, updated_at: now },
  { id: "shipper-cloud", department_id: "dept-fulfillment", name: "구름상점", is_active: true, created_at: now, updated_at: now },
  { id: "shipper-lavender", department_id: "dept-package", name: "라벤더랩", is_active: true, created_at: now, updated_at: now },
  { id: "shipper-cream", department_id: "dept-quality", name: "크림오더", is_active: true, created_at: now, updated_at: now }
];

export const currentUser: AppUser = {
  id: "user-admin",
  name: "서민호",
  email: "admin@example.com",
  role: "admin",
  is_active: true,
  department_ids: ["dept-fulfillment", "dept-package", "dept-quality"],
  shipper_ids: ["shipper-mint", "shipper-cloud", "shipper-lavender", "shipper-cream"],
  created_at: now,
  updated_at: now
};

export const users: AppUser[] = [
  currentUser,
  {
    id: "user-worker",
    name: "현장 작업자",
    email: "worker@example.com",
    role: "worker",
    is_active: true,
    department_ids: ["dept-fulfillment"],
    shipper_ids: ["shipper-mint", "shipper-cloud"],
    created_at: now,
    updated_at: now
  },
  {
    id: "user-viewer",
    name: "검수 조회자",
    email: "viewer@example.com",
    role: "viewer",
    is_active: true,
    department_ids: ["dept-package"],
    shipper_ids: ["shipper-lavender"],
    created_at: now,
    updated_at: now
  }
];

export const materialMasters: MaterialMaster[] = [
  {
    id: "mat-label",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-mint",
    name: "배송 라벨",
    code: "LBL-MT-01",
    lot: "LOT-260701-A",
    inspection_method: "OCR",
    reference_image_path: "material-images/dept-fulfillment/shipper-mint/lbl-mt-01.png",
    ocr_image_path: "material-images/dept-fulfillment/shipper-mint/lbl-mt-01-ocr.png",
    remark: "문서번호 OCR 확인",
    is_active: true
  },
  {
    id: "mat-sticker",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-mint",
    name: "브랜드 스티커",
    code: "STK-MT-02",
    lot: "LOT-260701-B",
    inspection_method: "VISION",
    reference_image_path: "material-images/dept-fulfillment/shipper-mint/stk-mt-02.png",
    vision_image_path: "material-images/dept-fulfillment/shipper-mint/stk-mt-02-vision.png",
    remark: "로고 위치 비전 스캔",
    is_active: true
  },
  {
    id: "mat-manual",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-cloud",
    name: "사용 설명서",
    code: "MAN-CL-03",
    lot: "LOT-260702-A",
    inspection_method: "BOTH",
    reference_image_path: "material-images/dept-fulfillment/shipper-cloud/man-cl-03.png",
    ocr_image_path: "material-images/dept-fulfillment/shipper-cloud/man-cl-03-ocr.png",
    vision_image_path: "material-images/dept-fulfillment/shipper-cloud/man-cl-03-vision.png",
    remark: "OCR/비전 동시 확인",
    is_active: true
  },
  {
    id: "mat-band",
    department_id: "dept-package",
    shipper_id: "shipper-lavender",
    name: "라벤더 밴드",
    code: "BND-LV-01",
    lot: "LOT-260630-C",
    inspection_method: "VISION",
    reference_image_path: "material-images/dept-package/shipper-lavender/bnd-lv-01.png",
    vision_image_path: "material-images/dept-package/shipper-lavender/bnd-lv-01-vision.png",
    remark: "색상/형상 매칭",
    is_active: true
  }
];

export const materialInspectionRegions: MaterialInspectionRegion[] = [
  {
    id: "region-label-doc",
    material_id: "mat-label",
    method: "OCR",
    name: "문서번호 영역",
    roi: { x: 18, y: 22, width: 58, height: 16 },
    expected_text: "DOC-2026",
    options: { match: "contains", caseSensitive: false }
  },
  {
    id: "region-sticker-logo",
    material_id: "mat-sticker",
    method: "VISION",
    name: "로고 비교 영역",
    roi: { x: 25, y: 28, width: 42, height: 36 },
    similarity_threshold: 0.86,
    options: { colorTolerance: 0.12 }
  },
  {
    id: "region-manual-title",
    material_id: "mat-manual",
    method: "OCR",
    name: "매뉴얼 제목",
    roi: { x: 12, y: 18, width: 70, height: 18 },
    expected_text: "CLOUD GUIDE",
    options: { match: "exact" }
  }
];

export const workMasters: WorkMaster[] = [
  {
    id: "wm-basic-pack",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-mint",
    name: "민트 기본 패키징",
    code: "WM-MT-BASIC",
    description: "배송 라벨과 브랜드 스티커를 확인하는 기본 작업",
    is_active: true
  },
  {
    id: "wm-cloud-guide",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-cloud",
    name: "구름 설명서 동봉",
    code: "WM-CL-GUIDE",
    description: "설명서 OCR과 이미지 비교를 함께 확인",
    is_active: true
  },
  {
    id: "wm-lavender-band",
    department_id: "dept-package",
    shipper_id: "shipper-lavender",
    name: "라벤더 밴드 검수",
    code: "WM-LV-BAND",
    description: "밴드 부자재 이미지 매칭",
    is_active: true
  }
];

export const workMasterMaterials: WorkMasterMaterial[] = [
  { id: "wmm-1", work_master_id: "wm-basic-pack", material_id: "mat-label", is_required: true, inspection_order: 1 },
  { id: "wmm-2", work_master_id: "wm-basic-pack", material_id: "mat-sticker", is_required: true, inspection_order: 2 },
  { id: "wmm-3", work_master_id: "wm-cloud-guide", material_id: "mat-manual", is_required: true, inspection_order: 1 },
  { id: "wmm-4", work_master_id: "wm-lavender-band", material_id: "mat-band", is_required: true, inspection_order: 1 }
];

export const works: Work[] = [
  {
    id: "work-1001",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-mint",
    work_master_id: "wm-basic-pack",
    document_no: "DOC-2026-1001",
    work_date: "2026-07-02",
    status: "in_progress",
    worker_name: "김하늘",
    memo: "오전 출고분",
    latest_inspected_at: "2026-07-02T08:30:00.000Z"
  },
  {
    id: "work-1002",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-mint",
    work_master_id: "wm-basic-pack",
    document_no: "DOC-2026-1002",
    work_date: "2026-07-02",
    status: "admin_review_requested",
    worker_name: "박구름",
    memo: "라벨 일부 번짐",
    latest_inspected_at: "2026-07-02T08:50:00.000Z"
  },
  {
    id: "work-1003",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-mint",
    work_master_id: "wm-basic-pack",
    document_no: "DOC-2026-1003",
    work_date: "2026-07-02",
    status: "completed",
    worker_name: "이솜",
    memo: "정상 완료",
    latest_inspected_at: "2026-07-02T09:20:00.000Z"
  },
  {
    id: "work-2001",
    department_id: "dept-fulfillment",
    shipper_id: "shipper-cloud",
    work_master_id: "wm-cloud-guide",
    document_no: "CLD-2026-2001",
    work_date: "2026-07-02",
    status: "inspection_failed",
    worker_name: "최라온",
    memo: "설명서 버전 불일치",
    latest_inspected_at: "2026-07-02T10:10:00.000Z"
  }
];

export const workInspections: WorkInspection[] = [
  {
    id: "insp-1001-label",
    work_id: "work-1001",
    material_id: "mat-label",
    method: "OCR",
    status: "passed",
    ocr_result_text: "DOC-2026-1001",
    result_summary: "문서번호 영역이 기준 텍스트와 일치합니다.",
    attempt_count: 1
  },
  {
    id: "insp-1001-sticker",
    work_id: "work-1001",
    material_id: "mat-sticker",
    method: "VISION",
    status: "pending",
    vision_similarity: 0.81,
    result_summary: "스티커 이미지 촬영을 기다리고 있습니다.",
    attempt_count: 0
  },
  {
    id: "insp-1002-label",
    work_id: "work-1002",
    material_id: "mat-label",
    method: "OCR",
    status: "admin_requested",
    ocr_result_text: "DOC-2026-I002",
    result_summary: "OCR 결과가 흐릿해 관리자 확인을 요청했습니다.",
    attempt_count: 2
  },
  {
    id: "insp-1003-label",
    work_id: "work-1003",
    material_id: "mat-label",
    method: "OCR",
    status: "passed",
    ocr_result_text: "DOC-2026-1003",
    result_summary: "합격",
    attempt_count: 1
  },
  {
    id: "insp-1003-sticker",
    work_id: "work-1003",
    material_id: "mat-sticker",
    method: "VISION",
    status: "admin_approved",
    vision_similarity: 0.84,
    result_summary: "관리자가 기준 이미지와 동일하다고 승인했습니다.",
    attempt_count: 1
  }
];

export const inspectionImages: InspectionImage[] = [
  {
    id: "image-1002-admin",
    work_id: "work-1002",
    inspection_id: "insp-1002-label",
    image_type: "admin_review",
    storage_path: "inspection-images/work-1002/DOC-2026-1002-label.jpg",
    is_compressed: true,
    metadata: { width: 1280, height: 960, mimeType: "image/jpeg" }
  }
];

export const adminReviewRequests: AdminReviewRequest[] = [
  {
    id: "review-1002",
    work_id: "work-1002",
    inspection_id: "insp-1002-label",
    requester_id: "user-worker",
    reason: "라벨이 살짝 번졌지만 현장에서는 사용 가능해 보입니다.",
    status: "requested"
  }
];

export const workerSignatures: WorkerSignature[] = [
  {
    id: "sign-1003",
    work_id: "work-1003",
    worker_id: "user-worker",
    signature_path: "signatures/work-1003/worker-signature.png",
    signed_at: "2026-07-02T09:25:00.000Z"
  }
];
