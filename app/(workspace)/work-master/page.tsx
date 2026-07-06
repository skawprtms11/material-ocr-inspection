"use client";

import { Plus, Settings2 } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";

export default function WorkMasterPage() {
  const { departmentId, shipperId } = useFilterStore();
  const workMasters = appRepository.listWorkMasters({ departmentId, shipperId });
  const materials = appRepository.listMaterials({ departmentId, shipperId });

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  return (
    <>
      <PageHeader
        title="작업마스터"
        description="작업명, 작업코드, 사용 부자재와 검수 순서를 관리합니다."
        action={
          <CloudButton>
            <Plus className="size-4" />
            작업마스터 추가
          </CloudButton>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <CuteCard>
          <DataTable
            headers={["작업코드", "작업명", "설명", "사용여부"]}
            rows={workMasters.map((workMaster) => [
              <span key="code" className="font-black text-sky-700">{workMaster.code}</span>,
              <span key="name" className="font-bold text-slate-800">{workMaster.name}</span>,
              workMaster.description,
              workMaster.is_active ? "사용" : "중지"
            ])}
          />
        </CuteCard>
        <CuteCard>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">
            <Settings2 className="size-5 text-violet-500" />
            부자재 순서 설정
          </h2>
          <div className="space-y-3">
            {materials.map((material, index) => (
              <div key={material.id} className="flex items-center justify-between rounded-2xl bg-sky-50 px-4 py-3">
                <div>
                  <p className="font-black text-slate-800">{material.name}</p>
                  <p className="text-xs font-bold text-slate-400">{material.code}</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-sky-600">{index + 1}</span>
              </div>
            ))}
          </div>
        </CuteCard>
      </div>
    </>
  );
}
