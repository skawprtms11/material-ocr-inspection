import { Image } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { MaterialMaster, WorkInspection } from "@/lib/types/domain";
import { formatPercent } from "@/lib/utils/format";

export function VisionInspectionPanel({ inspection, material }: { inspection: WorkInspection; material?: MaterialMaster }) {
  return (
    <CuteCard>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">비전 검수</p>
          <h3 className="mt-1 font-semibold text-foreground">{material?.name}</h3>
        </div>
        <StatusBadge type="inspection" status={inspection.status} />
      </div>
      <div className="grid gap-3 md:grid-cols-[180px_1fr]">
        <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-border bg-muted/30 text-violet-400">
          <Image className="size-10" />
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">유사도 점수</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{formatPercent(inspection.vision_similarity)}</p>
          <p className="mt-2 text-sm leading-6 text-foreground">{inspection.result_summary}</p>
        </div>
      </div>
    </CuteCard>
  );
}
