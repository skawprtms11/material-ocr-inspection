"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Eye, RotateCcw, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { useFilterStore } from "@/lib/state/filter-store";
import type { WorkInspectionActionResponse, WorkInspectionDataResponse } from "@/lib/types/work-inspection-api";
import type { InspectionTableRowDto } from "@/lib/types/work-inspection-api";
import { formatDate } from "@/lib/utils/format";

type AdjustmentStatus = "requested" | "approved" | "rejected" | "retry_requested";
type InspectionTableRow = InspectionTableRowDto;

const adjustmentLabels: Record<AdjustmentStatus, { label: string; className: string }> = {
  requested: { label: "확인요청", className: "bg-amber-100 text-amber-800 ring-amber-200" },
  approved: { label: "조정승인", className: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
  rejected: { label: "조정 미승인", className: "bg-rose-100 text-rose-700 ring-rose-200" },
  retry_requested: { label: "재검수 요청", className: "bg-sky-100 text-sky-700 ring-sky-200" }
};

function getStepClassName(step: string) {
  if (step.includes("완료") || step.includes("승인")) return "bg-emerald-100 text-emerald-700";
  if (step.includes("대상")) return "bg-violet-100 text-violet-700";
  if (step.includes("보류") || step.includes("취소")) return "bg-slate-100 text-slate-600";
  if (step.includes("요청")) return "bg-amber-100 text-amber-800";
  if (step.includes("불일치") || step.includes("재검수")) return "bg-rose-100 text-rose-700";
  if (step.includes("진행") || step.includes("모바일")) return "bg-sky-100 text-sky-700";
  return "bg-slate-100 text-slate-600";
}

export default function WorkInspectionPage() {
  const { departmentId, shipperId } = useFilterStore();
  const [selectedRow, setSelectedRow] = useState<InspectionTableRow | null>(null);
  const [tableRows, setTableRows] = useState<InspectionTableRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock">("mock");

  const loadRows = useCallback(async () => {
    if (!departmentId || !shipperId) return;

    setIsLoading(true);

    try {
      const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
      const response = await fetch(`/api/work-inspection?${params.toString()}`);
      if (!response.ok) throw new Error("작업검수 데이터를 불러오지 못했습니다.");
      const data = (await response.json()) as WorkInspectionDataResponse;
      setTableRows(data.rows);
      setDataSource(data.source);
      setSelectedRow(null);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업검수 데이터를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [departmentId, shipperId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  const handleInspectionComplete = async (row: InspectionTableRow) => {
    try {
      const response = await fetch("/api/work-inspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId: row.work.id, action: { type: "complete" } })
      });
      const result = (await response.json()) as WorkInspectionActionResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "검수완료 저장에 실패했습니다.");

      setSelectedRow(null);
      toast.success("검수완료 처리되었습니다. 작업현황은 진행 상태로 자동 변경됩니다.");
      await loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "검수완료 저장에 실패했습니다.");
    }
  };

  const handleAdjustment = async (row: InspectionTableRow, status: AdjustmentStatus) => {
    if (!row.request) return;

    try {
      const response = await fetch("/api/work-inspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workId: row.work.id,
          action: { type: "adjustment", requestId: row.request.id, status }
        })
      });
      const result = (await response.json()) as WorkInspectionActionResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "조정 처리 저장에 실패했습니다.");

      setSelectedRow(null);
      if (status === "approved") toast.success("조정승인 및 검수완료 처리되었습니다. 작업현황은 진행 상태로 자동 변경됩니다.");
      if (status === "rejected") toast.error("조정 미승인 처리되었습니다. 사용자는 재검수를 진행해야 합니다.");
      if (status === "retry_requested") toast.warning("재검수 요청으로 처리되었습니다.");
      await loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "조정 처리 저장에 실패했습니다.");
    }
  };

  return (
    <>
      <PageHeader
        title="작업검수"
        description="모바일 검수 단계와 OCR/비전 확인 요청을 표에서 확인하고 관리자가 조정 처리합니다."
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
        <span>{isLoading ? "작업검수 데이터를 불러오는 중이에요." : "선택된 부서/화주 기준으로 검수 작업을 조회합니다."}</span>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-100">
          데이터: {dataSource === "supabase" ? "Supabase" : "Mock/Fallback"}
        </span>
      </div>

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
            검수대상 {tableRows.filter((row) => row.inspectionStep === "검수대상").length}건
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
              <tr>
                {["등록일자", "작업구분", "문서번호", "완성품코드", "완성품명", "작업수량", "검수단계", "검수처리", "조정확인"].map((header) => (
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
                      <CloudButton
                        type="button"
                        tone={row.inspectionCompleted ? "success" : "soft"}
                        disabled={row.work.status === "canceled" || row.work.status === "completed"}
                        onClick={() => handleInspectionComplete(row)}
                      >
                        <CheckCircle2 className="size-4" />
                        {row.inspectionCompleted ? "완료처리됨" : "검수완료"}
                      </CloudButton>
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
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
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
          onApprove={() => handleAdjustment(selectedRow, "approved")}
          onReject={() => handleAdjustment(selectedRow, "rejected")}
          onRetry={() => handleAdjustment(selectedRow, "retry_requested")}
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
