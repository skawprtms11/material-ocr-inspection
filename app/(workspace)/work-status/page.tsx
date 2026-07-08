"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CheckCircle2, ChevronDown, CirclePause, Clock3, Filter, ListChecks, PlayCircle, Search, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { useFilterStore } from "@/lib/state/filter-store";
import { dashboardWorkStatusOptions } from "@/lib/state/work-flow-store";
import type { Work, WorkStatus } from "@/lib/types/domain";
import type { UpdateWorkStatusResponse, WorkStatusDataResponse } from "@/lib/types/work-status-api";

type WorkStatusFilter = {
  year: string;
  month: string;
  workType: string;
  documentNo: string;
  productCode: string;
  productName: string;
  lot: string;
};

type DisplayStatus = "waiting" | "progress" | "hold" | "cancel" | "complete";

type WorkStatusRow = {
  work: Work;
  displayStatus: DisplayStatus;
  workType: string;
  productCode: string;
  productName: string;
  lot: string;
  quantity: number;
};

const workTypeOptions = ["리드레싱", "세트작업", "해체작업", "기타작업"];

const displayStatusMeta: Record<
  DisplayStatus,
  { label: string; icon: typeof Clock3; badge: string; iconBox: string }
> = {
  waiting: {
    label: "대기",
    icon: Clock3,
    badge: "bg-slate-100 text-slate-600 ring-slate-200",
    iconBox: "bg-slate-200 text-slate-600"
  },
  progress: {
    label: "진행",
    icon: PlayCircle,
    badge: "bg-sky-100 text-sky-700 ring-sky-200",
    iconBox: "bg-sky-500 text-white"
  },
  hold: {
    label: "보류",
    icon: CirclePause,
    badge: "bg-amber-100 text-amber-800 ring-amber-200",
    iconBox: "bg-amber-400 text-white"
  },
  cancel: {
    label: "취소",
    icon: Ban,
    badge: "bg-rose-100 text-rose-700 ring-rose-200",
    iconBox: "bg-rose-500 text-white"
  },
  complete: {
    label: "완료",
    icon: CheckCircle2,
    badge: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    iconBox: "bg-emerald-500 text-white"
  }
};

function getCurrentYearMonth() {
  const now = new Date();
  return {
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, "0")
  };
}

function includesText(value: string, keyword: string) {
  return value.toLowerCase().includes(keyword.trim().toLowerCase());
}

function getDisplayStatus(status: WorkStatus): DisplayStatus {
  if (status === "registered") return "waiting";
  if (status === "in_progress") return "progress";
  if (status === "on_hold" || status === "inspection_failed" || status === "admin_review_requested") return "hold";
  if (status === "canceled") return "cancel";
  return "complete";
}

function getSelectableWorkStatus(status: WorkStatus): WorkStatus {
  if (status === "inspection_failed" || status === "admin_review_requested") return "on_hold";
  if (status === "passed") return "completed";
  return status;
}

