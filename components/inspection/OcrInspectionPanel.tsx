import { ScanText } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { MaterialMaster, WorkInspection } from "@/lib/types/domain";

export function OcrInspectionPanel({ inspection, material }: { inspection: WorkInspection; material?: MaterialMaster }) {
  return (
    <CuteCard className="bg-sky-50/70">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-sky-600">OCR 검수</p>
          <h3 className="mt-1 font-black text-slate-800">{material?.name}</h3>
        </div>
        <StatusBadge type="inspection" status={inspection.status} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-4">
          <ScanText className="mb-2 size-5 text-sky-500" />
          <p className="text-xs font-black text-slate-400">OCR 결과 텍스트</p>
          <p className="mt-2 text-sm font-bold text-slate-700">{inspection.ocr_result_text ?? "촬영 대기"}</p>
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-black text-slate-400">결과 요약</p>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{inspection.result_summary}</p>
          <p className="mt-2 text-xs font-black text-slate-400">시도 {inspection.attempt_count}회</p>
        </div>
      </div>
    </CuteCard>
  );
}
