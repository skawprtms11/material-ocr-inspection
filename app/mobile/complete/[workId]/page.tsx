"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { CompletionProductPhotoCard } from "@/components/mobile/CompletionProductPhotoCard";
import { MaterialInspectionList } from "@/components/mobile/MaterialInspectionList";
import { ProductChecklist } from "@/components/mobile/ProductChecklist";
import { getWorkStatusLabel } from "@/lib/constants/status";
import { getActiveInspections } from "@/lib/mobile/inspection-visibility";
import {
  findInspectionById,
  useMobileCompletionInspectionRows,
  useMobileMaterials
} from "@/lib/mobile/mobile-api";
import { getInspectionAggregateStatus } from "@/lib/server/inspection-status";

// 완료검수(stage="complete"): 작업현황 상태값이 "진행"(in_progress)인 작업을 문서번호로 스캔하면 이 화면으로
// 바로 들어온다. 화면 구성은 작업전 검수와 동일하게 상단 제품내역 + 하단 부자재 검수이며, 여기에 "완료제품
// 사진등록"(1~3장, 압축 저장)이 추가된다.
// 모든 완료검수 항목이 합격/승인되면 서버가 작업상태를 "완료"로 자동 전이시킨다(lib/server/work-auto-status.ts,
// 각 검수 저장 API 성공 직후 호출). 이 화면은 상태를 직접 바꾸지 않고 확인만 한다.
export default function MobileCompletionInspectionPage() {
  const params = useParams<{ workId: string }>();
  const router = useRouter();
  const { data: rows, warning, isLoading, error, refetch } = useMobileCompletionInspectionRows();
  const { data: materials } = useMobileMaterials();
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");
  const [completing, setCompleting] = useState(false);

  const row = findInspectionById(rows, params.workId);
  const work = row?.work;
  const inspections = row?.inspections ?? [];
  // 취소/완료된 작업은 데이터 오염을 막기 위해 완료검수를 진행할 수 없다(스캔 화면에서도 동일하게 차단된다).
  const closedWork = work != null && (work.status === "canceled" || work.status === "completed" || work.status === "passed");
  // 완료검수는 작업전 검수가 끝나 작업상태가 "진행"이 된 작업만 대상이다. 서버(setup API)에서도 동일하게 막는다.
  const canEnterCompletion = work != null && !closedWork && work.status === "in_progress";

  useEffect(() => {
    if (!row || !canEnterCompletion || inspections.length > 0 || preparing) return;

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
  }, [inspections.length, params.workId, canEnterCompletion]);

  if (isLoading) {
    return <CuteCard className="p-5 text-center text-sm font-bold text-slate-500">작업 데이터를 불러오는 중이에요.</CuteCard>;
  }

  if (!work) {
    return <CuteCard className="p-5 text-center text-sm font-bold text-slate-500">작업을 찾지 못했어요.</CuteCard>;
  }

  if (!canEnterCompletion) {
    return (
      <div className="space-y-4">
        <CuteCard className="p-5 text-center text-sm font-bold leading-6 text-slate-500">
          작업현황 상태값이 "진행"인 작업만 완료검수할 수 있어요.
          <br />
          현재 상태: {getWorkStatusLabel(work.status, "complete")}
        </CuteCard>
        {work.status === "registered" && (
          <CloudButton className="w-full" onClick={() => router.push(`/mobile/pre/${work.id}`)}>
            <PackageCheck className="size-4" />
            작업전 검수로 이동
          </CloudButton>
        )}
        <CloudButton className="w-full" tone="soft" onClick={() => router.push("/mobile")}>
          작업문서 스캔으로
        </CloudButton>
      </div>
    );
  }

  const productPhotoInspection = inspections.find((item) => item.method === "PRODUCT");
  // 완료 판정은 화면에 실제 표시되는 항목(마스터에서 체크된 부자재 검수 + 완료제품 사진)만 대상으로 한다.
  const activeInspections = getActiveInspections(inspections, materials);
  const allDone =
    activeInspections.length > 0 &&
    getInspectionAggregateStatus(activeInspections.map((item) => item.status)) === "completed";

  // 완료 상태는 마지막 완료검수 항목이 저장/승인되는 시점에 서버가 자동으로 전이시킨다
  // (lib/server/work-auto-status.ts). 이 버튼은 상태를 직접 바꾸지 않고 최신 상태를 다시 확인만 한다.
  const handleComplete = async () => {
    setCompleting(true);
    try {
      await refetch();
      toast.success("작업이 완료 처리되었습니다.");
      router.push("/mobile/status");
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <p className="text-xs font-black text-violet-600">완료검수</p>
        <h1 className="mt-1 text-2xl font-black text-slate-800">{work.document_no}</h1>
        <p className="mt-1 text-sm font-bold text-slate-500">
          {work.worker_name || "미할당"} · {getWorkStatusLabel(work.status, "complete")}
        </p>
      </CuteCard>

      {(warning || error || prepareError) && (
        <CuteCard className="flex items-center justify-between gap-3 p-3 text-xs font-bold leading-5 text-amber-700">
          <span>{error || prepareError || warning}</span>
          {(error || prepareError) && (
            <button
              type="button"
              onClick={() => void refetch()}
              className="shrink-0 rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-black text-amber-800"
            >
              다시 시도
            </button>
          )}
        </CuteCard>
      )}

      {preparing && (
        <CuteCard className="flex items-center justify-center gap-2 p-4 text-sm font-bold text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          완료검수 대상 준비 중...
        </CuteCard>
      )}

      <ProductChecklist workId={work.id} />

      <MaterialInspectionList
        workId={work.id}
        inspections={inspections}
        materials={materials}
        stageLabel="완료검수"
        onSubmitted={refetch}
      />

      {productPhotoInspection && (
        <CompletionProductPhotoCard workId={work.id} inspection={productPhotoInspection} onSubmitted={refetch} />
      )}

      <CloudButton className="w-full" disabled={!allDone || completing} onClick={() => void handleComplete()}>
        <PackageCheck className="size-4" />
        {completing ? "확인 중..." : "완료 확인하고 나가기"}
      </CloudButton>
      <p className={allDone ? "text-center text-xs font-bold text-emerald-600" : "text-center text-xs font-bold leading-5 text-slate-500"}>
        <CheckCircle2 className="mr-1 inline size-3.5" />
        {allDone
          ? "모든 항목이 완료돼 작업현황 상태가 \"완료\"로 변경됐어요."
          : "부자재 검수와 완료제품 사진(최소 1장)이 모두 저장되면 작업현황 상태가 \"완료\"로 자동 변경돼요."}
      </p>
    </div>
  );
}
