import { adminReviewStatusLabels, getWorkStatusLabel, inspectionStatusLabels } from "@/lib/constants/status";
import type { AdminReviewStatus, InspectionStatus, WorkInspectionStage, WorkStatus } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type StatusBadgeProps = {
  status: WorkStatus | InspectionStatus | AdminReviewStatus;
  type?: "work" | "inspection" | "admin";
  // type="work"이고 확인요청 중일 때만 의미가 있다. 라벨을 "검수확인중"/"완료확인중"으로 바꾼다.
  reviewStage?: WorkInspectionStage;
  className?: string;
};

const toneMap: Record<string, string> = {
  registered: "bg-sky-100 text-sky-700 ring-sky-200",
  in_progress: "bg-violet-100 text-violet-700 ring-violet-200",
  on_hold: "bg-amber-100 text-amber-800 ring-amber-200",
  canceled: "bg-rose-100 text-rose-700 ring-rose-200",
  inspection_failed: "bg-rose-100 text-rose-700 ring-rose-200",
  admin_review_requested: "bg-amber-100 text-amber-800 ring-amber-200",
  passed: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  completed: "bg-teal-100 text-emerald-800 ring-emerald-200",
  pending: "bg-slate-100 text-slate-600 ring-slate-200",
  failed: "bg-rose-100 text-rose-700 ring-rose-200",
  retrying: "bg-orange-100 text-orange-700 ring-orange-200",
  admin_requested: "bg-amber-100 text-amber-800 ring-amber-200",
  admin_approved: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  requested: "bg-amber-100 text-amber-800 ring-amber-200",
  approved: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  retry_requested: "bg-orange-100 text-orange-700 ring-orange-200",
  rejected: "bg-rose-100 text-rose-700 ring-rose-200"
};

export function StatusBadge({ status, type = "work", reviewStage, className }: StatusBadgeProps) {
  const label =
    type === "admin"
      ? adminReviewStatusLabels[status as AdminReviewStatus]
      : type === "inspection"
        ? inspectionStatusLabels[status as InspectionStatus]
        : getWorkStatusLabel(status as WorkStatus, reviewStage);

  return (
    <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1", toneMap[status], className)}>
      {label}
    </span>
  );
}
