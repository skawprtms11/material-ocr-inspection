import { Check } from "lucide-react";
import type { WorkStatus } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

const steps: { key: WorkStatus; label: string }[] = [
  { key: "registered", label: "등록" },
  { key: "in_progress", label: "스캔/검수" },
  { key: "inspection_failed", label: "재검수" },
  { key: "admin_review_requested", label: "관리자" },
  { key: "passed", label: "서명" },
  { key: "completed", label: "완료" }
];

export function WorkProgressTimeline({ currentStatus }: { currentStatus: WorkStatus }) {
  const currentIndex = steps.findIndex((step) => step.key === currentStatus);

  return (
    <div className="mt-3 flex items-center gap-1">
      {steps.map((step, index) => {
        const done = index <= currentIndex || currentStatus === "completed";
        return (
          <div key={step.key} className="flex flex-1 items-center gap-1">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium",
                done ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" : "bg-slate-100 text-muted-foreground"
              )}
              title={step.label}
            >
              {done ? <Check className="size-3" /> : index + 1}
            </div>
            {index < steps.length - 1 && <div className={cn("h-1 flex-1 rounded-full", done ? "bg-emerald-200" : "bg-slate-100")} />}
          </div>
        );
      })}
    </div>
  );
}
