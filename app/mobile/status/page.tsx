"use client";

import { CheckCircle2, Clock, ListChecks, TriangleAlert } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useMobileWorkStatusRows } from "@/lib/mobile/mobile-api";

export default function MobileStatusPage() {
  const { data: rows, source, warning, isLoading, error } = useMobileWorkStatusRows();
  const works = rows.map((row) => row.work);
  const completed = works.filter((work) => work.status === "completed").length;
  const pending = works.filter((work) => work.status === "in_progress" || work.status === "registered").length;
  const needsReview = works.filter((work) => ["inspection_failed", "admin_review_requested", "on_hold"].includes(work.status)).length;

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <ListChecks className="size-5 text-sky-500" />
          <p className="text-xs font-black text-sky-600">작업현황</p>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">오늘 작업 현황</h1>
        <p className="mt-2 text-xs font-black text-slate-400">
          {isLoading ? "데이터 동기화 중" : `데이터: ${source === "supabase" ? "Supabase" : "Mock/Fallback"}`}
        </p>
      </CuteCard>

      {(warning || error) && (
        <CuteCard className="p-3 text-xs font-bold leading-5 text-amber-700">
          {error || warning}
        </CuteCard>
      )}

      <div className="grid grid-cols-3 gap-2">
        <CuteCard className="p-3 text-center">
          <Clock className="mx-auto mb-1 size-5 text-sky-500" />
          <p className="text-xl font-black text-slate-800">{pending}</p>
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
      </div>

      <div className="space-y-2">
        {rows.map((row) => (
          <CuteCard key={row.work.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-sky-600">{row.work.document_no}</p>
                <p className="mt-1 font-black text-slate-800">{row.productName}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {row.productCode} · LOT {row.lot || "-"} · {row.work.worker_name || "미할당"}
                </p>
              </div>
              <StatusBadge type="work" status={row.work.status} />
            </div>
          </CuteCard>
        ))}
        {!isLoading && rows.length === 0 && (
          <CuteCard className="p-4 text-center text-sm font-bold text-slate-400">
            조회된 작업이 없습니다.
          </CuteCard>
        )}
      </div>
    </div>
  );
}
