"use client";

import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { CompletionPhotoCard } from "@/components/mobile/CompletionPhotoCard";
import { OcrInspectionCard } from "@/components/mobile/OcrInspectionCard";
import { getVisibleMaterialInspections } from "@/lib/mobile/inspection-visibility";
import type { MaterialMaster } from "@/lib/types/domain";
import type { InspectionWithVerificationDto } from "@/lib/types/work-inspection-api";

// 부자재 검수 목록(작업전검수·완료검수 공통 하단 영역). 자재 마스터에서 체크된 검수방법(OCR/비전)만 렌더링하고,
// 같은 부자재의 OCR+비전 항목은 번호를 공유해 서로 다른 부자재처럼 반복 표시되지 않게 한다.
export function MaterialInspectionList({
  workId,
  inspections,
  materials,
  stageLabel,
  onSubmitted
}: {
  workId: string;
  inspections: InspectionWithVerificationDto[];
  materials: MaterialMaster[];
  stageLabel: string;
  onSubmitted: () => Promise<void> | void;
}) {
  const visible = useMemo(
    () => getVisibleMaterialInspections(inspections, materials),
    [inspections, materials]
  );

  const indexById = useMemo(() => {
    const order = new Map<string, number>();
    const result = new Map<string, number>();
    let next = 0;
    visible.forEach((inspection) => {
      const key = inspection.material_id || inspection.id;
      if (!order.has(key)) order.set(key, next++);
      result.set(inspection.id, order.get(key)!);
    });
    return result;
  }, [visible]);

  const doneCount = visible.filter(
    (inspection) => inspection.status === "passed" || inspection.status === "admin_approved"
  ).length;

  if (visible.length === 0) {
    return (
      <CuteCard className="p-4 text-center text-xs font-bold leading-5 text-slate-400">
        검수할 부자재가 없어요.
        <br />
        부자재 마스터에서 OCR·비전 검수 항목을 체크해주세요.
      </CuteCard>
    );
  }

  return (
    <>
      <CuteCard className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-sky-500" />
          <h3 className="text-sm font-black text-slate-800">부자재 검수</h3>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1 text-[11px] font-black text-sky-700">
          완료 {doneCount}/{visible.length}
        </span>
      </CuteCard>

      {visible.map((inspection) => {
        const material = materials.find((item) => item.id === inspection.material_id);
        const materialIndex = indexById.get(inspection.id) ?? 0;

        if (inspection.method === "OCR") {
          return (
            <OcrInspectionCard
              key={inspection.id}
              workId={workId}
              inspection={inspection}
              material={material}
              index={materialIndex}
              onSubmitted={onSubmitted}
            />
          );
        }

        return (
          <CompletionPhotoCard
            key={inspection.id}
            workId={workId}
            inspection={inspection}
            materialId={inspection.material_id}
            eyebrow={`${stageLabel} · 비전 검수`}
            title={`부자재 ${materialIndex + 1} · ${material?.name ?? "-"}`}
            subtitle="등록된 비전 참고 사진을 보며 촬영해 저장하세요"
            onSubmitted={onSubmitted}
          />
        );
      })}
    </>
  );
}
