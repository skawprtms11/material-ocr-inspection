"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ban, CheckCircle2, Clock, ListChecks, PackageCheck, TriangleAlert } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useMobileWorkStatusRows } from "@/lib/mobile/mobile-api";
import { getCurrentYearMonth, isYearMonthMatch } from "@/lib/utils/date";

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
          <ListChecks className="size-5 text-sky-500" />
          <p className="text-xs font-black text-sky-600">작업현황</p>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">작업 현황</h1>
        <p className="mt-2 text-xs font-black text-slate-400">
          {isLoading ? "데이터 동기화 중" : `데이터: ${source === "supabase" ? "Supabase" : "Mock/Fallback"}`}
        </p>
      </CuteCard>

      {(warning || error) && (
        <CuteCard className="flex items-center justify-between gap-3 p-3 text-xs font-bold leading-5 text-amber-700">
          <span>{error || warning}</span>
          {error && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="shrink-0 rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-black text-amber-800"
            >
              다시 시도
            </button>
          )}
        </CuteCard>
      )}

      <CuteCard className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-slate-400">년도</span>
            <select
              value={year}
              onChange={(event) => setYear(event.target.value)}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-sky-200"
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
            <span className="mb-1 block text-xs font-bold text-slate-400">월</span>
            <select
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="h-11 w-full rounded-2xl border border-violet-100 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-violet-200"
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
          <Clock className="mx-auto mb-1 size-5 text-sky-500" />
          <p className="text-xl font-black text-slate-800">{progress}</p>
          <p className="text-[11px] font-black text-slate-400">진행</p>
        </CuteCard>
        <CuteCard className="p-3 text-center">
          <TriangleAlert className="mx-auto mb-1 size-5 text-amber-500" />
          <p className="text-xl font-black text-slate-800">{needsReview}</p>
          <p className="text-[11px] font-black text-slate-400">확인필요</p>
        </CuteCard>
        <CuteCard className="p-3 text-center">
          <CheckCircle2 className="mx-auto mb-1 size-5 text-emerald-500" />
          <p className="text-xl font-black text-slate-800">{completed}</p>
          <p className="text-[11px] font-black text-slate-400">완료</p>
        </CuteCard>
        <CuteCard className="p-3 text-center">
          <Ban className="mx-auto mb-1 size-5 text-rose-500" />
          <p className="text-xl font-black text-slate-800">{canceled}</p>
          <p className="text-[11px] font-black text-slate-400">취소</p>
        </CuteCard>
      </div>

      <div className="space-y-2">
        {filteredRows.map((row) => {
          return (
            <CuteCard key={row.work.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-sky-600">{row.work.document_no}</p>
                  <p className="mt-1 font-black text-slate-800">{row.productName}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {row.productCode} · LOT {row.lot || "-"} · {row.work.worker_name || "미할당"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge type="work" status={row.work.status} reviewStage={row.reviewStage} />
                </div>
              </div>
              {row.work.status === "in_progress" && (
                <Link href={`/mobile/complete/${row.work.id}`} className="mt-3 block">
                  <span className="flex items-center justify-center gap-2 rounded-full bg-violet-500 px-4 py-2 text-xs font-black text-white shadow-sm">
                    <PackageCheck className="size-4" />
                    완료검수
                  </span>
                </Link>
              )}
            </CuteCard>
          );
        })}
        {!isLoading && filteredRows.length === 0 && (
          <CuteCard className="p-4 text-center text-sm font-bold text-slate-400">
            조회된 작업이 없습니다.
          </CuteCard>
        )}
      </div>
    </div>
  );
}
