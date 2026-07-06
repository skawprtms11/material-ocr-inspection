"use client";

import { ClipboardCheck } from "lucide-react";
import { AdminReviewPanel } from "@/components/admin/AdminReviewPanel";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusBadge } from "@/components/common/StatusBadge";
import { OcrInspectionPanel } from "@/components/inspection/OcrInspectionPanel";
import { VisionInspectionPanel } from "@/components/inspection/VisionInspectionPanel";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";

export default function WorkInspectionPage() {
  const { departmentId, shipperId } = useFilterStore();
  const works = appRepository.listWorks({ departmentId, shipperId });
  const selectedWork = works.find((work) => work.status === "admin_review_requested") ?? works[0];
  const inspections = selectedWork ? appRepository.listInspections(selectedWork.id) : [];
  const materials = appRepository.listMaterials({ departmentId, shipperId });

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  return (
    <>
      <PageHeader
        title="작업검수"
        description="웹에서 OCR/비전 검수 내역을 확인하고, 관리자 확인 요청 건을 빠르게 처리합니다."
      />
      <div className="grid gap-5 xl:grid-cols-[330px_1fr]">
        <div className="space-y-3">
          {works.map((work) => (
            <CuteCard key={work.id} className={work.id === selectedWork?.id ? "ring-2 ring-sky-200" : ""} hover>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-800">{work.document_no}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">{work.worker_name}</p>
                </div>
                <StatusBadge status={work.status} />
              </div>
            </CuteCard>
          ))}
        </div>
        <div className="space-y-5">
          <AdminReviewPanel />
          <CuteCard>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-800">
              <ClipboardCheck className="size-5 text-sky-500" />
              {selectedWork?.document_no ?? "선택된 작업 없음"}
            </h2>
            <div className="grid gap-4">
              {inspections.map((inspection) => {
                const material = materials.find((item) => item.id === inspection.material_id);
                return inspection.method === "OCR" ? (
                  <OcrInspectionPanel key={inspection.id} inspection={inspection} material={material} />
                ) : (
                  <VisionInspectionPanel key={inspection.id} inspection={inspection} material={material} />
                );
              })}
            </div>
          </CuteCard>
        </div>
      </div>
    </>
  );
}
