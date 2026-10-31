"use client";

import { useMemo } from "react";
import { ClipboardList } from "lucide-react";
import { CuteCard } from "@/components/common/CuteCard";
import { CompletionPhotoCard } from "@/components/mobile/CompletionPhotoCard";
import { OcrInspectionCard } from "@/components/mobile/OcrInspectionCard";
import { PhotoReviewCard } from "@/components/mobile/PhotoReviewCard";
import { getVisibleMaterialInspections } from "@/lib/mobile/inspection-visibility";
import type { MaterialMaster } from "@/lib/types/domain";
import type { InspectionWithVerificationDto, PhotoReviewItemDto } from "@/lib/types/work-inspection-api";

// 부자재 검수 목록(작업전검수·완료검수 공통 하단 영역). 자재 마스터 검수방법에 따라 OCR/비전 카드를,
// OCR·비전 둘 다 미체크(사진검수, method=PHOTO)면 사진 제출 카드(PhotoReviewCard)를 렌더링하고,
// 같은 부자재의 OCR+비전 항목은 번호를 공유해 서로 다른 부자재처럼 반복 표시되지 않게 한다.
export function MaterialInspectionList({
  workId,
  inspections,
  materials,
  stageLabel,
  photoItems,
  locked = false,
  onSubmitted
}: {
  workId: string;
  inspections: InspectionWithVerificationDto[];
  materials: MaterialMaster[];
  stageLabel: string;
  photoItems?: Map<string, PhotoReviewItemDto>;
  // 작업이 관리자 승인 검토 중이면 사진 촬영을 잠근다.
  locked?: boolean;
  onSubmitted: () => Promise<unknown> | void;
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
      <CuteCard className="p-4 text-center text-xs leading-5 text-muted-foreground">
        검수할 부자재가 없습니다.
      </CuteCard>
    );
  }

  return (
    <>
      <CuteCard className="flex items-center justify-between gap-2 p-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">부자재 검수</h3>
        </div>
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
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

        if (inspection.method === "PHOTO") {
          return (
            <PhotoReviewCard
              key={inspection.id}
              workId={workId}
              inspection={inspection}
              item={photoItems?.get(inspection.id)}
              eyebrow={`${stageLabel} · 사진검수`}
              title={`부자재 ${materialIndex + 1} · ${material?.name ?? "-"}`}
              codeText={material?.code ? `부자재코드 ${material.code}` : undefined}
              locked={locked}
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
