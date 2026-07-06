"use client";

import { CalendarDays, ClipboardList, Eye, Plus } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { inspectionMethodLabels } from "@/lib/constants/status";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";
import { formatDate } from "@/lib/utils/format";

export default function WorkRegisterPage() {
  const { departmentId, shipperId } = useFilterStore();
  const works = appRepository.listWorks({ departmentId, shipperId });
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });

  if (!departmentId || !shipperId) {
    return <EmptyCloudState />;
  }

  return (
    <>
      <PageHeader
        title="작업등록"
        description="부서와 화주 기준으로 작업 문서를 등록하고, 작업마스터에 연결된 부자재를 미리 확인합니다."
        action={
          <CloudButton onClick={() => toast.success("mock 작업등록 흐름이 준비되었어요.")}>
            <Plus className="size-4" />
            작업 등록
          </CloudButton>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <CuteCard>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">
            <ClipboardList className="size-5 text-sky-500" />
            새 작업 입력
          </h2>
          <form className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">작업마스터</span>
              <select className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200">
                {workMasters.map((workMaster) => (
                  <option key={workMaster.id}>{workMaster.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">문서번호</span>
              <input className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200" placeholder="DOC-2026-0000" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">작업일자</span>
              <input type="date" className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">비고</span>
              <textarea className="min-h-24 w-full rounded-2xl border border-sky-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sky-200" placeholder="현장 메모를 남겨요" />
            </label>
            <CloudButton type="button" className="w-full" onClick={() => toast.info("TODO: Supabase works insert 연결")}>
              registered 상태로 저장
            </CloudButton>
          </form>
        </CuteCard>
        <div className="space-y-4">
          {works.map((work) => {
            const workMaster = workMasters.find((item) => item.id === work.work_master_id);
            const mappings = appRepository.listWorkMasterMaterials(work.work_master_id);
            const materials = mappings
              .map((mapping) => appRepository.listMaterials({ departmentId, shipperId }).find((material) => material.id === mapping.material_id))
              .filter(Boolean);

            return (
              <CuteCard key={work.id} hover>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={work.status} />
                      <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold text-violet-600">{workMaster?.code}</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-800">{work.document_no}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{workMaster?.name}</p>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
                    <CalendarDays className="size-4 text-sky-400" />
                    {formatDate(work.work_date)}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {materials.map((material) => (
                    <div key={material!.id} className="flex items-center justify-between rounded-2xl bg-sky-50/80 px-3 py-2 text-sm">
                      <span className="font-bold text-slate-700">{material!.name}</span>
                      <span className="text-xs font-black text-sky-600">{inspectionMethodLabels[material!.inspection_method]}</span>
                    </div>
                  ))}
                </div>
                <button className="mt-4 inline-flex items-center gap-2 text-sm font-black text-sky-600">
                  <Eye className="size-4" />
                  연결 부자재 미리보기
                </button>
              </CuteCard>
            );
          })}
        </div>
      </div>
    </>
  );
}
