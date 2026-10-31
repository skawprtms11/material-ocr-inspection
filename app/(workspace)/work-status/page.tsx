"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, ChevronDown, CirclePause, Clock3, Filter, ListChecks, Loader2, PlayCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { useFilterStore } from "@/lib/state/filter-store";
import { dashboardWorkStatusOptions } from "@/lib/state/work-flow-store";
import { getDisplayStatus, getWorkStatusLabel, inspectionMethodLabels, type ReviewKind } from "@/lib/constants/status";
import { getCurrentYearMonth, isYearMonthMatch } from "@/lib/utils/date";
import type { InspectionStatus, Work, WorkInspectionStage, WorkStatus } from "@/lib/types/domain";
import type {
  DisplayWorkStatusDto,
  InspectionAggregateStatusDto,
  UpdateWorkStatusResponse,
  WorkDetailCompletionPhotoDto,
  WorkDetailMaterialDto,
  WorkDetailProductDto,
  WorkDetailProductsSourceDto,
  WorkDetailResponse,
  WorkStatusDataResponse
} from "@/lib/types/work-status-api";

type WorkStatusFilter = {
  year: string;
  month: string;
  workType: string;
  documentNo: string;
  productCode: string;
  productName: string;
  lot: string;
};

type DisplayStatus = DisplayWorkStatusDto;

type WorkStatusRow = {
  work: Work;
  displayStatus: DisplayStatus;
  // 화면에 배지로 표시하지는 않는다(2026-08 제거). 작업상태 드롭다운에서 "대기"를 되돌릴 수 있는지
  // 판정하는 가드(getSelectableStatusOptions)에만 쓴다.
  inspectionStatus: InspectionAggregateStatusDto;
  workType: string;
  productCode: string;
  productName: string;
  lot: string;
  quantity: number;
  workStartedAt?: string;
  completedAt?: string;
  // 확인요청/사진 승인대기가 걸린 검수 단계. reviewKind에 따라 "검수확인중"/"완료확인중" 또는 "작업승인대기"/"완료승인대기"로 표시.
  reviewStage?: WorkInspectionStage;
  reviewKind?: ReviewKind;
};

const workTypeOptions = ["리드레싱", "세트작업", "해체작업", "기타작업"];

const displayStatusMeta: Record<
  DisplayStatus,
  { label: string; icon: typeof Clock3; badge: string; iconBox: string }
> = {
  waiting: {
    label: "대기",
    icon: Clock3,
    badge: "bg-slate-100 text-slate-700 ring-slate-500/20",
    iconBox: "bg-slate-200 text-slate-600"
  },
  progress: {
    label: "진행",
    icon: PlayCircle,
    badge: "bg-blue-50 text-blue-700 ring-blue-600/20",
    iconBox: "bg-primary text-primary-foreground"
  },
  hold: {
    label: "보류",
    icon: CirclePause,
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20",
    iconBox: "bg-amber-500 text-white"
  },
  cancel: {
    label: "취소",
    icon: Ban,
    badge: "bg-red-50 text-red-700 ring-red-600/20",
    iconBox: "bg-red-500 text-white"
  },
  complete: {
    label: "완료",
    icon: CheckCircle2,
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    iconBox: "bg-emerald-500 text-white"
  }
};

function includesText(value: string, keyword: string) {
  return value.toLowerCase().includes(keyword.trim().toLowerCase());
}

function getSelectableWorkStatus(status: WorkStatus): WorkStatus {
  if (status === "inspection_failed" || status === "admin_review_requested") return "on_hold";
  if (status === "passed") return "completed";
  return status;
}

// 상태 모델: 진행/완료는 검수 결과에 따라 시스템이 자동으로만 전이한다(서버도 동일하게 막음, app/api/work-status/route.ts).
// 사용자가 수동으로 고를 수 있는 값은 현재 상태와 시작검수 완료 여부에 따라 달라진다.
// - 시작검수 미완료: 대기/보류/취소
// - 시작검수 완료: 보류/취소(대기로 되돌릴 수 없음)
// - 보류/취소 상태: "보류 해제"/"취소 해제"(서버가 검수 집계로 대기/진행 등을 재판정)를 항상 선택할 수 있다.
function getSelectableStatusOptions(inspectionStatus: InspectionAggregateStatusDto, workStatus: WorkStatus) {
  const releaseLabel = workStatus === "on_hold" ? "보류 해제" : workStatus === "canceled" ? "취소 해제" : undefined;
  const canRelease = releaseLabel !== undefined;
  const manualStatuses: WorkStatus[] =
    inspectionStatus === "completed" && !canRelease ? ["on_hold", "canceled"] : ["registered", "on_hold", "canceled"];

  return dashboardWorkStatusOptions
    .filter((option) => manualStatuses.includes(option.value))
    .map((option) => (option.value === "registered" && releaseLabel ? { ...option, label: releaseLabel } : option));
}

