import { adminReviewStatusLabels, getWorkStatusLabel, inspectionStatusLabels, type ReviewKind } from "@/lib/constants/status";
import type { AdminReviewStatus, InspectionStatus, WorkInspectionStage, WorkStatus } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type StatusBadgeProps = {
  status: WorkStatus | InspectionStatus | AdminReviewStatus;
  type?: "work" | "inspection" | "admin";
  // type="work"이고 확인요청 중일 때만 의미가 있다. 라벨을 "검수확인중"/"완료확인중"으로 바꾼다.
  reviewStage?: WorkInspectionStage;
  // reviewKind="photo"면 사진 승인대기 라벨("작업승인대기"/"완료승인대기"). 생략하면 확인요청 라벨.
  reviewKind?: ReviewKind;
  className?: string;
};

const toneMap: Record<string, string> = {
  registered: "bg-slate-100 text-slate-700 ring-slate-500/20",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-600/20",
  on_hold: "bg-amber-50 text-amber-800 ring-amber-600/20",
  canceled: "bg-red-50 text-red-700 ring-red-600/20",
  inspection_failed: "bg-red-50 text-red-700 ring-red-600/20",
  admin_review_requested: "bg-amber-50 text-amber-800 ring-amber-600/20",
  passed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  completed: "bg-emerald-600 text-white ring-emerald-600",
  pending: "bg-slate-100 text-slate-700 ring-slate-500/20",
  failed: "bg-red-50 text-red-700 ring-red-600/20",
  retrying: "bg-orange-50 text-orange-700 ring-orange-600/20",
  admin_requested: "bg-amber-50 text-amber-800 ring-amber-600/20",
  admin_approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  requested: "bg-amber-50 text-amber-800 ring-amber-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  retry_requested: "bg-orange-50 text-orange-700 ring-orange-600/20",
  rejected: "bg-red-50 text-red-700 ring-red-600/20",
  submitted: "bg-indigo-50 text-indigo-700 ring-indigo-600/20"
};

export function StatusBadge({ status, type = "work", reviewStage, reviewKind, className }: StatusBadgeProps) {
  const label =
    type === "admin"
      ? adminReviewStatusLabels[status as AdminReviewStatus]
      : type === "inspection"
        ? inspectionStatusLabels[status as InspectionStatus]
        : getWorkStatusLabel(status as WorkStatus, reviewStage, reviewKind);

  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", toneMap[status], className)}>
      {label}
    </span>
  );
}
