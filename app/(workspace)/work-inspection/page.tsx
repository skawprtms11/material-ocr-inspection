"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Eye, RotateCcw, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";
import type { AdminReviewRequest, InspectionImage, Work, WorkInspection } from "@/lib/types/domain";
import { formatDate } from "@/lib/utils/format";

type AdjustmentStatus = "requested" | "approved" | "rejected" | "retry_requested";

type InspectionTableRow = {
  work: Work;
  registeredAt: string;
  workType: string;
  finishedProductCode: string;
  finishedProductName: string;
  quantity: number;
  inspectionStep: string;
  request?: AdminReviewRequest;
  inspections: WorkInspection[];
  images: InspectionImage[];
  adjustmentStatus?: AdjustmentStatus;
};

const workTypeOptions = ["리드레싱", "세트작업", "해체작업", "기타작업"];

const adjustmentLabels: Record<AdjustmentStatus, { label: string; className: string }> = {
  requested: { label: "확인요청", className: "bg-amber-100 text-amber-800 ring-amber-200" },
  approved: { label: "조정승인", className: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  rejected: { label: "조정 미승인", className: "bg-rose-100 text-rose-700 ring-rose-200" },
  retry_requested: { label: "재검수 요청", className: "bg-sky-100 text-sky-700 ring-sky-200" }
};

function getInspectionStep(work: Work, inspections: WorkInspection[], adjustmentStatus?: AdjustmentStatus) {
  if (adjustmentStatus === "approved") return "관리자 조정승인";
  if (adjustmentStatus === "rejected") return "재검수 필요";
  if (adjustmentStatus === "retry_requested") return "재검수 요청";
  if (inspections.some((inspection) => inspection.status === "admin_requested") || work.status === "admin_review_requested") {
    return "확인요청";
  }
  if (inspections.some((inspection) => inspection.status === "failed" || inspection.status === "retrying")) return "불일치/재검수";
  if (work.status === "completed" || work.status === "passed") return "검수완료";
  if (inspections.some((inspection) => inspection.status === "passed" || inspection.status === "admin_approved")) return "검수진행";
  if (work.status === "in_progress") return "모바일 검수중";
  return "검수대기";
}

function getStepClassName(step: string) {
  if (step.includes("완료") || step.includes("승인")) return "bg-emerald-100 text-emerald-700";
  if (step.includes("요청")) return "bg-amber-100 text-amber-800";
  if (step.includes("불일치") || step.includes("재검수")) return "bg-rose-100 text-rose-700";
  if (step.includes("진행") || step.includes("모바일")) return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

export default function WorkInspectionPage() {
  const { departmentId, shipperId } = useFilterStore();
  const [selectedRow, setSelectedRow] = useState<InspectionTableRow | null>(null);
  const [adjustments, setAdjustments] = useState<Record<string, AdjustmentStatus>>({});

  const tableRows = useMemo(() => {
    const works = appRepository.listWorks({ departmentId, shipperId });
    const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });
    const requests = appRepository.listAdminReviewRequests();

    return works.map((work, index) => {
      const workMaster = workMasters.find((item) => item.id === work.work_master_id);
      const request = requests.find((item) => item.work_id === work.id);
      const inspections = appRepository.listInspections(work.id);
      const images = appRepository.listInspectionImages(work.id);
      const adjustmentStatus = request ? adjustments[request.id] ?? request.status : undefined;

      return {
        work,
        registeredAt: work.work_date,
        workType: workTypeOptions[index % workTypeOptions.length],
        finishedProductCode: workMaster?.code ?? "-",
        finishedProductName: workMaster?.name ?? "-",
        quantity: 80 + index * 25,
        inspectionStep: getInspectionStep(work, inspections, adjustmentStatus),
        request,
        inspections,
        images,
        adjustmentStatus
      } satisfies InspectionTableRow;
    });
  }, [adjustments, departmentId, shipperId]);

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  const handleAdjustment = (requestId: string, status: AdjustmentStatus) => {
    setAdjustments((current) => ({ ...current, [requestId]: status }));
    setSelectedRow(null);

    if (status === "approved") toast.success("조정승인 처리되었습니다.");
    if (status === "rejected") toast.error("조정 미승인 처리되었습니다. 사용자는 재검수를 진행해야 합니다.");
    if (status === "retry_requested") toast.warning("재검수 요청으로 처리되었습니다.");
  };

  return (
    <>
      <PageHeader
        title="작업검수"
        description="모바일 검수 단계와 OCR/비전 확인 요청을 표에서 확인하고 관리자가 조정 처리합니다."
      />

      <CuteCard className="p-0">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-800">
              <ClipboardCheck className="size-5 text-sky-500" />
              작업 검수 목록
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              조정확인 요청은 모바일 OCR/비전 불일치 시 현장에서 올라온 관리자 확인 요청입니다.
            </p>
          </div>
          <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
            확인요청 {tableRows.filter((row) => row.adjustmentStatus === "requested").length}건
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
              <tr>
                {["등록일자", "작업구분", "문서번호", "완성품코드", "완성품명", "작업수량", "검수단계", "조정확인"].map((header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/70">
              {tableRows.map((row) => {
                const adjustment = row.adjustmentStatus ? adjustmentLabels[row.adjustmentStatus] : undefined;

                return (
                  <tr key={row.work.id} className="text-slate-600 transition hover:bg-sky-50/70">
                    <td className="px-4 py-3 font-bold">{formatDate(row.registeredAt)}</td>
                    <td className="px-4 py-3 font-black text-slate-800">{row.workType}</td>
                    <td className="px-4 py-3 font-black text-sky-700">{row.work.document_no}</td>
                    <td className="px-4 py-3 font-bold">{row.finishedProductCode}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{row.finishedProductName}</td>
                    <td className="px-4 py-3 font-bold">{row.quantity.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${getStepClassName(row.inspectionStep)}`}>
                        {row.inspectionStep}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {adjustment && row.request ? (
                        <button
                          type="button"
                          onClick={() => setSelectedRow(row)}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ring-1 transition hover:scale-[1.02] ${adjustment.className}`}
                        >
                          <Eye className="size-3.5" />
                          {adjustment.label}
                        </button>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">요청없음</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    선택된 부서/화주에 표시할 검수 작업이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CuteCard>

      {selectedRow?.request && (
        <AdjustmentReviewModal
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onApprove={() => handleAdjustment(selectedRow.request!.id, "approved")}
          onReject={() => handleAdjustment(selectedRow.request!.id, "rejected")}
          onRetry={() => handleAdjustment(selectedRow.request!.id, "retry_requested")}
        />
      )}
    </>
  );
}

function AdjustmentReviewModal({
  row,
  onClose,
  onApprove,
  onReject,
  onRetry
}: {
  row: InspectionTableRow;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const request = row.request!;
  const image = row.images[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-amber-600">관리자 확인</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{row.work.document_no}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              OCR/비전 불일치로 현장에서 확인 요청한 내용을 검토하고 조정 처리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="관리자 확인 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-[1.2rem] bg-white/75 p-4 text-sm sm:grid-cols-2">
              <InfoItem label="작업구분" value={row.workType} />
              <InfoItem label="완성품코드" value={row.finishedProductCode} />
              <InfoItem label="완성품명" value={row.finishedProductName} />
              <InfoItem label="작업수량" value={`${row.quantity.toLocaleString()}개`} />
            </div>

            <div className="rounded-[1.2rem] bg-amber-50 p-4">
              <p className="text-xs font-black text-amber-700">현장 확인 요청 사유</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{request.reason}</p>
            </div>

            <div className="overflow-hidden rounded-[1.2rem] border border-white/80 bg-white/75">
              <table className="w-full text-left text-xs">
                <thead className="bg-sky-50/80 font-black text-sky-700">
                  <tr>
                    <th className="px-4 py-3">검수방식</th>
                    <th className="px-4 py-3">판정상태</th>
                    <th className="px-4 py-3">OCR/비전 결과</th>
                    <th className="px-4 py-3">요약</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {row.inspections.map((inspection) => (
                    <tr key={inspection.id} className="text-slate-600">
                      <td className="px-4 py-3 font-black text-slate-800">{inspection.method}</td>
                      <td className="px-4 py-3 font-bold">{inspection.status}</td>
                      <td className="px-4 py-3">
                        {inspection.method === "OCR"
                          ? inspection.ocr_result_text ?? "-"
                          : `${Math.round((inspection.vision_similarity ?? 0) * 100)}%`}
                      </td>
                      <td className="px-4 py-3">{inspection.result_summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[1.2rem] bg-white/75 p-4">
            <p className="text-xs font-black text-slate-500">검수 이미지</p>
            <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-2xl bg-gradient-to-br from-sky-50 to-amber-50 p-4 text-center text-sm font-black text-slate-400">
              이미지 미리보기 영역
            </div>
            <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-500">
              Storage path:
              <br />
              {image?.storage_path ?? `inspection-images/${row.work.id}/${row.work.document_no}.jpg`}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <CloudButton type="button" tone="success" onClick={onApprove}>
            <CheckCircle2 className="size-4" />
            조정승인
          </CloudButton>
          <CloudButton type="button" tone="warning" onClick={onRetry}>
            <RotateCcw className="size-4" />
            재검수 요청
          </CloudButton>
          <CloudButton type="button" tone="danger" onClick={onReject}>
            <XCircle className="size-4" />
            조정 미승인
          </CloudButton>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black text-slate-400">{label}</p>
      <p className="mt-1 font-black text-slate-800">{value}</p>
    </div>
  );
}
