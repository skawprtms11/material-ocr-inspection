"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, Keyboard } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { findWorkByDocumentNo, useMobileWorkStatusRows } from "@/lib/mobile/mobile-api";

export function BarcodeScannerPanel() {
  const router = useRouter();
  const { data: rows, source, warning, isLoading, error: loadError } = useMobileWorkStatusRows();
  // 입력칸은 항상 빈 값으로 시작한다(과거 rows[0] 자동 채움이 "123456"처럼 임의 문서번호가 채워지는 오류였다).
  const [documentNo, setDocumentNo] = useState("");
  const [error, setError] = useState("");

  function matchWork() {
    const row = findWorkByDocumentNo(rows, documentNo);
    if (!row) {
      setError("이 문서번호를 찾을 수 없습니다.");
      return;
    }
    router.push(`/mobile/inspection/${row.work.id}`);
  }

  return (
    <CuteCard className="p-4">
      <div className="mb-4 flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-input bg-muted/30 text-center">
        <Barcode className="mb-4 size-16 text-muted-foreground" />
        <p className="font-semibold text-foreground">바코드를 스캔 영역 안에 맞춰주세요</p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          TODO: BarcodeDetector 또는 @zxing/browser 카메라 스캐너 연결
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          데이터: {source === "supabase" ? "Supabase" : "Mock/Fallback"}
        </p>
      </div>
      <label className="block">
        <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Keyboard className="size-3.5" />
          직접 문서번호 입력
        </span>
        <input
          value={documentNo}
          onChange={(event) => {
            setDocumentNo(event.target.value);
            setError("");
          }}
          className="h-12 w-full rounded-md border border-input bg-card px-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder="DOC-2026-1001"
        />
      </label>
      {(error || loadError || warning) && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
          {error || loadError || warning}
        </div>
      )}
      <CloudButton className="mt-4 min-h-12 w-full" disabled={isLoading || rows.length === 0} onClick={matchWork}>
        작업 찾기
      </CloudButton>
    </CuteCard>
  );
}
