"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, ClipboardCheck, FileSearch, Loader2 } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { getWorkStatusLabel } from "@/lib/constants/status";
import { useMobileInspectionRows } from "@/lib/mobile/mobile-api";
import type { WorkInspectionStage } from "@/lib/types/domain";

// 작업검수 진입 화면(스캔 전용). 문서번호를 스캔하면 작업현황 상태값에 따라 곧바로 해당 검수 화면으로 이동한다.
//   - 대기(registered)  → /mobile/pre/[workId]      (작업전 검수)
//   - 진행(in_progress) → /mobile/complete/[workId] (완료검수)
//   - 그 외(보류/취소/완료 등) → 이동하지 않고 안내만 표시한다.
// 검수 대상(work_inspections) lazy 생성은 이동한 각 화면이 담당하므로 이 화면은 분기만 책임진다.
export default function MobileInspectionEntryPage() {
  const { data: rows, source, warning, isLoading, error, refetch } = useMobileInspectionRows();
  const [documentNo, setDocumentNo] = useState("");
  const [scanError, setScanError] = useState("");
  const [routing, setRouting] = useState(false);
  const router = useRouter();

  const handleScan = () => {
    const keyword = documentNo.trim().toLowerCase();

    if (!keyword) {
      setScanError("문서번호를 입력해주세요.");
      return;
    }

    const matched = rows.find((row) => row.work.document_no.toLowerCase() === keyword);

    if (!matched) {
      setScanError("이 문서번호를 찾지 못했어요.");
      return;
    }

    const status = matched.work.status;

    if (status === "registered") {
      setScanError("");
      setRouting(true);
      router.push(`/mobile/pre/${matched.work.id}`);
      return;
    }

    if (status === "in_progress") {
      setScanError("");
      setRouting(true);
      router.push(`/mobile/complete/${matched.work.id}`);
      return;
    }

    // 확인요청 중이면 어느 단계에서 걸렸는지 알려준다. 조회된 inspections는 시작검수(stage="start") 기준이므로,
    // 여기에 admin_requested가 있으면 작업전 검수 단계, 없으면 완료검수 단계에서 확인요청이 걸린 것이다.
    const reviewStage: WorkInspectionStage = matched.inspections.some(
      (inspection) => inspection.status === "admin_requested"
    )
      ? "start"
      : "complete";

    setScanError(
      `현재 작업상태가 "${getWorkStatusLabel(status, reviewStage)}"라서 검수를 진행할 수 없어요. 대기(작업전 검수) 또는 진행(완료검수) 상태만 검수할 수 있습니다.`
    );
  };

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-sky-500" />
          <p className="text-xs font-black text-sky-600">작업검수</p>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">작업문서스캔</h1>
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
        <div className="mb-4 flex aspect-square flex-col items-center justify-center rounded-[1.6rem] border-2 border-dashed border-sky-200 bg-sky-50/70 text-center">
          <Barcode className="mb-4 size-16 text-sky-400" />
          <p className="font-black text-slate-800">작업문서 바코드 스캔</p>
          <p className="mt-2 px-6 text-xs font-semibold leading-5 text-slate-500">
            스캔하면 작업상태에 따라 작업전 검수 또는 완료검수로 바로 이동합니다.
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-black text-slate-500">문서번호</span>
          <input
            value={documentNo}
            onChange={(event) => {
              setDocumentNo(event.target.value);
              setScanError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleScan();
            }}
            className="h-12 w-full rounded-2xl border border-sky-100 bg-white px-4 text-base font-bold outline-none focus:ring-2 focus:ring-sky-200"
            placeholder="DOC-2026-1001"
            aria-label="작업문서 번호"
          />
        </label>
        {scanError && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-600">{scanError}</p>}
        <CloudButton className="mt-4 w-full" disabled={isLoading || routing} onClick={handleScan}>
          {routing ? <Loader2 className="size-4 animate-spin" /> : <FileSearch className="size-4" />}
          {routing ? "검수 화면으로 이동 중..." : "스캔"}
        </CloudButton>
      </CuteCard>
    </div>
  );
}