function getFallbackFinishedProductLot(work: Work, index: number) {
  return `LOT-${work.work_date.replaceAll("-", "").slice(2)}-${String(index + 1).padStart(2, "0")}`;
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
  const [dataSource, setDataSource] = useState<"supabase" | "mock">("mock");
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

  const loadRows = useCallback(async () => {
    if (!departmentId || !shipperId) return;

    setIsLoading(true);

    try {
      const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
      const response = await fetch(`/api/work-status?${params.toString()}`);
      if (!response.ok) throw new Error("작업현황 데이터를 불러오지 못했습니다.");
      const data = (await response.json()) as WorkStatusDataResponse;
      setRows(data.rows);
      setDataSource(data.source);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
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
      const workDate = new Date(row.work.work_date);
      const yearMatched = String(workDate.getFullYear()) === filters.year;
      const monthMatched = String(workDate.getMonth() + 1).padStart(2, "0") === filters.month;
      const workTypeMatched = filters.workType ? row.workType === filters.workType : true;
      const documentMatched = filters.documentNo ? includesText(row.work.document_no, filters.documentNo) : true;
      const productCodeMatched = filters.productCode ? includesText(row.productCode, filters.productCode) : true;
      const productNameMatched = filters.productName ? includesText(row.productName, filters.productName) : true;
      const lotMatched = filters.lot ? includesText(row.lot, filters.lot) : true;

      return yearMatched && monthMatched && workTypeMatched && documentMatched && productCodeMatched && productNameMatched && lotMatched;
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
        body: JSON.stringify({ workId, status })
      });
      const result = (await response.json()) as UpdateWorkStatusResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업상태 저장에 실패했습니다.");

      setRows((current) =>
        current.map((row) =>
          row.work.id === workId
            ? {
                ...row,
                work: { ...row.work, status },
                displayStatus: getDisplayStatus(status)
              }
            : row
        )
      );
      setDataSource(result.source);
      setStatusMenuWorkId(null);
      toast.success(`작업상태가 ${dashboardWorkStatusOptions.find((option) => option.value === status)?.label ?? "변경"} 처리되었습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업상태 저장에 실패했습니다.");
    }
  };

  const cards = [
    { label: "전체", value: summary.total, icon: ListChecks, tone: "text-sky-600 bg-sky-100" },
    { label: "대기", value: summary.waiting, icon: Clock3, tone: "text-slate-600 bg-slate-100" },
    { label: "진행", value: summary.progress, icon: PlayCircle, tone: "text-sky-600 bg-sky-100" },
    { label: "보류", value: summary.hold, icon: CirclePause, tone: "text-amber-700 bg-amber-100" },
    { label: "취소", value: summary.cancel, icon: Ban, tone: "text-rose-700 bg-rose-100" },
    { label: "완료", value: summary.complete, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-100" }
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
              className="h-10 rounded-2xl border border-sky-100 bg-white/90 px-3 text-sm font-black text-slate-700 outline-none focus:ring-2 focus:ring-sky-200"
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
              className="h-10 rounded-2xl border border-sky-100 bg-white/90 px-3 text-sm font-black text-slate-700 outline-none focus:ring-2 focus:ring-sky-200"
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
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[1.2rem] bg-amber-50/80 px-4 py-3 text-xs font-black text-amber-800 ring-1 ring-amber-100">
          <Search className="size-4" />
          상세필터 적용중
          {filters.workType && <span className="rounded-full bg-white px-2 py-1">작업구분 {filters.workType}</span>}
          {filters.documentNo && <span className="rounded-full bg-white px-2 py-1">문서번호 {filters.documentNo}</span>}
          {filters.productCode && <span className="rounded-full bg-white px-2 py-1">완성품코드 {filters.productCode}</span>}
          {filters.productName && <span className="rounded-full bg-white px-2 py-1">완성품명 {filters.productName}</span>}
          {filters.lot && <span className="rounded-full bg-white px-2 py-1">LOT {filters.lot}</span>}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
        <span>{isLoading ? "작업현황 데이터를 불러오는 중이에요." : "선택된 부서/화주 기준으로 작업현황을 조회합니다."}</span>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-100">
          데이터: {dataSource === "supabase" ? "Supabase" : "Mock/Fallback"}
        </span>
      </div>

      <CuteCard className="mb-4 p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-[180px] items-center justify-between gap-4 rounded-2xl bg-sky-50 px-4 py-3">
            <div>
              <p className="text-xs font-black text-sky-600">완료율</p>
              <p className="mt-0.5 text-2xl font-black text-slate-800">{completionRate}%</p>
            </div>
            <div className="h-2 w-24 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${completionRate}%` }} />
            </div>
          </div>

          <div className="grid flex-1 grid-cols-3 gap-2 md:grid-cols-6">
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="flex items-center gap-2 rounded-2xl bg-white/70 px-3 py-2 ring-1 ring-slate-100">
                  <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${card.tone}`}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-400">{card.label}</p>
                    <p className="text-base font-black text-slate-800">{card.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CuteCard>

      <CuteCard className="p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-800">작업현황</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">선택한 기간과 상세필터 기준으로 조회됩니다.</p>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">{filteredRows.length}건</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left text-sm">
            <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
              <tr>
                {["작업상태", "작업구분", "문서번호", "완성품코드", "완성품명", "LOT", "작업수량", "비고"].map((header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/70">
              {filteredRows.map((row) => {
                const status = displayStatusMeta[row.displayStatus];
                const Icon = status.icon;

                return (
                  <tr key={row.work.id} className="text-slate-600 transition hover:bg-sky-50/70">
                    <td className="px-4 py-3">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          onClick={() => setStatusMenuWorkId((current) => (current === row.work.id ? null : row.work.id))}
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ring-1 transition hover:scale-[1.02] ${status.badge}`}
                          aria-haspopup="menu"
                          aria-expanded={statusMenuWorkId === row.work.id}
                          aria-label={`${row.work.document_no} 작업상태 변경`}
                        >
                          <span className={`inline-flex size-6 items-center justify-center rounded-full ${status.iconBox}`}>
                            <Icon className="size-3.5" />
                          </span>
                          {status.label}
                          <ChevronDown className="size-3.5" />
                        </button>

                        {statusMenuWorkId === row.work.id && (
                          <div className="absolute left-0 top-full z-30 mt-2 w-36 overflow-hidden rounded-2xl border border-white/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]">
                            {dashboardWorkStatusOptions.map((option) => {
                              const optionStatus = displayStatusMeta[getDisplayStatus(option.value)];
                              const OptionIcon = optionStatus.icon;
                              const selected = getSelectableWorkStatus(row.work.status) === option.value;

                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => handleStatusChange(row.work.id, option.value)}
                                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-black transition hover:bg-sky-50 ${
                                    selected ? "bg-sky-50 text-sky-700" : "text-slate-600"
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
                    <td className="px-4 py-3 font-black text-slate-800">{row.workType}</td>
                    <td className="px-4 py-3 font-black text-sky-700">{row.work.document_no}</td>
                    <td className="px-4 py-3 font-bold">{row.productCode}</td>
                    <td className="px-4 py-3 font-bold text-slate-700">{row.productName}</td>
                    <td className="max-w-[240px] px-4 py-3 font-bold text-violet-700">{row.lot || "-"}</td>
                    <td className="px-4 py-3 font-bold">{row.quantity.toLocaleString()}</td>
                    <td className="max-w-[280px] truncate px-4 py-3 text-slate-500">{row.work.memo || "-"}</td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm font-bold text-slate-400">
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
    </>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-600">상세필터</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">작업현황 상세 검색</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              년도, 월과 함께 작업구분, 문서번호, 완성품, LOT 조건으로 조회합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="상세필터 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <FilterField label="년도">
              <select
                value={draft.year}
                onChange={(event) => update("year", event.target.value)}
                className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
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
                className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
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
                className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
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

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <CloudButton type="button" tone="soft" onClick={onReset}>
              초기화
            </CloudButton>
            <CloudButton type="button" tone="danger" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="submit">
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
      <span className="mb-1 block text-xs font-black text-slate-500">{label}</span>
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
      className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
    />
  );
}
