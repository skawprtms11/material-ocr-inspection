import type { WorkOrderPrintDto } from "@/lib/types/document-template";

// 문서마스터 미리보기 전용 고정 샘플. 실제 작업 데이터와 무관하다.
export const SAMPLE_WORK_ORDER_DTO: WorkOrderPrintDto = {
  document: {
    templateCode: "WO-SAMPLE",
    templateName: "작업지시서 샘플",
    revisionDate: "2026-01-01",
    issuedAt: "2026-01-01T09:00:00.000Z",
    issueSeq: 1
  },
  work: {
    id: "sample-work",
    documentNo: "WO-20260101-001",
    workType: "세트 포장",
    workDate: "2026-01-01",
    dueDate: "2026-01-03",
    quantity: 1200,
    finishedProductLot: "FP260101A",
    memo: "샘플 비고입니다. 포장 전 라벨 위치를 확인하세요.",
    status: "registered"
  },
  finished: { code: "FG-1001", name: "샘플 세트 상품" },
  shipper: { code: "SHP-SAMPLE", name: "샘플화주" },
  department: { name: "샘플부서" },
  products: [
    {
      code: "PRD-001",
      name: "샘플 제품 A",
      unitQuantity: 1,
      requiredQuantity: 1200,
      lots: [
        { lot: "A260101-1", allocatedQuantity: 700, memo: "" },
        { lot: "A260101-2", allocatedQuantity: 500, memo: "" }
      ]
    },
    {
      code: "PRD-002",
      name: "샘플 제품 B",
      unitQuantity: 2,
      requiredQuantity: 2400,
      lots: [{ lot: "B260101-1", allocatedQuantity: 2400, memo: "" }]
    }
  ],
  materials: [
    {
      code: "MAT-001",
      name: "샘플 박스",
      unitQuantity: 1,
      requiredQuantity: 1200,
      lot: "BX260101",
      allocatedQuantity: 1200,
      memo: "",
      inspectionMethodLabel: "OCR"
    },
    {
      code: "MAT-002",
      name: "샘플 라벨",
      unitQuantity: 1,
      requiredQuantity: 1200,
      lot: "LB260101",
      allocatedQuantity: 1200,
      memo: "앞면 부착",
      inspectionMethodLabel: "비전"
    },
    {
      code: "MAT-003",
      name: "샘플 완충재",
      unitQuantity: 2,
      requiredQuantity: 2400,
      lot: "CS260101",
      allocatedQuantity: 2400,
      memo: "",
      inspectionMethodLabel: "사진"
    }
  ],
  codeValue: "WO-20260101-001"
};
