"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, Clock, ListChecks, PackageCheck, TriangleAlert } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useMobileWorkStatusRows } from "@/lib/mobile/mobile-api";
import type { WorkStatusRowDto } from "@/lib/types/work-status-api";
import { getCurrentYearMonth, isYearMonthMatch } from "@/lib/utils/date";

// 사진 승인대기(admin_review_requested)의 모바일 표시 배지. 서버가 내려주는 reviewKind(photo|request)와
// reviewStage(start|complete)로 작업승인대기/완료승인대기/검수확인중/완료확인중을 구분한다.
function PhotoAwareStatusBadge({ row }: { row: WorkStatusRowDto }) {
  return (
    <StatusBadge type="work" status={row.work.status} reviewStage={row.reviewStage} reviewKind={row.reviewKind} />
  );
}

export default function MobileStatusPage() {
  const { data: rows, source, warning, isLoading, error, refetch } = useMobileWorkStatusRows();
  const defaultYearMonth = useMemo(() => getCurrentYearMonth(), []);
  const [year, setYear] = useState(defaultYearMonth.year);
  const [month, setMonth] = useState(defaultYearMonth.month);

  // 웹 work-status와 동일한 연도 목록 구성 방식(rows에 등장하는 연도 + 현재 연도).
  const yearOptions = useMemo(() => {
    const years = new Set(rows.map((row) => new Date(row.work.work_date).getFullYear()).filter((value) => !Number.isNaN(value)));
    years.add(Number(defaultYearMonth.year));
    return Array.from(years)
      .sort((a, b) => b - a)
      .map(String);
  }, [defaultYearMonth.year, rows]);

  const filteredRows = useMemo(
    () => rows.filter((row) => isYearMonthMatch(row.work.work_date, year, month)),
    [rows, year, month]
  );

  const progress = filteredRows.filter((row) => row.displayStatus === "waiting" || row.displayStatus === "progress").length;
  const needsReview = filteredRows.filter((row) => row.displayStatus === "hold").length;
  const completed = filteredRows.filter((row) => row.displayStatus === "complete").length;
  const canceled = filteredRows.filter((row) => row.displayStatus === "cancel").length;

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <ListChecks className="size-5 text-primary" />
          <p className="text-xs font-medium text-muted-foreground">작업현황</p>
        </div>
        <h1 className="mt-2 text-lg font-semibold text-foreground">작업 현황</h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {isLoading ? "데이터 동기화 중" : `데이터: ${source === "supabase" ? "Supabase" : "Mock/Fallback"}`}
        </p>
      </CuteCard>

      {(warning || error) && (
        <CuteCard className="flex items-center justify-between gap-3 p-3 text-xs font-medium leading-5 text-amber-800">
          <span>{error || warning}</span>
          {error && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex min-h-11 shrink-0 items-center rounded-md border border-amber-200 bg-amber-50 px-4 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              다시 시도
            </button>
          )}
        </CuteCard>
      )}

      <CuteCard className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">년도</span>
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="h-11 w-full rounded-md border border-input bg-card px-4 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="작업현황 조회 년도"
            >
              {yearOptions.map((option) => (
                <option key={option} value={option}>
                  {option}년
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">월</span>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-11 w-full rounded-md border border-input bg-card px-4 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label="작업현황 조회 월"
            >
              {Array.from({ length: 12 }).map((_, index) => {
                const value = String(index + 1).padStart(2, "0");
                return (
                  <option key={value} value={value}>
                    {index + 1}월
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      </CuteCard>

      <div className="grid grid-cols-4 gap-2">
        <CuteCard className="p-3 text-center">
          <Clock className="mx-auto mb-1 size-5 text-primary" />
          <p className="text-xl font-semibold tabular-nums text-foreground">{progress}</p>
          <p className="text-[11px] font-medium text-muted-foreground">진행</p>
        </CuteCard>
        <CuteCard className="p-3 text-center">
          <TriangleAlert className="mx-auto mb-1 size-5 text-amber-500" />
          <p className="text-xl font-semibold tabular-nums text-foreground">{needsReview}</p>
          <p className="text-[11px] font-medium text-muted-foreground">확인필요</p>
        </CuteCard>
        <CuteCard className="p-3 text-center">
          <CheckCircle2 className="mx-auto mb-1 size-5 text-emerald-500" />
          <p className="text-xl font-semibold tabular-nums text-foreground">{completed}</p>
          <p className="text-[11px] font-medium text-muted-foreground">완료</p>
        </CuteCard>
        <CuteCard className="p-3 text-center">
          <Ban className="mx-auto mb-1 size-5 text-red-500" />
          <p className="text-xl font-semibold tabular-nums text-foreground">{canceled}</p>
          <p className="text-[11px] font-medium text-muted-foreground">취소</p>
        </CuteCard>
      </div>

      <div className="space-y-2">
        {filteredRows.map((row) => {
          return (
            <CuteCard key={row.work.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{row.work.document_no}</p>
                  <p className="mt-1 font-semibold text-foreground">{row.productName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.productCode} · LOT {row.lot || "-"} · {row.work.worker_name || "미할당"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <PhotoAwareStatusBadge row={row} />
                </div>
              </div>
              {row.work.status === "inspection_failed" && (
                <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium leading-5 text-red-700">
                  반려된 항목이 있습니다. 작업문서를 스캔해 반려 사유를 확인하고 다시 촬영하세요.
                </p>
              )}
              {row.work.status === "in_progress" && (
                <Link href={`/mobile/complete/${row.work.id}`} className="mt-3 block">
                  <span className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90">
                    <PackageCheck className="size-4" />
                    완료검수
                  </span>
                </Link>
              )}
            </CuteCard>
          );
        })}
        {!isLoading && filteredRows.length === 0 && (
          <CuteCard className="p-4 text-center text-sm text-muted-foreground">
            조회된 작업이 없습니다.
          </CuteCard>
        )}
      </div>
    </div>
  );
}