function getFallbackFinishedProductLot(work: Work, index: number) {
  return `LOT-${work.work_date.replaceAll("-", "").slice(2)}-${String(index + 1).padStart(2, "0")}`;
}

// 표 폭이 좁아 MM/DD로 짧게 표기한다. 값이 없으면 "-".
function formatShortDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function summarizeRows(rows: WorkStatusRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.displayStatus] += 1;
      return acc;
    },
    {
      total: 0,
      waiting: 0,
      progress: 0,
      hold: 0,
      cancel: 0,
      complete: 0
    } satisfies Record<DisplayStatus | "total", number>
  );
}

export default function WorkStatusPage() {
  const { departmentId, shipperId } = useFilterStore();
  const defaultYearMonth = useMemo(() => getCurrentYearMonth(), []);
  const [rows, setRows] = useState<WorkStatusRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock" | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<WorkStatusFilter>({
    year: defaultYearMonth.year,
    month: defaultYearMonth.month,
    workType: "",
    documentNo: "",
    productCode: "",
    productName: "",
    lot: ""
  });
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusMenuWorkId, setStatusMenuWorkId] = useState<string | null>(null);
  const [detailWorkId, setDetailWorkId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!departmentId || !shipperId) return;

    setIsLoading(true);

    try {
      const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
      const response = await fetch(`/api/work-status?${params.toString()}`);
      const data = (await response.json()) as WorkStatusDataResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "작업현황 데이터를 불러오지 못했습니다.");
      setRows(data.rows);
      setDataSource(data.source);
      setLoadError(false);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "작업현황 데이터를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [departmentId, shipperId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const yearOptions = useMemo(() => {
    const years = new Set(rows.map((row) => new Date(row.work.work_date).getFullYear()).filter((year) => !Number.isNaN(year)));
    years.add(Number(defaultYearMonth.year));
    return Array.from(years)
      .sort((a, b) => b - a)
      .map(String);
  }, [defaultYearMonth.year, rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const yearMonthMatched = isYearMonthMatch(row.work.work_date, filters.year, filters.month);
      const workTypeMatched = filters.workType ? row.workType === filters.workType : true;
      const documentMatched = filters.documentNo ? includesText(row.work.document_no, filters.documentNo) : true;
      const productCodeMatched = filters.productCode ? includesText(row.productCode, filters.productCode) : true;
      const productNameMatched = filters.productName ? includesText(row.productName, filters.productName) : true;
      const lotMatched = filters.lot ? includesText(row.lot, filters.lot) : true;

      return yearMonthMatched && workTypeMatched && documentMatched && productCodeMatched && productNameMatched && lotMatched;
    });
  }, [filters, rows]);

  const summary = summarizeRows(filteredRows);
  const completionRate = summary.total > 0 ? Math.round((summary.complete / summary.total) * 100) : 0;
  const hasDetailFilters = Boolean(
    filters.workType || filters.documentNo.trim() || filters.productCode.trim() || filters.productName.trim() || filters.lot.trim()
  );

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  const handleStatusChange = async (workId: string, status: WorkStatus) => {
    try {
      const response = await fetch("/api/work-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, shipperId, workId, status })
      });
      const result = (await response.json()) as UpdateWorkStatusResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업상태 저장에 실패했습니다.");

      // 보류 해제처럼 서버가 검수 집계로 다시 판정한 경우를 반영하려고 요청값이 아닌 응답 상태를 쓴다.
      const savedStatus = result.status ?? status;

      setRows((current) =>
        current.map((row) =>
          row.work.id === workId
            ? {
                ...row,
                work: { ...row.work, status: savedStatus },
                displayStatus: getDisplayStatus(savedStatus),
                // 해제 결과가 확인요청 대기면 단계 표시는 다음 조회에서 채워지므로 우선 지운다.
                reviewStage: undefined,
                reviewKind: undefined,
                // 서버는 완료 그룹 전환이 아니면 완료일자를 초기화한다.
                completedAt: getDisplayStatus(savedStatus) === "complete" ? new Date().toISOString() : undefined
              }
            : row
        )
      );
      setDataSource(result.source);
      setStatusMenuWorkId(null);
      toast.success(
        status === "registered"
          ? `보류/취소가 해제되어 ${dashboardWorkStatusOptions.find((option) => option.value === savedStatus)?.label ?? "대기"} 상태가 되었습니다.`
          : `작업상태가 ${dashboardWorkStatusOptions.find((option) => option.value === status)?.label ?? "변경"} 처리되었습니다.`
      );
      if (savedStatus !== status) void loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업상태 저장에 실패했습니다.");
    }
  };

  const cards = [
    { label: "전체", value: summary.total, icon: ListChecks, tone: "text-blue-700 bg-blue-50" },
    { label: "대기", value: summary.waiting, icon: Clock3, tone: "text-slate-700 bg-slate-100" },
    { label: "진행", value: summary.progress, icon: PlayCircle, tone: "text-blue-700 bg-blue-50" },
    { label: "보류", value: summary.hold, icon: CirclePause, tone: "text-amber-700 bg-amber-50" },
    { label: "취소", value: summary.cancel, icon: Ban, tone: "text-red-700 bg-red-50" },
    { label: "완료", value: summary.complete, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-50" }
  ];

  return (
    <>
      <PageHeader
        title="작업현황"
        description="월별 작업 현황을 표로 확인하고 상세 조건으로 빠르게 조회합니다."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              value={filters.year}
              onChange={(event) => setFilters((current) => ({ ...current, year: event.target.value }))}
              className="h-9 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="작업현황 조회 년도"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
            <select
              value={filters.month}
              onChange={(event) => setFilters((current) => ({ ...current, month: event.target.value }))}
              className="h-9 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="작업현황 조회 월"
            >
              {Array.from({ length: 12 }).map((_, index) => {
                const month = String(index + 1).padStart(2, "0");
                return (
                  <option key={month} value={month}>
                    {index + 1}월
                  </option>
                );
              })}
            </select>
            <CloudButton type="button" tone={hasDetailFilters ? "warning" : "soft"} onClick={() => setDetailOpen(true)}>
              <Filter className="size-4" />
              상세필터
            </CloudButton>
          </div>
        }
      />

      {hasDetailFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          <Search className="size-4" />
          상세필터 적용중
          {filters.workType && <span className="rounded-md bg-card px-2 py-0.5 ring-1 ring-inset ring-amber-600/20">작업구분 {filters.workType}</span>}
          {filters.documentNo && <span className="rounded-md bg-card px-2 py-0.5 ring-1 ring-inset ring-amber-600/20">문서번호 {filters.documentNo}</span>}
          {filters.productCode && <span className="rounded-md bg-card px-2 py-0.5 ring-1 ring-inset ring-amber-600/20">완성품코드 {filters.productCode}</span>}
          {filters.productName && <span className="rounded-md bg-card px-2 py-0.5 ring-1 ring-inset ring-amber-600/20">완성품명 {filters.productName}</span>}
          {filters.lot && <span className="rounded-md bg-card px-2 py-0.5 ring-1 ring-inset ring-amber-600/20">LOT {filters.lot}</span>}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
        <span>{isLoading ? "작업현황 데이터를 불러오는 중입니다." : "선택된 부서/화주 기준으로 작업현황을 조회합니다."}</span>
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

      <CuteCard className="mb-4 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-[180px] items-center justify-between gap-4 rounded-md bg-muted px-4 py-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">완료율</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">{completionRate}%</p>
            </div>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${completionRate}%` }} />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-3 gap-2 md:grid-cols-6">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
                  <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${card.tone}`}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-foreground">{card.label}</p>
                    <p className="text-base font-semibold tabular-nums text-foreground">{card.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CuteCard>

      <CuteCard className="p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">작업현황</h2>
            <p className="mt-1 text-sm text-muted-foreground">선택한 기간과 상세필터 기준으로 조회됩니다.</p>
          </div>
          <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{filteredRows.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap px-3 h-10">작업시작</th>
                <th className="w-20 whitespace-nowrap px-2 h-10">작업상태</th>
                {["작업구분", "문서번호", "완성품코드", "완성품명", "LOT"].map((header) => (
                  <th key={header} className="whitespace-nowrap px-4 h-10">
                    {header}
                  </th>
                ))}
                <th className="h-10 whitespace-nowrap px-4 text-right">작업수량</th>
                <th className="whitespace-nowrap px-3 h-10">완료일자</th>
                <th className="whitespace-nowrap px-4 h-10">비고</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => {
                const status = displayStatusMeta[row.displayStatus];
                const Icon = status.icon;
                // 확인요청/사진 승인대기 중이면 "보류" 대신 단계별 라벨("검수확인중"·"작업승인대기" 등), 사진 반려면 "반려"를 보여준다(색/아이콘은 유지).
                const statusLabel =
                  row.work.status === "admin_review_requested" && row.reviewStage
                    ? getWorkStatusLabel(row.work.status, row.reviewStage, row.reviewKind)
                    : row.work.status === "inspection_failed" && row.reviewKind === "photo"
                      ? "반려"
                      : status.label;

                return (
                  <tr key={row.work.id} className="text-foreground transition-colors hover:bg-muted/40">
                    <td className="whitespace-nowrap px-3 py-2.5">{formatShortDate(row.workStartedAt)}</td>
                    <td className="px-2 py-2.5">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          onClick={() => setStatusMenuWorkId((current) => (current === row.work.id ? null : row.work.id))}
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors hover:brightness-95 ${status.badge}`}
                          aria-haspopup="menu"
                          aria-expanded={statusMenuWorkId === row.work.id}
                          aria-label={`${row.work.document_no} 작업상태 변경`}
                        >
                          <span className={`inline-flex size-5 items-center justify-center rounded-full ${status.iconBox}`}>
                            <Icon className="size-3" />
                          </span>
                          {statusLabel}
                          <ChevronDown className="size-3" />
                        </button>

                        {statusMenuWorkId === row.work.id && (
                          <div className="absolute left-0 top-full z-30 mt-2 w-36 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                            {getSelectableStatusOptions(row.inspectionStatus, row.work.status).map((option) => {
                              const optionStatus = displayStatusMeta[getDisplayStatus(option.value)];
                              const OptionIcon = optionStatus.icon;
                              const selected = getSelectableWorkStatus(row.work.status) === option.value;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => handleStatusChange(row.work.id, option.value)}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-accent ${
                                    selected ? "bg-accent text-accent-foreground" : "text-foreground"
                                  }`}
                                >
                                  <span className={`inline-flex size-6 items-center justify-center rounded-full ${optionStatus.iconBox}`}>
                                    <OptionIcon className="size-3.5" />
                                  </span>
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{row.workType}</td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDetailWorkId(row.work.id);
                        }}
                        className="font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:text-primary/80"
                      >
                        {row.work.document_no}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">{row.productCode}</td>
                    <td className="px-4 py-2.5 text-foreground">{row.productName}</td>
                    <td className="max-w-[240px] px-4 py-2.5 font-medium text-foreground">{row.lot || "-"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.quantity.toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{formatShortDate(row.completedAt)}</td>
                    <td className="max-w-[280px] truncate px-4 py-2.5 text-muted-foreground">{row.work.memo || "-"}</td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    조회 조건에 맞는 작업현황이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CuteCard>

      {detailOpen && (
        <DetailFilterModal
          filters={filters}
          onClose={() => setDetailOpen(false)}
          onApply={(nextFilters) => {
            setFilters(nextFilters);
            setDetailOpen(false);
          }}
          onReset={() => {
            setFilters({
              year: defaultYearMonth.year,
              month: defaultYearMonth.month,
              workType: "",
              documentNo: "",
              productCode: "",
              productName: "",
              lot: ""
            });
            setDetailOpen(false);
          }}
          yearOptions={yearOptions}
        />
      )}

      {detailWorkId && <WorkDetailModal workId={detailWorkId} onClose={() => setDetailWorkId(null)} />}
    </>
  );
}

const materialStatusMeta: Record<
  "pass" | "wait" | "fail" | "adminRequest" | "submitted" | "rejected",
  { label: string; badge: string }
> = {
  pass: { label: "합격", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  wait: { label: "대기", badge: "bg-slate-100 text-slate-700 ring-slate-500/20" },
  fail: { label: "불합격", badge: "bg-red-50 text-red-700 ring-red-600/20" },
  adminRequest: { label: "관리자요청", badge: "bg-orange-50 text-orange-700 ring-orange-600/20" },
  submitted: { label: "승인대기", badge: "bg-indigo-50 text-indigo-700 ring-indigo-600/20" },
  rejected: { label: "반려", badge: "bg-red-50 text-red-700 ring-red-600/20" }
};

function summarizeMaterialStatus(statuses: InspectionStatus[]): keyof typeof materialStatusMeta {
  if (statuses.length === 0) return "wait";
  if (statuses.some((status) => status === "admin_requested")) return "adminRequest";
  if (statuses.some((status) => status === "rejected")) return "rejected";
  if (statuses.some((status) => status === "failed" || status === "retrying")) return "fail";
  if (statuses.some((status) => status === "submitted")) return "submitted";
  if (statuses.every((status) => status === "passed" || status === "admin_approved")) return "pass";
  return "wait";
}

function WorkDetailModal({ workId, onClose }: { workId: string; onClose: () => void }) {
  const { departmentId, shipperId } = useFilterStore();
  const [detail, setDetail] = useState<WorkDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({ work_id: workId, department_id: departmentId, shipper_id: shipperId });
        const response = await fetch(`/api/work-status/detail?${params.toString()}`);
        const data = (await response.json()) as WorkDetailResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "작업 상세내역을 불러오지 못했습니다.");
        if (!cancelled) setDetail(data);
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "작업 상세내역을 불러오지 못했습니다.");
          setDetail(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [workId, retryCount, departmentId, shipperId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">작업 상세내역</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {detail?.work.documentNo ?? "작업 상세"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="상세내역 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-border bg-card text-sm font-medium text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            작업 상세내역을 불러오는 중입니다.
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-red-200 bg-red-50 p-6 text-center text-sm font-medium text-red-600">
            {error}
            <button
              type="button"
              onClick={() => setRetryCount((current) => current + 1)}
              className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
            >
              다시 시도
            </button>
          </div>
        ) : detail ? (
          <div className="grid gap-5">
            <CuteCard>
              <h3 className="mb-3 text-sm font-semibold text-foreground">작업 기본정보</h3>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <DetailField label="문서번호" value={detail.work.documentNo} />
                <DetailField label="완성품코드" value={detail.work.productCode} />
                <DetailField label="완성품명" value={detail.work.productName} />
                <DetailField label="작업수량" value={detail.work.quantity.toLocaleString()} />
                <DetailField label="LOT" value={detail.work.lot || "-"} />
                <DetailField label="작업자" value={detail.work.workerName || "-"} />
                <DetailField label="작업일자" value={detail.work.workDate || "-"} />
              </div>
            </CuteCard>

            <CuteCard>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                제품내역
                {detail.productsSource === "work_master" && (
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                    마스터 기준
                  </span>
                )}
              </h3>
              <ProductTable products={detail.products} productsSource={detail.productsSource} />
            </CuteCard>

            <CuteCard>
              <h3 className="mb-3 text-sm font-semibold text-foreground">부자재 내역</h3>
              <MaterialTable materials={detail.materials} />
            </CuteCard>

            <CuteCard>
              <h3 className="mb-3 text-sm font-semibold text-foreground">작업완료사진</h3>
              <CompletionPhotoSection photos={detail.completionPhotos} />
            </CuteCard>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

function ProductTable({
  products,
  productsSource
}: {
  products: WorkDetailProductDto[];
  productsSource: WorkDetailProductsSourceDto;
}) {
  // 작업등록 입력 그대로: 제품코드/제품명/LOT/단위수량/수량/사용수량/비고 7컬럼. 마스터 폴백은 수량 자리에 구분(정상품 등)을 대신 표시한다.
  const isWorkComponents = productsSource === "work_components";
  const hasPhotoReview = products.some((product) => (product.photoReviews?.length ?? 0) > 0);
  const colSpan = hasPhotoReview ? 8 : 7;

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="whitespace-nowrap px-4 h-10">제품코드</th>
            <th className="whitespace-nowrap px-4 h-10">제품명</th>
            <th className="whitespace-nowrap px-4 h-10">LOT</th>
            <th className="h-10 whitespace-nowrap px-4 text-right">단위수량</th>
            <th className={`h-10 whitespace-nowrap px-4${isWorkComponents ? " text-right" : ""}`}>{isWorkComponents ? "수량" : "구분"}</th>
            <th className="h-10 whitespace-nowrap px-4 text-right">사용수량</th>
            <th className="whitespace-nowrap px-4 h-10">비고</th>
            {hasPhotoReview && <th className="whitespace-nowrap px-4 h-10">사진검수</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {products.map((product) => (
            <tr key={product.id} className="text-foreground">
              <td className="px-4 py-2.5 font-medium text-foreground">{product.productCode}</td>
              <td className="px-4 py-2.5">{product.productName}</td>
              <td className="px-4 py-2.5 font-medium text-foreground">{product.lot || "-"}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{product.unitQuantity?.toLocaleString() ?? "-"}</td>
              <td className={`px-4 py-2.5${isWorkComponents ? " text-right tabular-nums" : ""}`}>
                {isWorkComponents ? (product.requiredQuantity?.toLocaleString() ?? "-") : (product.productType ?? "-")}
              </td>
              <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">{product.usedQuantity?.toLocaleString() ?? "-"}</td>
              <td className="px-4 py-2.5">{product.memo || "-"}</td>
              {hasPhotoReview && (
                <td className="px-4 py-2.5">
                  <div className="space-y-2">
                    {(product.photoReviews ?? []).map((review) => (
                      <PhotoReviewCell
                        key={review.stage}
                        stageLabel={review.stage === "complete" ? "완료" : "작업전"}
                        statuses={[review.status]}
                        reviewComment={review.reviewComment}
                        imageUrls={review.imageUrls}
                        alt={`${product.productName} 사진검수`}
                      />
                    ))}
                    {(product.photoReviews?.length ?? 0) === 0 && "-"}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground">
                등록된 제품내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MaterialTable({ materials }: { materials: WorkDetailMaterialDto[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="whitespace-nowrap px-4 h-10">부자재코드</th>
            <th className="whitespace-nowrap px-4 h-10">부자재명</th>
            <th className="whitespace-nowrap px-4 h-10">검수방식</th>
            <th className="h-10 whitespace-nowrap px-4 text-right">단위수량</th>
            <th className="h-10 whitespace-nowrap px-4 text-right">사용수량</th>
            <th className="whitespace-nowrap px-4 h-10">검증값</th>
            <th className="whitespace-nowrap px-4 h-10">검수상태</th>
            <th className="whitespace-nowrap px-4 h-10">검수 사진</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {materials.map((material) => {
            const statusKey = summarizeMaterialStatus(material.inspections.map((inspection) => inspection.status));
            const status = materialStatusMeta[statusKey];

            return (
              <tr key={material.id} className="text-foreground">
                <td className="px-4 py-2.5 font-medium text-foreground">{material.materialCode}</td>
                <td className="px-4 py-2.5">{material.materialName}</td>
                <td className="px-4 py-2.5">{inspectionMethodLabels[material.inspectionMethod] ?? material.inspectionMethod}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{material.unitQuantity.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">{material.usedQuantity?.toLocaleString() ?? "-"}</td>
                <td className="px-4 py-2.5 font-medium text-foreground">{material.verificationValue || "-"}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${status.badge}`}>
                    {status.label}
                  </span>
                  {material.inspections
                    .filter((inspection) => inspection.status === "rejected" && inspection.reviewComment)
                    .map((inspection, index) => (
                      <p key={index} className="mt-1 text-[11px] font-medium text-red-700">
                        반려 사유: {inspection.reviewComment}
                      </p>
                    ))}
                </td>
                <td className="px-4 py-2.5">
                  {material.imageUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {material.imageUrls.map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`${material.materialName} 검수 사진 ${index + 1}`}
                            className="h-12 w-12 rounded-lg object-cover ring-1 ring-border transition-opacity hover:opacity-80"
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
          {materials.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                등록된 부자재 내역이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PhotoReviewCell({
  stageLabel,
  statuses,
  reviewComment,
  imageUrls,
  alt
}: {
  stageLabel: string;
  statuses: InspectionStatus[];
  reviewComment?: string;
  imageUrls: string[];
  alt: string;
}) {
  const status = materialStatusMeta[summarizeMaterialStatus(statuses)];

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">{stageLabel}</span>
        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${status.badge}`}>{status.label}</span>
      </div>
      {reviewComment && statuses.includes("rejected") && (
        <p className="mt-1 text-[11px] font-medium text-red-700">반려 사유: {reviewComment}</p>
      )}
      {imageUrls.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {imageUrls.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${alt} ${index + 1}`} className="h-12 w-12 rounded-lg object-cover ring-1 ring-border transition-opacity hover:opacity-80" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

const completionMethodLabels: Record<WorkDetailCompletionPhotoDto["method"], string> = {
  OCR: "OCR",
  VISION: "비전",
  PRODUCT: "완료제품",
  PHOTO: "사진검수"
};

// 부자재 내역 표 아래 "작업완료사진" 구역. 완료검수(작업완료 시 검수)를 통과한 완료제품사진/부자재 완료검수
// 사진을 보여준다. 완료검수가 아직 없는 작업은 빈 상태 문구만 표시한다.
function CompletionPhotoSection({ photos }: { photos: WorkDetailCompletionPhotoDto[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
          <tr>
            <th className="whitespace-nowrap px-4 h-10">항목</th>
            <th className="whitespace-nowrap px-4 h-10">검수방식</th>
            <th className="whitespace-nowrap px-4 h-10">검수상태</th>
            <th className="whitespace-nowrap px-4 h-10">사진</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {photos.map((photo) => {
            const statusKey = summarizeMaterialStatus([photo.status]);
            const status = materialStatusMeta[statusKey];

            return (
              <tr key={photo.id} className="text-foreground">
                <td className="px-4 py-2.5 font-medium text-foreground">{photo.label}</td>
                <td className="px-4 py-2.5">{completionMethodLabels[photo.method]}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${status.badge}`}>
                    {status.label}
                  </span>
                  {photo.status === "rejected" && photo.reviewComment && (
                    <p className="mt-1 text-[11px] font-medium text-red-700">반려 사유: {photo.reviewComment}</p>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {photo.imageUrls.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {photo.imageUrls.map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`${photo.label} 완료검수 사진 ${index + 1}`}
                            className="h-12 w-12 rounded-lg object-cover ring-1 ring-border transition-opacity hover:opacity-80"
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
          {photos.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                완료검수 사진이 아직 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DetailFilterModal({
  filters,
  yearOptions,
  onClose,
  onApply,
  onReset
}: {
  filters: WorkStatusFilter;
  yearOptions: string[];
  onClose: () => void;
  onApply: (filters: WorkStatusFilter) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<WorkStatusFilter>(filters);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply({
      ...draft,
      documentNo: draft.documentNo.trim(),
      productCode: draft.productCode.trim(),
      productName: draft.productName.trim(),
      lot: draft.lot.trim()
    });
  };

  const update = (key: keyof WorkStatusFilter, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">상세필터</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">작업현황 상세 검색</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              년도, 월과 함께 작업구분, 문서번호, 완성품, LOT 조건으로 조회합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="상세필터 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <FilterField label="년도">
              <select
                value={draft.year}
                onChange={(event) => update("year", event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}년
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="월">
              <select
                value={draft.month}
                onChange={(event) => update("month", event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {Array.from({ length: 12 }).map((_, index) => {
                  const month = String(index + 1).padStart(2, "0");
                  return (
                    <option key={month} value={month}>
                      {index + 1}월
                    </option>
                  );
                })}
              </select>
            </FilterField>

            <FilterField label="작업구분">
              <select
                value={draft.workType}
                onChange={(event) => update("workType", event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <option value="">전체</option>
                {workTypeOptions.map((workType) => (
                  <option key={workType} value={workType}>
                    {workType}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="문서번호">
              <FilterInput value={draft.documentNo} onChange={(value) => update("documentNo", value)} placeholder="DOC-2026-1001" />
            </FilterField>

            <FilterField label="완성품코드">
              <FilterInput value={draft.productCode} onChange={(value) => update("productCode", value)} placeholder="WM-MT-BASIC" />
            </FilterField>

            <FilterField label="완성품명">
              <FilterInput value={draft.productName} onChange={(value) => update("productName", value)} placeholder="민트 기본 패키징" />
            </FilterField>

            <FilterField label="LOT">
              <FilterInput value={draft.lot} onChange={(value) => update("lot", value)} placeholder="LOT-260701-A" />
            </FilterField>
          </div>

          <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
            <CloudButton type="button" tone="soft" className="min-w-24" onClick={onReset}>
              초기화
            </CloudButton>
            <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="submit" className="min-w-24">
              <Search className="size-4" />
              검색
            </CloudButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

function FilterInput({
  value,
  onChange,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    />
  );
}
