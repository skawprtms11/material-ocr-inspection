import { Image } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { MaterialMaster, WorkInspection } from "@/lib/types/domain";
import { formatPercent } from "@/lib/utils/format";

export function VisionInspectionPanel({ inspection, material }: { inspection: WorkInspection; material?: MaterialMaster }) {
  return (
    <CuteCard className="bg-violet-50/70">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-violet-600">비전 검수</p>
          <h3 className="mt-1 font-black text-slate-800">{material?.name}</h3>
        </div>
        <StatusBadge type="inspection" status={inspection.status} />
      </div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-white text-violet-300">
          <Image className="size-10" />
        </div>
        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-black text-slate-400">유사도 점수</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatPercent(inspection.vision_similarity)}</p>
          <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{inspection.result_summary}</p>
        </div>
      </div>
    </CuteCard>
  );
}
