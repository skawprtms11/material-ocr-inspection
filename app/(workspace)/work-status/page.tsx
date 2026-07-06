"use client";

import { Clock3, ListChecks, ShieldCheck, TriangleAlert } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { WorkProgressTimeline } from "@/components/work/WorkProgressTimeline";
import { workStatusLabels, workStatusOrder } from "@/lib/constants/status";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";
import { formatDate } from "@/lib/utils/format";

export default function WorkStatusPage() {
  const { departmentId, shipperId } = useFilterStore();
  const works = appRepository.listWorks({ departmentId, shipperId });
  const summary = appRepository.summarizeWorks({ departmentId, shipperId });
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  const cards = [
    { label: "전체", value: summary.total, icon: ListChecks, tone: "text-sky-600 bg-sky-100" },
    { label: "진행중", value: summary.in_progress, icon: Clock3, tone: "text-violet-600 bg-violet-100" },
    { label: "합격/완료", value: summary.passed + summary.completed, icon: ShieldCheck, tone: "text-emerald-600 bg-emerald-100" },
    { label: "확인 필요", value: summary.inspection_failed + summary.admin_review_requested, icon: TriangleAlert, tone: "text-amber-700 bg-amber-100" }
  ];

  return (
    <>
      <PageHeader title="작업현황" description="작업등록부터 완료까지 단계별 진행 상황을 칸반 보드로 한눈에 확인합니다." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <CuteCard key={card.label} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-400">{card.label}</p>
                  <p className="mt-1 text-3xl font-black text-slate-800">{card.value}</p>
                </div>
                <div className={`rounded-full p-3 ${card.tone}`}>
                  <Icon className="size-6" />
                </div>
              </div>
            </CuteCard>
          );
        })}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {workStatusOrder.map((status) => {
          const statusWorks = works.filter((work) => work.status === status);
          return (
            <CuteCard key={status} className="min-h-72 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-black text-slate-800">{workStatusLabels[status]}</h2>
                <StatusBadge status={status} />
              </div>
              <div className="space-y-3">
                {statusWorks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-sky-100 bg-white/60 p-4 text-center text-sm font-bold text-slate-400">
                    아직 조용해요
                  </div>
                ) : (
                  statusWorks.map((work) => {
                    const workMaster = workMasters.find((item) => item.id === work.work_master_id);
                    return (
                      <div key={work.id} className="rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-sm font-black text-slate-800">{work.document_no}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{workMaster?.name}</p>
                        <WorkProgressTimeline currentStatus={work.status} />
                        <p className="mt-3 text-xs font-semibold text-slate-400">
                          최근 검수 {work.latest_inspected_at ? formatDate(work.latest_inspected_at, "MM.dd HH:mm") : "-"}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </CuteCard>
          );
        })}
      </div>
    </>
  );
}
