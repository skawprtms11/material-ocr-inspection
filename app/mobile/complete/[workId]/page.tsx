"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { CompletionPhotoCard } from "@/components/mobile/CompletionPhotoCard";
import { OcrInspectionCard } from "@/components/mobile/OcrInspectionCard";
import { ProductChecklist } from "@/components/mobile/ProductChecklist";
import {
  findInspectionById,
  useMobileCompletionInspectionRows,
  useMobileInspectionRows,
  useMobileMaterials
} from "@/lib/mobile/mobile-api";
import { workStatusLabels } from "@/lib/constants/status";
import { getInspectionAggregateStatus } from "@/lib/server/inspection-status";

// 완료검수(작업완료 시 검수): 작업현황 상태값이 "진행"(in_progress)인 작업만 대상이다(대기/보류/취소/완료 제외).
// 시작검수와 완전히 동일한 프로세스(OCR 실검수/제품검수 체크리스트+사진 압축저장)에 "완료제품사진" 1장 무조건
// 저장 항목만 추가한다. 모두 합격/승인되면 서버가 작업상태를 "완료"로 자동 전이한다(lib/server/work-auto-status.ts,
// 각 검수 저장 API 성공 직후 호출). 이 화면은 상태를 직접 바꾸지 않고 확인만 한다.
export default function MobileCompletionInspectionPage() {
  const params = useParams<{ workId: string }>();
  const router = useRouter();
  const { data: rows, source, warning, isLoading, error, refetch } = useMobileCompletionInspectionRows();
  // 시작검수(stage=start) 완료 여부를 서버 데이터로 직접 검증한다(가드 우회 방지, /mobile 홈의 판정과 동일 로직).
  const { data: startRows, isLoading: isStartLoading } = useMobileInspectionRows();
  const { data: materials } = useMobileMaterials();
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");

  const row = findInspectionById(rows, params.workId);
  const work = row?.work;
  // 작업현황 상태값이 "진행"일 때만 완료검수 대상이다(대기/보류/취소/완료는 대상 아님).
  const workInProgress = work != null && work.status === "in_progress";
  const startRow = findInspectionById(startRows, params.workId);
  const startInspectionDone =
    startRow != null &&
    getInspectionAggregateStatus(startRow.inspections.map((inspection) => inspection.status)) === "completed";
  // 방어 목적으로 시작검수 집계도 함께 확인한다(관리자 웹의 "검수완료" 버튼은 실제 검수 없이도 진행 상태로
  // 바꿀 수 있어 work.status만으로는 완전히 신뢰할 수 없다).
  const canEnterCompletion = workInProgress && startInspectionDone;

  useEffect(() => {
    if (!row || !canEnterCompletion || row.inspections.length > 0 || preparing) return;

    let cancelled = false;
    setPreparing(true);
    setPrepareError("");

    fetch("/api/work-inspection/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workId: params.workId, stage: "complete" })
    })
      .then(async (response) => {
        const payload = (await response.json()) as { error?: string };
        if (!response.ok || payload?.error) throw new Error(payload?.error ?? "완료검수 대상 준비에 실패했습니다.");
        if (!cancelled) await refetch();
      })
      .catch((prepError) => {
        if (!cancelled) {
          setPrepareError(prepError instanceof Error ? prepError.message : "완료검수 대상 준비에 실패했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row?.inspections.length, params.workId, canEnterCompletion]);

  if (isLoading || isStartLoading) {
    return <CuteCard className="p-5 text-center text-sm font-bold text-slate-500">작업 데이터를 불러오는 중이에요.</CuteCard>;
  }

  if (!work) {
    return <CuteCard className="p-5 text-center text-sm font-bold text-slate-500">작업을 찾지 못했어요.</CuteCard>;
  }

  if (!workInProgress) {
    return (
      <CuteCard className="p-5 text-center text-sm font-bold leading-6 text-slate-500">
        작업현황 상태값이 "진행"인 작업만 완료검수할 수 있어요.
        <br />
        현재 상태: {workStatusLabels[work.status] ?? work.status}
      </CuteCard>
    );
  }

  if (!startInspectionDone) {
    return (
      <CuteCard className="p-5 text-center text-sm font-bold leading-6 text-slate-500">
        시작검수를 먼저 완료해주세요.
        <br />
        부자재 OCR/제품검수가 모두 합격(또는 관리자 승인)되어야 완료검수를 진행할 수 있어요.
      </CuteCard>
    );
  }

  const productPhotoInspection = row?.inspections.find((item) => item.method === "PRODUCT");
  const materialInspections = row?.inspections.filter((item) => item.method !== "PRODUCT") ?? [];
  // 같은 부자재의 OCR+비전 항목이 서로 다른 번호로 보이지 않도록 부자재 단위로 번호를 공유한다(반복 표시 방지).
  const materialIndexById = new Map<string, number>();
  {
    const order = new Map<string, number>();
    let next = 0;
    materialInspections.forEach((inspection) => {
      const key = inspection.material_id || inspection.id;
      if (!order.has(key)) order.set(key, next++);
      materialIndexById.set(inspection.id, order.get(key)!);
    });
  }
  const allInspections = row?.inspections ?? [];
  const allDone =
    allInspections.length > 0 &&
    allInspections.every((item) => item.status === "passed" || item.status === "admin_approved");

  // 완료 상태는 마지막 완료검수 항목이 저장/승인되는 시점에 서버가 자동으로 전이시킨다
  // (lib/server/work-auto-status.ts). 이 버튼은 상태를 직접 바꾸지 않고 최신 상태를 다시 확인만 한다
  // (수동으로 "완료"를 지정하는 PATCH는 서버에서 거부된다).
  const handleComplete = async () => {
    setCompleting(true);
    setCompleteError("");

    try {
      await refetch();
      toast.success("작업이 완료 처리되었습니다.");
      router.push("/mobile/status");
    } catch (completeErr) {
      const message = completeErr instanceof Error ? completeErr.message : "완료 확인에 실패했습니다.";
      setCompleteError(message);
      toast.error(message);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <p className="text-xs font-black text-violet-600">완료검수</p>
        <h1 className="mt-1 text-2xl font-black text-slate-800">{work.document_no}</h1>
        <p className="mt-1 text-sm font-bold text-slate-500">{work.worker_name || "미할당"} 작업</p>
        <p className="mt-2 text-xs font-black text-slate-400">
          데이터: {source === "supabase" ? "Supabase" : "Mock/Fallback"}
        </p>
      </CuteCard>

      {(warning || error || prepareError) && (
        <CuteCard className="p-3 text-xs font-bold leading-5 text-amber-700">{error || prepareError || warning}</CuteCard>
      )}

      {preparing && (
        <CuteCard className="flex items-center justify-center gap-2 p-4 text-sm font-bold text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          완료검수 대상 준비 중...
        </CuteCard>
      )}

      {productPhotoInspection && (
        <CompletionPhotoCard
          workId={work.id}
          inspection={productPhotoInspection}
          title="완료제품 사진"
          subtitle="완료된 제품 사진을 1장 촬영해 저장하세요 (필수)"
          onSubmitted={refetch}
        />
      )}

      <ProductChecklist workId={work.id} />

      {materialInspections.map((inspection) => {
        const material = materials.find((item) => item.id === inspection.material_id);
        const materialIndex = materialIndexById.get(inspection.id) ?? 0;

        if (inspection.method === "OCR") {
          return (
            <OcrInspectionCard
              key={inspection.id}
              workId={work.id}
              inspection={inspection}
              material={material}
              index={materialIndex}
              onSubmitted={refetch}
            />
          );
        }

        // 시작검수와 동일하게 비전 참고 사진을 보여주고 촬영한 사진을 압축 후 저장한다(체크리스트 없음).
        return (
          <CompletionPhotoCard
            key={inspection.id}
            workId={work.id}
            inspection={inspection}
            materialId={inspection.material_id}
            title={`부자재 ${materialIndex + 1} · ${material?.name ?? "-"}`}
            subtitle="등록된 비전 참고 사진을 보며 촬영해 저장하세요"
            onSubmitted={refetch}
          />
        );
      })}

      {completeError && (
        <CuteCard className="p-3 text-xs font-bold leading-5 text-rose-700">{completeError}</CuteCard>
      )}

      <CloudButton className="w-full" disabled={!allDone || completing} onClick={() => void handleComplete()}>
        <PackageCheck className="size-4" />
        {completing ? "확인 중..." : "완료 확인하고 나가기"}
      </CloudButton>
      {!allDone && (
        <p className="text-center text-xs font-bold text-slate-500">
          <CheckCircle2 className="mr-1 inline size-3.5" />
          완료제품 사진과 모든 부자재 항목이 저장(또는 관리자 승인)되면 작업이 자동으로 완료 처리돼요.
        </p>
      )}
      {allDone && (
        <p className="text-center text-xs font-bold text-emerald-600">
          <CheckCircle2 className="mr-1 inline size-3.5" />
          모든 항목이 완료돼 작업이 자동으로 완료 처리됐어요.
        </p>
      )}
    </div>
  );
}
