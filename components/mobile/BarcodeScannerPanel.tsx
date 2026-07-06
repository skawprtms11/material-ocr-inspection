"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, Keyboard } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { appRepository } from "@/lib/repositories/app-repository";

export function BarcodeScannerPanel() {
  const router = useRouter();
  const [documentNo, setDocumentNo] = useState("DOC-2026-1001");
  const [error, setError] = useState("");

  function matchWork() {
    const work = appRepository.findWorkByDocumentNo(documentNo);
    if (!work) {
      setError("이 문서번호를 찾지 못했어요.");
      return;
    }
    router.push(`/mobile/inspection/${work.id}`);
  }

  return (
    <CuteCard className="p-4">
      <div className="mb-4 flex aspect-square flex-col items-center justify-center rounded-[1.8rem] border-2 border-dashed border-sky-200 bg-sky-50/70 text-center">
        <Barcode className="mb-4 size-16 text-sky-400" />
        <p className="font-black text-slate-800">바코드를 구름 안에 맞춰주세요</p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
          TODO: BarcodeDetector 또는 @zxing/browser 카메라 스캐너 연결
        </p>
      </div>
      <label className="block">
        <span className="mb-1 flex items-center gap-1 text-xs font-black text-slate-500">
          <Keyboard className="size-3.5" />
          직접 문서번호 입력
        </span>
        <input
          value={documentNo}
          onChange={(event) => {
            setDocumentNo(event.target.value);
            setError("");
          }}
          className="h-12 w-full rounded-2xl border border-sky-100 bg-white px-4 text-base font-bold outline-none focus:ring-2 focus:ring-sky-200"
          placeholder="DOC-2026-1001"
        />
      </label>
      {error && <div className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</div>}
      <CloudButton className="mt-4 w-full" onClick={matchWork}>
        작업 찾기
      </CloudButton>
    </CuteCard>
  );
}
