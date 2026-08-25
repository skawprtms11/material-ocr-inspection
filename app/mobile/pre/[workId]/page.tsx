"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, PackageCheck } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { MaterialInspectionList } from "@/components/mobile/MaterialInspectionList";
import { ProductChecklist } from "@/components/mobile/ProductChecklist";
import { getWorkStatusLabel, workStatusLabels } from "@/lib/constants/status";
import { getActiveInspections } from "@/lib/mobile/inspection-visibility";
import { findInspectionById, useMobileInspectionRows, useMobileMaterials } from "@/lib/mobile/mobile-api";
import { getInspectionAggregateStatus } from "@/lib/server/inspection-status";

// 작업전 검수(stage="start"): 작업현황 상태값이 "대기"(registered)인 작업을 문서번호로 스캔하면 이 화면으로
// 바로 들어온다. 화면 구성은 상단 제품내역(제품코드/제품명/LOT/단위수량/사용수량 + 검수여부 체크박스),
// 하단 부자재 검수(부자재 마스터에서 체크된 OCR/비전 항목만)로 고정된다.
// 부자재 검수가 모두 합격/승인되면 서버가 작업상태를 "진행"으로 자동 전이시킨다(lib/server/work-auto-status.ts).
export default function MobilePreInspectionPage() {
  const params = useParams<{ workId: string }>();
  const router = useRouter();
  const { data: rows, warning, isLoading, error, refetch } = useMobileInspectionRows();
  const { data: materials } = useMobileMaterials();
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState("");

  const row = findInspectionById(rows, params.workId);
  const work = row?.work;
  const inspections = row?.inspections ?? [];
  // 완료 판정은 화면에 실제 표시되는 항목(마스터에서 체크된 부자재 검수)만 대상으로 한다.
  const activeInspections = getActiveInspections(inspections, materials);
  const allDone =
    activeInspections.length > 0 &&
    getInspectionAggregateStatus(activeInspections.map((item) => item.status)) === "completed";
  // 취소/완료된 작업은 데이터 오염을 막기 위해 검수를 진행할 수 없다(스캔 화면에서도 동일하게 차단된다).
  const closedWork = work != null && (work.status === "canceled" || work.status === "completed" || work.status === "passed");

  // 배정 시점에 검수 행이 만들어지지 않은 기존 작업을 커버하는 lazy 생성(기존 스캔 시점 로직을 이 화면으로 옮김).
  useEffect(() => {
    if (!work || closedWork || inspections.length > 0 || preparing) return;

    let cancelled = false;
    setPreparing(true);
    setPrepareError("");

    fetch("/api/work-inspection/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workId: params.workId })
    })
      .then(async (response) => {
        const payload = (await response.json()) as { error?: string };
        if (!response.ok || payload?.error) throw new Error(payload?.error ?? "검수 대상 준비에 실패했습니다.");
        if (!cancelled) await refetch();
      })
      .catch((setupError) => {
        if (!cancelled) {
          setPrepareError(setupError instanceof Error ? setupError.message : "검수 대상 준비에 실패했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work?.id, inspections.length, closedWork]);

  if (isLoading) {
    return <CuteCard className="p-5 text-center text-sm font-bold text-slate-500">작업 데이터를 불러오는 중이에요.</CuteCard>;
  }

  if (!work) {
    return <CuteCard className="p-5 text-center text-sm font-bold text-slate-500">작업을 찾지 못했어요.</CuteCard>;
  }

  if (closedWork) {
    return (
      <div className="space-y-4">
        <CuteCard className="p-5 text-center text-sm font-bold leading-6 text-slate-500">
          이미 {workStatusLabels[work.status]} 처리된 작업이라 작업전 검수를 진행할 수 없어요.
        </CuteCard>
        <CloudButton className="w-full" tone="soft" onClick={() => router.push("/mobile")}>
          작업문서 스캔으로
        </CloudButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <p className="text-xs font-black text-sky-600">작업전 검수</p>
        <h1 className="mt-1 text-2xl font-black text-slate-800">{work.document_no}</h1>
        <p className="mt-1 text-sm font-bold text-slate-500">
          {work.worker_name || "미할당"} · {getWorkStatusLabel(work.status, "start")}
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
          검수 대상 준비 중...
        </CuteCard>
      )}

      <ProductChecklist workId={work.id} />

      <MaterialInspectionList
        workId={work.id}
        inspections={inspections}
        materials={materials}
        stageLabel="작업전 검수"
        onSubmitted={refetch}
      />

      {allDone ? (
        <>
          <CuteCard className="p-5 text-center">
            <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
            <h2 className="mt-3 text-xl font-black text-slate-800">작업전 검수 완료</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              작업상태가 "진행"으로 전환됐어요. 작업이 끝나면 같은 문서번호를 스캔해 완료검수를 진행하세요.
            </p>
          </CuteCard>
          <CloudButton className="w-full" onClick={() => router.push(`/mobile/complete/${work.id}`)}>
            <PackageCheck className="size-4" />
            완료검수로 이동
          </CloudButton>
          <CloudButton className="w-full" tone="soft" onClick={() => router.push("/mobile")}>
            다음 작업문서 스캔
          </CloudButton>
        </>
      ) : (
        <p className="text-center text-xs font-bold leading-5 text-slate-500">
          제품내역을 확인하고 부자재 검수를 모두 저장하면 작업전 검수가 완료돼요.
        </p>
      )}
    </div>
  );
}
