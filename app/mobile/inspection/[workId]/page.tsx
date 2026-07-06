"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Camera, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { ImageUploadCard } from "@/components/common/ImageUploadCard";
import { StatusBadge } from "@/components/common/StatusBadge";
import { inspectionMethodLabels } from "@/lib/constants/status";
import { appRepository } from "@/lib/repositories/app-repository";

export default function MobileInspectionPage() {
  const params = useParams<{ workId: string }>();
  const work = appRepository.findWorkById(params.workId);
  const inspections = appRepository.listInspections(params.workId);
  const materials = appRepository.listMaterials({ departmentId: work?.department_id, shipperId: work?.shipper_id });
  const allPassed = inspections.every((inspection) => ["passed", "admin_approved"].includes(inspection.status));

  if (!work) {
    return <CuteCard>작업을 찾지 못했어요.</CuteCard>;
  }

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <p className="text-xs font-black text-sky-600">문서번호</p>
        <h1 className="mt-1 text-2xl font-black text-slate-800">{work.document_no}</h1>
        <p className="mt-1 text-sm font-bold text-slate-500">{work.worker_name} 작업</p>
      </CuteCard>
      {inspections.map((inspection, index) => {
        const material = materials.find((item) => item.id === inspection.material_id);
        return (
          <CuteCard key={inspection.id} className="p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-violet-600">STEP {index + 1}</p>
                <h2 className="mt-1 text-lg font-black text-slate-800">{material?.name}</h2>
                <p className="mt-1 text-xs font-bold text-slate-400">{material ? inspectionMethodLabels[material.inspection_method] : inspection.method}</p>
              </div>
              <StatusBadge type="inspection" status={inspection.status} />
            </div>
            <ImageUploadCard title="촬영 이미지" bucket="inspection-images" storagePath={`inspection-images/${work.id}/${work.document_no}-${inspection.id}.jpg`} />
            <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-bold leading-6 text-slate-600">
              {inspection.result_summary}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <CloudButton tone="soft" onClick={() => toast.info("mock 재검수를 시작했어요.")}>
                <RotateCcw className="size-4" />
                재검수
              </CloudButton>
              <CloudButton tone="warning" onClick={() => toast.warning("관리자 확인 요청이 생성되는 흐름입니다.")}>
                <Send className="size-4" />
                관리자 요청
              </CloudButton>
            </div>
            <CloudButton className="mt-2 w-full" onClick={() => toast.success("mock provider로 검수를 실행했어요.")}>
              <Camera className="size-4" />
              촬영 후 mock 검수
            </CloudButton>
          </CuteCard>
        );
      })}
      <Link href={`/mobile/sign/${work.id}`}>
        <CloudButton className="w-full" disabled={!allPassed}>
          서명 단계로 이동
        </CloudButton>
      </Link>
      {!allPassed && <p className="text-center text-xs font-bold text-slate-500">필수 부자재가 합격 또는 관리자 승인되면 서명할 수 있어요.</p>}
    </div>
  );
}
