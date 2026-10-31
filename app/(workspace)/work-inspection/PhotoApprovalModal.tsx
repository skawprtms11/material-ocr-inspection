"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ImageOff, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { photoApprovalStageLabels } from "@/lib/constants/status";
import type { WorkInspectionStage } from "@/lib/types/domain";
import type {
  InspectionTableRowDto,
  PhotoReviewDecision,
  PhotoReviewItemDto,
  PhotoReviewItemStatus,
  PhotoReviewResponse,
  PhotoReviewWorkDto,
  WorkInspectionAction,
  WorkInspectionActionResponse
} from "@/lib/types/work-inspection-api";

type Props = {
  row: InspectionTableRowDto;
  initialStage: WorkInspectionStage;
  departmentId: string;
  shipperId: string;
  onClose: () => void;
  // 승인/반려가 저장되면 부모 목록을 다시 조회한다.
  onChanged: () => void;
};

type LocalDecision = { decision: "approved" | "rejected"; reason: string };
type Slide = { url: string; caption: string };

const stageTabs: { stage: WorkInspectionStage; label: string }[] = [
  { stage: "start", label: "작업전(시작)" },
  { stage: "complete", label: "완료" }
];

const itemStatusMeta: Record<PhotoReviewItemStatus, { label: string; className: string }> = {
  pending: { label: "미제출", className: "bg-slate-100 text-slate-700 ring-slate-500/20" },
  submitted: { label: "승인대기", className: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  admin_approved: { label: "승인", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  rejected: { label: "반려", className: "bg-red-50 text-red-700 ring-red-600/20" }
};

export function PhotoApprovalModal({ row, initialStage, departmentId, shipperId, onClose, onChanged }: Props) {
  const [stage, setStage] = useState<WorkInspectionStage>(initialStage);
  const [data, setData] = useState<PhotoReviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, LocalDecision>>({});
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});
  const [showWorkReject, setShowWorkReject] = useState(false);
  const [workRejectReason, setWorkRejectReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [lightbox, setLightbox] = useState<{ slides: Slide[]; index: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setLoadError("");

      try {
        const params = new URLSearchParams({
          work_id: row.work.id,
          department_id: departmentId,
          shipper_id: shipperId,
          stage,
          include_history: "true"
        });
        const response = await fetch(`/api/work-inspection/photo?${params.toString()}`);
        const result = (await response.json()) as PhotoReviewResponse & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "사진 검수 데이터를 불러오지 못했습니다.");
        if (!cancelled) {
          setData(result);
          setDecisions({});
        }
      } catch (error) {
        if (!cancelled) {
          setData(null);
          setLoadError(error instanceof Error ? error.message : "사진 검수 데이터를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [row.work.id, departmentId, shipperId, stage, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const submittedItems = items.filter((item) => item.status === "submitted");
  const slides = useMemo<Slide[]>(
    () => items.filter((item) => item.photo?.url).map((item) => ({ url: item.photo!.url, caption: `${item.label} (${item.code})` })),
    [items]
  );

  useEffect(() => {
    if (!lightbox) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
      if (event.key === "ArrowLeft") setLightbox((current) => current && { ...current, index: Math.max(0, current.index - 1) });
      if (event.key === "ArrowRight") {
        setLightbox((current) => current && { ...current, index: Math.min(current.slides.length - 1, current.index + 1) });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  const setDecision = (inspectionId: string, next: LocalDecision | null) => {
    setDecisions((current) => {
      const copy = { ...current };
      if (next) copy[inspectionId] = next;
      else delete copy[inspectionId];
      return copy;
    });
  };

  const decisionEntries = Object.entries(decisions);
  const invalidRejectCount = decisionEntries.filter(([, value]) => value.decision === "rejected" && !value.reason.trim()).length;
  const canSaveDecisions = decisionEntries.length > 0 && invalidRejectCount === 0 && !isSaving;

  const sendAction = async (action: WorkInspectionAction, successMessage: string, failMessage: string) => {
    setIsSaving(true);

    try {
      const response = await fetch("/api/work-inspection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, shipperId, workId: row.work.id, action })
      });
      const result = (await response.json()) as WorkInspectionActionResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? failMessage);

      toast.success(successMessage);
      setShowWorkReject(false);
      setWorkRejectReason("");
      reload();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDecisions = () => {
    const payload: PhotoReviewDecision[] = decisionEntries.map(([inspectionId, value]) => ({
      inspectionId,
      decision: value.decision,
      ...(value.decision === "rejected" ? { reason: value.reason.trim() } : {})
    }));
    void sendAction({ type: "photo_review", decisions: payload }, "선택한 항목을 저장했습니다.", "항목 승인/반려 저장에 실패했습니다.");
  };

  const approveLabel = stage === "complete" ? "완료승인" : "작업승인";
  const readiness = data?.readiness;
  const approveBlockers = getApproveBlockers(readiness, submittedItems.length, decisionEntries.length);
  const canApproveWork = Boolean(readiness?.canApproveWork) && approveBlockers.length === 0 && !isSaving;
  const canRejectWork = submittedItems.length > 0 && !isSaving;

  const productItems = items.filter((item) => item.targetType === "product");
  const materialItems = items.filter((item) => item.targetType === "material");
  const work = data?.work;

  const renderCard = (item: PhotoReviewItemDto) => (
    <PhotoItemCard
      key={item.inspectionId}
      item={item}
      decision={decisions[item.inspectionId]}
      historyOpen={Boolean(openHistory[item.inspectionId])}
      disabled={isSaving}
      onToggleHistory={() => setOpenHistory((current) => ({ ...current, [item.inspectionId]: !current[item.inspectionId] }))}
      onDecision={(next) => setDecision(item.inspectionId, next)}
      onOpenPhoto={() => {
        const index = slides.findIndex((slide) => slide.url === item.photo?.url);
        if (index >= 0) setLightbox({ slides, index });
      }}
      onOpenReference={(url) => setLightbox({ slides: [{ url, caption: `${item.label} 기준 이미지` }], index: 0 })}
      onOpenHistoryPhoto={(url, caption) => setLightbox({ slides: [{ url, caption }], index: 0 })}
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <div className="flex max-h-full w-full max-w-5xl flex-col rounded-lg border border-border bg-card shadow-lg">
        <div className="shrink-0 px-5 pt-5">
          <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">사진 검수 · 관리자 승인</p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{row.work.document_no}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {row.finishedProductName} · {row.quantity.toLocaleString()}개
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="사진 검수 팝업 닫기"
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <X className="size-4" />
            </button>
          </div>

          {work && <WorkSummaryCard work={work} />}

          <div className="mb-3 flex flex-wrap gap-2">
            {stageTabs.map((tab) => (
              <button
                key={tab.stage}
                type="button"
                onClick={() => setStage(tab.stage)}
                className={`h-9 rounded-md px-4 text-sm font-medium ring-1 ring-inset transition-colors ${
                  stage === tab.stage ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-border hover:bg-muted hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
            {readiness && (
              <span className="ml-auto self-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
                승인대기 {submittedItems.length} · 미제출 {readiness.pendingPhotos} · 반려 {readiness.rejectedPhotos} · 사진 외 미완료{" "}
                {readiness.nonPhotoIncomplete} · 확인요청 {readiness.adminRequested}
              </span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 rounded-md border border-border bg-card py-16 text-sm font-medium text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              사진을 불러오는 중입니다.
            </div>
          )}

          {!isLoading && loadError && (
            <div className="flex flex-col items-center gap-3 rounded-md border border-red-200 bg-red-50 py-12 text-center">
              <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">연결 오류</span>
              <p className="text-sm font-medium text-red-700">{loadError}</p>
              <button type="button" onClick={reload} className="rounded-md border border-red-200 bg-card px-4 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50">
                다시 시도
              </button>
            </div>
          )}

          {!isLoading && !loadError && data && (
            <div className="space-y-5">
              {productItems.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">제품 정보 / 사진 ({productItems.length})</h3>
                  {productItems.map(renderCard)}
                </section>
              )}
              {materialItems.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">부자재 정보 / 사진 ({materialItems.length})</h3>
                  {materialItems.map(renderCard)}
                </section>
              )}
              {items.length === 0 && (
                <div className="rounded-md border border-border bg-card py-12 text-center text-sm font-medium text-muted-foreground">
                  이 단계에는 사진검수 항목이 없습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {!isLoading && !loadError && data && (
          <div className="shrink-0 space-y-3 rounded-b-lg border-t border-border bg-card p-4 px-5">
            {approveBlockers.length > 0 && (
              <p className="text-xs font-medium text-amber-800">{approveLabel} 불가: {approveBlockers.join(" / ")}</p>
            )}
            {invalidRejectCount > 0 && <p className="text-xs font-medium text-red-600">반려 사유가 비어 있는 항목이 {invalidRejectCount}건 있습니다.</p>}

            {showWorkReject && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <label className="text-xs font-medium text-red-700" htmlFor="work-reject-reason">
                  작업 반려 사유 (승인대기 {submittedItems.length}건 전체 반려, 필수)
                </label>
                <textarea
                  id="work-reject-reason"
                  value={workRejectReason}
                  onChange={(event) => setWorkRejectReason(event.target.value)}
                  rows={2}
                  maxLength={500}
                  className="mt-2 w-full rounded-md border border-red-200 bg-card px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                  placeholder="모바일 작업자에게 표시됩니다."
                />
                <div className="mt-2 flex justify-end gap-2">
                  <CloudButton type="button" tone="soft" onClick={() => setShowWorkReject(false)}>
                    취소
                  </CloudButton>
                  <CloudButton
                    type="button"
                    tone="danger"
                    disabled={!workRejectReason.trim() || isSaving}
                    onClick={() =>
                      void sendAction(
                        { type: "photo_reject_work", stage, reason: workRejectReason.trim() },
                        "작업을 반려했습니다. 모바일에서 재촬영합니다.",
                        "작업 반려에 실패했습니다."
                      )
                    }
                  >
                    <XCircle className="size-4" />
                    반려 확정
                  </CloudButton>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <CloudButton type="button" tone="soft" className="min-w-24" disabled={!canSaveDecisions} onClick={handleSaveDecisions}>
                <CheckCircle2 className="size-4" />
                선택 저장{decisionEntries.length > 0 ? ` (${decisionEntries.length})` : ""}
              </CloudButton>
              <CloudButton
                type="button"
                tone="success"
                className="min-w-24"
                disabled={!canApproveWork}
                onClick={() => void sendAction({ type: "photo_approve_work", stage }, `${approveLabel} 처리되었습니다.`, `${approveLabel}에 실패했습니다.`)}
              >
                <CheckCircle2 className="size-4" />
                {approveLabel}
              </CloudButton>
              <CloudButton type="button" tone="danger" className="min-w-24" disabled={!canRejectWork} onClick={() => setShowWorkReject(true)}>
                <RotateCcw className="size-4" />
                작업 반려
              </CloudButton>
            </div>
          </div>
        )}
      </div>

      {lightbox && <Lightbox state={lightbox} onChange={setLightbox} />}
    </div>
  );
}

function WorkSummaryCard({ work }: { work: PhotoReviewWorkDto }) {
  const fields: [string, string][] = [
    ["문서번호", work.documentNo],
    ["작업유형", work.workType || "-"],
    ["완성품", `${work.finishedProductName} (${work.finishedProductCode})`],
    ["작업수량", `${work.quantity.toLocaleString()}개`],
    ["완성품 LOT", work.finishedProductLot || "-"],
    ["작업일 / 납기", `${work.workDate || "-"} / ${work.dueDate || "-"}`]
  ];

  return (
    <dl className="mb-3 grid gap-x-4 gap-y-2 rounded-md border border-border bg-card p-3 text-xs sm:grid-cols-3">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="font-medium text-muted-foreground">{label}</dt>
          <dd className="truncate font-medium text-foreground" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function getApproveBlockers(readiness: PhotoReviewResponse["readiness"] | undefined, submittedCount: number, unsavedCount: number) {
  if (!readiness) return [];

  const blockers: string[] = [];
  if (unsavedCount > 0) blockers.push(`저장하지 않은 선택 ${unsavedCount}건`);
  if (readiness.pendingPhotos > 0) blockers.push(`미제출 사진 ${readiness.pendingPhotos}건`);
  if (readiness.rejectedPhotos > 0) blockers.push(`반려 후 재촬영 대기 ${readiness.rejectedPhotos}건`);
  if (readiness.nonPhotoIncomplete > 0) blockers.push(`OCR/비전/완료제품사진 미완료 ${readiness.nonPhotoIncomplete}건`);
  if (readiness.adminRequested > 0) blockers.push(`확인요청 ${readiness.adminRequested}건 처리 필요`);
  if (blockers.length === 0 && submittedCount === 0) blockers.push("승인대기 사진 없음");
  if (blockers.length === 0 && !readiness.canApproveWork) blockers.push("승인 조건 미충족(작업상태 확인)");
  return blockers;
}

function PhotoItemCard({
  item,
  decision,
  historyOpen,
  disabled,
  onToggleHistory,
  onDecision,
  onOpenPhoto,
  onOpenReference,
  onOpenHistoryPhoto
}: {
  item: PhotoReviewItemDto;
  decision?: LocalDecision;
  historyOpen: boolean;
  disabled: boolean;
  onToggleHistory: () => void;
  onDecision: (next: LocalDecision | null) => void;
  onOpenPhoto: () => void;
  onOpenReference: (url: string) => void;
  onOpenHistoryPhoto: (url: string, caption: string) => void;
}) {
  const meta = itemStatusMeta[item.status];
  const history = item.history ?? [];
  const reviewable = item.status === "submitted";
  const isProduct = item.targetType === "product";
  const expected = item.expected;

  const fields: [string, string][] = expected
    ? [
        [isProduct ? "제품코드" : "부자재코드", expected.code],
        [isProduct ? "제품명" : "부자재명", expected.name],
        ["LOT", expected.lot || "-"],
        ["단위수량", expected.unitQuantity.toLocaleString()],
        ["필요수량", expected.requiredQuantity.toLocaleString()],
        ["할당수량", expected.allocatedQuantity.toLocaleString()],
        ...(expected.inspectionMethodLabel ? ([["검수방식", expected.inspectionMethodLabel]] as [string, string][]) : []),
        ["비고", expected.memo || "-"]
      ]
    : [
        [isProduct ? "제품코드" : "부자재코드", item.code],
        [isProduct ? "제품명" : "부자재명", item.label],
        ["LOT", item.lot || "-"]
      ];

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">{isProduct ? "제품" : "부자재"}</span>
        <span className="font-medium text-foreground">{item.label}</span>
        <span className={`ml-auto rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.className}`}>{meta.label}</span>
      </div>

      <dl className="mt-3 grid gap-px overflow-hidden rounded-md bg-border text-xs ring-1 ring-border sm:grid-cols-4">
        {fields.map(([label, value]) => (
          <div key={label} className="bg-card px-3 py-2">
            <dt className="font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 break-words font-medium text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={onOpenPhoto}
          disabled={!item.photo?.url}
          aria-label={`${item.label} 사진 확대`}
          className="flex min-h-48 w-full flex-1 items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border enabled:cursor-zoom-in enabled:hover:opacity-90"
        >
          {item.photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photo.url} alt={`${item.label} 제출 사진`} className="max-h-[280px] w-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs font-medium text-muted-foreground">
              <ImageOff className="size-5" />
              {item.photo ? "미리보기 없음" : "사진 없음"}
            </span>
          )}
        </button>

        {item.referenceImageUrl && (
          <button
            type="button"
            onClick={() => onOpenReference(item.referenceImageUrl!)}
            aria-label={`${item.label} 기준 이미지 확대`}
            className="shrink-0 cursor-zoom-in space-y-1 text-left sm:w-40"
          >
            <span className="block text-[11px] font-medium text-muted-foreground">기준</span>
            <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.referenceImageUrl} alt={`${item.label} 기준 이미지`} className="h-full w-full object-contain" />
            </span>
          </button>
        )}
      </div>

      {item.reviewComment && item.status === "rejected" && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">반려 사유: {item.reviewComment}</p>
      )}

      {history.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={onToggleHistory} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <ChevronDown className={`size-3.5 transition ${historyOpen ? "rotate-180" : ""}`} />
            이전 제출 이력 {history.length}건
          </button>
          {historyOpen && (
            <ul className="mt-2 space-y-2">
              {history.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 rounded-md bg-muted/40 p-2">
                  <button
                    type="button"
                    onClick={() => entry.url && onOpenHistoryPhoto(entry.url, `${item.label} ${entry.submissionNo}차 제출`)}
                    disabled={!entry.url}
                    aria-label={`${entry.submissionNo}차 제출 사진 확대`}
                    className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
                  >
                    {entry.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entry.url} alt={`${item.label} ${entry.submissionNo}차 제출`} className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="text-xs text-foreground">
                    <p className="font-medium text-foreground">
                      {entry.submissionNo}차 · {entry.reviewStatus === "rejected" ? "반려" : entry.reviewStatus === "approved" ? "승인" : "제출"}
                    </p>
                    {entry.reason && <p className="mt-0.5 text-red-700">사유: {entry.reason}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {reviewable && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <CloudButton
              type="button"
              tone={decision?.decision === "approved" ? "success" : "soft"}
              disabled={disabled}
              onClick={() => onDecision(decision?.decision === "approved" ? null : { decision: "approved", reason: "" })}
            >
              <CheckCircle2 className="size-4" />
              승인
            </CloudButton>
            <CloudButton
              type="button"
              tone={decision?.decision === "rejected" ? "danger" : "soft"}
              disabled={disabled}
              onClick={() => onDecision(decision?.decision === "rejected" ? null : { decision: "rejected", reason: decision?.reason ?? "" })}
            >
              <XCircle className="size-4" />
              반려
            </CloudButton>
          </div>
          {decision?.decision === "rejected" && (
            <input
              type="text"
              value={decision.reason}
              onChange={(event) => onDecision({ decision: "rejected", reason: event.target.value })}
              maxLength={300}
              placeholder="반려 사유 (필수)"
              aria-label={`${item.label} 반려 사유`}
              className={`w-full rounded-md border bg-card px-3 py-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 ${
                decision.reason.trim() ? "border-input focus-visible:ring-ring/40" : "border-red-300 focus-visible:ring-red-500/30"
              }`}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Lightbox({
  state,
  onChange
}: {
  state: { slides: Slide[]; index: number };
  onChange: (next: { slides: Slide[]; index: number } | null) => void;
}) {
  const slide = state.slides[state.index];
  const hasPrev = state.index > 0;
  const hasNext = state.index < state.slides.length - 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-6"
      role="dialog"
      aria-label="사진 확대"
      onClick={() => onChange(null)}
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label="확대 닫기"
        className="absolute right-6 top-6 inline-flex size-10 items-center justify-center rounded-full bg-white/90 text-slate-700"
      >
        <X className="size-5" />
      </button>
      {hasPrev && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange({ ...state, index: state.index - 1 });
          }}
          aria-label="이전 사진"
          className="absolute left-6 inline-flex size-12 items-center justify-center rounded-full bg-white/90 text-slate-700"
        >
          <ChevronLeft className="size-6" />
        </button>
      )}
      <div className="flex max-h-full max-w-5xl flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slide.url} alt={slide.caption} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
        <p className="rounded-full bg-white/90 px-4 py-1 text-sm font-medium text-slate-700">
          {slide.caption} ({state.index + 1}/{state.slides.length})
        </p>
      </div>
      {hasNext && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange({ ...state, index: state.index + 1 });
          }}
          aria-label="다음 사진"
          className="absolute right-6 inline-flex size-12 items-center justify-center rounded-full bg-white/90 text-slate-700"
        >
          <ChevronRight className="size-6" />
        </button>
      )}
    </div>
  );
}
