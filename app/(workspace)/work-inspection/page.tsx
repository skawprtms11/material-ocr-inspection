"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, ClipboardCheck, Eye, RotateCcw, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { OcrTextCompare } from "@/components/inspection/OcrTextCompare";
import { getWorkStatusLabel, inspectionStatusLabels, photoApprovalStageLabels, workInspectionMethodLabels } from "@/lib/constants/status";
import { useFilterStore } from "@/lib/state/filter-store";
import type { WorkInspectionStage } from "@/lib/types/domain";
import type { WorkInspectionActionResponse, WorkInspectionDataResponse } from "@/lib/types/work-inspection-api";
import type { InspectionTableRowDto, PendingReviewRequestDto } from "@/lib/types/work-inspection-api";
import { formatDate } from "@/lib/utils/format";
import { PhotoApprovalModal } from "./PhotoApprovalModal";

type AdjustmentStatus = "requested" | "approved" | "rejected" | "retry_requested";
type InspectionTableRow = InspectionTableRowDto;

const adjustmentLabels: Record<AdjustmentStatus, { label: string; className: string }> = {
  requested: { label: "확인요청", className: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  approved: { label: "조정승인", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  rejected: { label: "조정 미승인", className: "bg-red-50 text-red-700 ring-red-600/20" },
  retry_requested: { label: "재검수 요청", className: "bg-blue-50 text-blue-700 ring-blue-600/20" }
};

const photoStages: WorkInspectionStage[] = ["start", "complete"];
const photoLockedStatuses = ["canceled", "on_hold", "completed", "passed"];

// 목록의 "사진 확인" 진입 시 먼저 보여줄 단계: 승인대기 사진이 있는 단계 우선, 없으면 작업상태 기준.
function getDefaultPhotoStage(row: InspectionTableRow): WorkInspectionStage {
  const start = row.photoReview?.start?.submittedPhotos ?? 0;
  const complete = row.photoReview?.complete?.submittedPhotos ?? 0;
  if (start > 0) return "start";
  if (complete > 0) return "complete";
  return row.work.status === "in_progress" ? "complete" : "start";
}

function getStepClassName(step: string) {
  if (step.includes("반려")) return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20";
  if (step.includes("승인대기")) return "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20";
  if (step.includes("완료") || step.includes("승인")) return "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20";
  if (step.includes("대상")) return "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20";
  if (step.includes("보류") || step.includes("취소")) return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-500/20";
  if (step.includes("요청")) return "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20";
  if (step.includes("불일치") || step.includes("재검수")) return "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20";
  if (step.includes("진행") || step.includes("모바일")) return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20";
  return "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-500/20";
}

export default function WorkInspectionPage() {
  const { departmentId, shipperId } = useFilterStore();
  const [selectedRow, setSelectedRow] = useState<InspectionTableRow | null>(null);
  const [photoTarget, setPhotoTarget] = useState<{ row: InspectionTableRow; stage: WorkInspectionStage } | null>(null);
  const [tableRows, setTableRows] = useState<InspectionTableRow[]>([]);
  const [pendingReviewRequests, setPendingReviewRequests] = useState<PendingReviewRequestDto[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [compareItem, setCompareItem] = useState<PendingReviewRequestDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock" | null>(null);
  const [loadError, setLoadError] = useState(false);

  const loadRows = useCallback(async () => {
    if (!departmentId || !shipperId) return;

    setIsLoading(true);

    try {
      const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
      const response = await fetch(`/api/work-inspection?${params.toString()}`);
      const data = (await response.json()) as WorkInspectionDataResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "작업검수 데이터를 불러오지 못했습니다.");
      setTableRows(data.rows);
      setPendingReviewRequests(data.pendingReviewRequests ?? []);
      setDataSource(data.source);
      setSelectedRow(null);
      setLoadError(false);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "작업검수 데이터를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [departmentId, shipperId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  const photoApprovalQueue = tableRows.flatMap((row) =>
    photoStages.flatMap((stage) => {
      const summary = row.photoReview?.[stage];
      return summary && summary.submittedPhotos > 0 ? [{ row, stage, summary }] : [];
    })
  );

  const handlePendingReviewProcess = async (item: PendingReviewRequestDto, status: "approved" | "retry_requested" | "rejected") => {
    setProcessingRequestId(item.requestId);

    try {
      const response = await fetch("/api/work-inspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId,
          shipperId,
          workId: item.workId,
          action: { type: "adjustment", requestId: item.requestId, status, inspectionId: item.inspectionId }
        })
      });
      const result = (await response.json()) as WorkInspectionActionResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "확인요청 처리에 실패했습니다.");

      if (status === "approved") toast.success("검수승인 처리되었습니다.");
      if (status === "retry_requested") toast.warning("재검수 대상으로 되돌렸습니다.");
      if (status === "rejected") toast.error("반려 처리되었습니다. 현장에서 재검수를 진행해야 합니다.");
      setCompareItem(null);
      await loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "확인요청 처리에 실패했습니다.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleAdjustment = async (row: InspectionTableRow, status: AdjustmentStatus) => {
    if (!row.request) return;

    try {
      const response = await fetch("/api/work-inspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId,
          shipperId,
          workId: row.work.id,
          action: { type: "adjustment", requestId: row.request.id, status }
        })
      });
      const result = (await response.json()) as WorkInspectionActionResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "조정 처리 저장에 실패했습니다.");

      setSelectedRow(null);
      if (status === "approved") toast.success(
          result.workStatus ? `조정승인 및 검수완료 처리되었습니다. 작업 상태: ${getWorkStatusLabel(result.workStatus)}` : "조정승인 및 검수완료 처리되었습니다."
        );
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
        description="모바일 검수 단계와 확인 요청을 확인하고, 제출된 제품·부자재 사진을 관리자가 승인/반려합니다."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>{isLoading ? "작업검수 데이터를 불러오는 중입니다." : "선택된 부서/화주 기준으로 검수 작업을 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 ring-1 ring-inset ${loadError ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button type="button" onClick={() => void loadRows()} className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-red-700 transition-colors hover:bg-red-100">
              다시 시도
            </button>
          )}
        </div>
      </div>

      {pendingReviewRequests.length > 0 && (
        <CuteCard className="mb-4 p-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <AlertTriangle className="size-5 text-amber-600" />
            <h2 className="text-base font-semibold text-foreground">확인요청 {pendingReviewRequests.length}건</h2>
            <p className="text-sm text-muted-foreground">현장에서 검수 중 특이사항을 확인 요청한 건입니다.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
                <tr>
                  {["문서번호", "부자재/제품명", "검수방식", "일치율", "요청사유", "요청시각", "처리"].map((header) => (
                    <th key={header} className={`h-10 whitespace-nowrap px-4${header === "일치율" ? " text-right" : ""}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pendingReviewRequests.map((item) => (
                  <tr key={item.requestId} className="text-foreground">
                    <td className="px-4 py-2.5 font-medium text-primary">{item.documentNo}</td>
                    <td className="px-4 py-2.5 text-foreground">{item.materialName}</td>
                    <td className="px-4 py-2.5">{item.method}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {typeof item.ocr?.matchRate === "number" ? (
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium tabular-nums ring-1 ring-inset ${
                            item.ocr.matchRate >= item.ocr.threshold ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-orange-50 text-orange-700 ring-orange-600/20"
                          }`}
                        >
                          {item.ocr.matchRate}%
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{item.reason}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {item.requestedAt ? formatDate(item.requestedAt, "yyyy.MM.dd HH:mm") : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        {item.ocr && (
                          <CloudButton type="button" tone="soft" onClick={() => setCompareItem(item)}>
                            <Eye className="size-4" />
                            비교
                          </CloudButton>
                        )}
                        <CloudButton
                          type="button"
                          tone="success"
                          disabled={processingRequestId === item.requestId}
                          onClick={() => void handlePendingReviewProcess(item, "approved")}
                        >
                          <CheckCircle2 className="size-4" />
                          검수승인
                        </CloudButton>
                        <CloudButton
                          type="button"
                          tone="warning"
                          disabled={processingRequestId === item.requestId}
                          onClick={() => void handlePendingReviewProcess(item, "retry_requested")}
                        >
                          <RotateCcw className="size-4" />
                          재검수
                        </CloudButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CuteCard>
      )}

      {compareItem?.ocr && (
        <OcrCompareModal
          item={compareItem}
          processing={processingRequestId === compareItem.requestId}
          onClose={() => setCompareItem(null)}
          onProcess={(status) => void handlePendingReviewProcess(compareItem, status)}
        />
      )}

      {photoApprovalQueue.length > 0 && (
        <CuteCard className="mb-4 p-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-4">
            <Camera className="size-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-foreground">사진 승인대기 {photoApprovalQueue.length}건</h2>
            <p className="text-sm text-muted-foreground">현장에서 제출한 제품·부자재 사진의 승인을 기다리는 작업입니다.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
                <tr>
                  {["문서번호", "단계", "제출", "반려", "사진 외 미완료", "제출시각", "처리"].map((header) => (
                    <th key={header} className={`h-10 whitespace-nowrap px-4${["제출", "반려", "사진 외 미완료"].includes(header) ? " text-right" : ""}`}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {photoApprovalQueue.map(({ row, stage, summary }) => (
                  <tr key={`${row.work.id}-${stage}`} className="text-foreground">
                    <td className="px-4 py-2.5 font-medium text-primary">{row.work.document_no}</td>
                    <td className="px-4 py-2.5 text-foreground">{photoApprovalStageLabels[stage]}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {summary.submittedPhotos + summary.approvedPhotos}/{summary.totalPhotos}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{summary.rejectedPhotos}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{summary.nonPhotoIncomplete}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {summary.latestSubmittedAt ? formatDate(summary.latestSubmittedAt, "yyyy.MM.dd HH:mm") : "-"}
                    </td>
                    <td className="px-4 py-2.5">
                      <CloudButton type="button" tone="primary" onClick={() => setPhotoTarget({ row, stage })}>
                        <Camera className="size-4" />
                        사진 확인
                      </CloudButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CuteCard>
      )}

      <CuteCard className="p-0">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ClipboardCheck className="size-5 text-primary" />
              작업 검수 목록
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              조정확인 요청은 모바일 OCR/비전 불일치 시 현장에서 올라온 관리자 확인 요청입니다.
            </p>
          </div>
          <span className="w-fit rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium tabular-nums text-amber-800 ring-1 ring-inset ring-amber-600/20">
            검수대상 {tableRows.filter((row) => row.inspectionStep === "검수대상").length}건
          </span>
        </div>

        <div className="overflow-x-auto">
          {/* 목록 표: 셀 줄바꿈을 막고 좌우 여백을 줄여 1440px 화면에서 처리 버튼·조정확인 열까지 보이게 한다. */}
          <table className="w-full min-w-[1080px] text-left text-sm [&_td]:whitespace-nowrap [&_td]:px-3 [&_th]:px-3">
            <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
              <tr>
                {["등록일자", "작업구분", "문서번호", "완성품코드", "완성품명", "작업수량", "검수단계", "사진검수/승인", "조정확인"].map((header) => (
                  <th key={header} className={`h-10 whitespace-nowrap px-4${header === "작업수량" ? " text-right" : ""}`}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tableRows.map((row) => {
                const adjustment = row.adjustmentStatus ? adjustmentLabels[row.adjustmentStatus] : undefined;

                return (
                  <tr key={row.work.id} className="text-foreground transition-colors hover:bg-muted/40">
                    <td className="px-4 py-2.5">{formatDate(row.registeredAt)}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.workType}</td>
                    <td className="px-4 py-2.5 font-medium text-primary">{row.work.document_no}</td>
                    <td className="px-4 py-2.5">{row.finishedProductCode}</td>
                    <td className="px-4 py-2.5 text-foreground">{row.finishedProductName}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.quantity.toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${getStepClassName(row.inspectionStep)}`}>
                        {row.inspectionStep}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <CloudButton
                          type="button"
                          tone="soft"
                          onClick={() => setPhotoTarget({ row, stage: getDefaultPhotoStage(row) })}
                        >
                          <Camera className="size-4" />
                          사진 확인
                        </CloudButton>
                        <CloudButton
                          type="button"
                          tone={row.inspectionCompleted ? "success" : "primary"}
                          disabled={
                            photoLockedStatuses.includes(row.work.status) || (row.photoReview?.complete?.submittedPhotos ?? 0) === 0
                          }
                          title="완료단계 사진이 제출되면 승인할 수 있습니다."
                          onClick={() => setPhotoTarget({ row, stage: "complete" })}
                        >
                          <CheckCircle2 className="size-4" />
                          {row.inspectionCompleted ? "완료됨" : "완료승인"}
                        </CloudButton>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {adjustment && row.request ? (
                        <button
                          type="button"
                          onClick={() => setSelectedRow(row)}
                          className={`inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors hover:brightness-95 ${adjustment.className}`}
                        >
                          <Eye className="size-3.5" />
                          {adjustment.label}
                        </button>
                      ) : (
                        <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">요청없음</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    선택된 부서/화주에 표시할 검수 작업이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CuteCard>

      {photoTarget && (
        <PhotoApprovalModal
          key={`${photoTarget.row.work.id}-${photoTarget.stage}`}
          row={photoTarget.row}
          initialStage={photoTarget.stage}
          departmentId={departmentId}
          shipperId={shipperId}
          onClose={() => setPhotoTarget(null)}
          onChanged={() => void loadRows()}
        />
      )}

      {selectedRow?.request && (
        <AdjustmentReviewModal
          row={selectedRow}
          ocrEvidence={pendingReviewRequests.filter((item) => item.workId === selectedRow.work.id && item.ocr)}
          onClose={() => setSelectedRow(null)}
          onApprove={() => handleAdjustment(selectedRow, "approved")}
          onReject={() => handleAdjustment(selectedRow, "rejected")}
          onRetry={() => handleAdjustment(selectedRow, "retry_requested")}
        />
      )}
    </>
  );
}

function OcrCompareModal({
  item,
  processing,
  onClose,
  onProcess
}: {
  item: PendingReviewRequestDto;
  processing: boolean;
  onClose: () => void;
  onProcess: (status: "approved" | "retry_requested" | "rejected") => void;
}) {
  const ocr = item.ocr!;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">OCR 확인요청 비교</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {item.documentNo} · {item.materialName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="OCR 비교 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">촬영 사진</p>
            {ocr.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ocr.imageUrl} alt="OCR 촬영 사진" className="mt-3 w-full rounded-md border border-border" />
            ) : (
              <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-md bg-muted text-sm font-medium text-muted-foreground">
                저장된 촬영 사진 없음
              </div>
            )}
          </div>
          <div className="rounded-md border border-border bg-card p-4">
            <OcrTextCompare
              expectedText={ocr.expectedText}
              expectedSource={ocr.expectedSource}
              recognizedText={ocr.recognizedText}
              matchRate={ocr.matchRate}
              threshold={ocr.threshold}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <CloudButton type="button" tone="success" className="min-w-24" disabled={processing} onClick={() => onProcess("approved")}>
            <CheckCircle2 className="size-4" />
            승인
          </CloudButton>
          <CloudButton type="button" tone="warning" className="min-w-24" disabled={processing} onClick={() => onProcess("retry_requested")}>
            <RotateCcw className="size-4" />
            재검수
          </CloudButton>
          <CloudButton type="button" tone="danger" className="min-w-24" disabled={processing} onClick={() => onProcess("rejected")}>
            <XCircle className="size-4" />
            반려
          </CloudButton>
        </div>
      </div>
    </div>
  );
}

function AdjustmentReviewModal({
  row,
  ocrEvidence,
  onClose,
  onApprove,
  onReject,
  onRetry
}: {
  row: InspectionTableRow;
  ocrEvidence: PendingReviewRequestDto[];
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const request = row.request!;
  const image = row.images[0];
  const evidenceImageUrl = ocrEvidence.find((item) => item.ocr?.imageUrl)?.ocr?.imageUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-5xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">관리자 확인</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{row.work.document_no}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              OCR/비전 불일치로 현장에서 확인 요청한 내용을 검토하고 조정 처리합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="관리자 확인 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-md border border-border bg-card p-4 text-sm sm:grid-cols-2">
              <InfoItem label="작업구분" value={row.workType} />
              <InfoItem label="완성품코드" value={row.finishedProductCode} />
              <InfoItem label="완성품명" value={row.finishedProductName} />
              <InfoItem label="작업수량" value={`${row.quantity.toLocaleString()}개`} />
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-medium text-amber-800">현장 확인 요청 사유</p>
              <p className="mt-2 text-sm font-medium leading-6 text-foreground">{request.reason}</p>
            </div>

            {ocrEvidence.map((item) => (
              <div key={item.requestId} className="rounded-md border border-border bg-card p-4">
                <p className="mb-2 text-xs font-medium text-muted-foreground">OCR 비교 · {item.materialName}</p>
                <OcrTextCompare
                  expectedText={item.ocr!.expectedText}
                  expectedSource={item.ocr!.expectedSource}
                  recognizedText={item.ocr!.recognizedText}
                  matchRate={item.ocr!.matchRate}
                  threshold={item.ocr!.threshold}
                />
              </div>
            ))}

            <div className="overflow-x-auto rounded-md border border-border bg-card">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="whitespace-nowrap px-4 h-10">검수방식</th>
                    <th className="whitespace-nowrap px-4 h-10">판정상태</th>
                    <th className="whitespace-nowrap px-4 h-10">OCR/비전 결과</th>
                    <th className="whitespace-nowrap px-4 h-10">기준 텍스트</th>
                    <th className="whitespace-nowrap px-4 h-10 text-right">일치율</th>
                    <th className="whitespace-nowrap px-4 h-10">요약</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {row.inspections.map((inspection) => (
                    <tr key={inspection.id} className="text-foreground">
                      <td className="px-4 py-2.5 font-medium text-foreground">{workInspectionMethodLabels[inspection.method] ?? inspection.method}</td>
                      <td className="px-4 py-2.5">{inspectionStatusLabels[inspection.status] ?? inspection.status}</td>
                      <td className="px-4 py-2.5">
                        {inspection.method === "OCR"
                          ? inspection.ocr_result_text ?? "-"
                          : inspection.method === "VISION"
                            ? `${Math.round((inspection.vision_similarity ?? 0) * 100)}%`
                            : "-"}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {inspection.method === "OCR"
                          ? (inspection.ocrExpectedText ?? "-") +
                            (inspection.ocrExpectedSource && inspection.ocrExpectedSource !== "none"
                              ? ` (${inspection.ocrExpectedSource === "work" ? "작업등록" : "마스터"})`
                              : "")
                          : inspection.materialVerificationValue || "-"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {inspection.method === "OCR" && typeof inspection.ocr_match_rate === "number" ? `${inspection.ocr_match_rate}%` : "-"}
                      </td>
                      <td className="px-4 py-2.5">{inspection.result_summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">검수 이미지</p>
            {evidenceImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={evidenceImageUrl} alt="OCR 촬영 사진" className="mt-3 w-full rounded-md border border-border" />
            ) : (
              <>
                <div className="mt-3 flex aspect-[4/3] items-center justify-center rounded-md bg-muted p-4 text-center text-sm font-medium text-muted-foreground">
                  이미지 미리보기 영역
                </div>
                <div className="mt-3 rounded-md bg-muted p-3 text-xs leading-5 text-muted-foreground">
                  Storage path:
                  <br />
                  {image?.storage_path ?? `inspection-images/${row.work.id}/${row.work.document_no}.jpg`}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <CloudButton type="button" tone="success" className="min-w-24" onClick={onApprove}>
            <CheckCircle2 className="size-4" />
            조정승인
          </CloudButton>
          <CloudButton type="button" tone="warning" className="min-w-24" onClick={onRetry}>
            <RotateCcw className="size-4" />
            재검수 요청
          </CloudButton>
          <CloudButton type="button" tone="danger" className="min-w-24" onClick={onReject}>
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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}
