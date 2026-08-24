"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, Camera, CheckCircle2, ClipboardCheck, FileSearch, PackageCheck, RotateCcw } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { CompletionPhotoCard } from "@/components/mobile/CompletionPhotoCard";
import { OcrInspectionCard } from "@/components/mobile/OcrInspectionCard";
import { ProductChecklist } from "@/components/mobile/ProductChecklist";
import { useMobileInspectionRows, useMobileMaterials } from "@/lib/mobile/mobile-api";
import { getInspectionAggregateStatus } from "@/lib/server/inspection-status";
import type { MaterialMaster } from "@/lib/types/domain";
import type { InspectionTableRowDto } from "@/lib/types/work-inspection-api";
import { cn } from "@/lib/utils/cn";

type InspectionTab = "scan" | "product" | "done";

type ProductTarget = {
  id: string;
  productCode: string;
  productName: string;
  lot: string;
  materialCode: string;
  materialName: string;
};

function getProductTargets(row: InspectionTableRowDto | undefined, materials: MaterialMaster[]): ProductTarget[] {
  if (!row) return [];

  if (row.inspections.length === 0) {
    return [
      {
        id: row.work.id,
        productCode: row.finishedProductCode,
        productName: row.finishedProductName,
        lot: row.work.finished_product_lot ?? "-",
        materialCode: row.finishedProductCode,
        materialName: row.finishedProductName
      }
    ];
  }

  return row.inspections.map((inspection, index) => {
    const material = materials.find((item) => item.id === inspection.material_id);

    return {
      id: inspection.id,
      productCode: row.finishedProductCode,
      productName: row.finishedProductName,
      lot: material?.lot ?? row.work.finished_product_lot ?? "-",
      materialCode: material?.code ?? inspection.material_id,
      materialName: material?.name || `검수대상 ${index + 1}`
    };
  });
}

function isTerminalPass(status?: string) {
  return status === "passed" || status === "admin_approved";
}

function ScanDocumentInfo({ row, targets }: { row: InspectionTableRowDto; targets: ProductTarget[] }) {
  return (
    <CuteCard className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-emerald-600">스캔된 문서정보</p>
          <h2 className="mt-1 text-xl font-black text-slate-800">{row.work.document_no}</h2>
        </div>
        <CheckCircle2 className="size-7 text-emerald-500" />
      </div>
      <dl className="grid grid-cols-[82px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="font-black text-slate-400">제품코드</dt>
        <dd className="font-bold text-slate-800">{row.finishedProductCode}</dd>
        <dt className="font-black text-slate-400">제품명</dt>
        <dd className="font-bold text-slate-800">{row.finishedProductName}</dd>
        <dt className="font-black text-slate-400">LOT</dt>
        <dd className="font-bold text-slate-800">{targets.map((target) => target.lot).join(", ")}</dd>
      </dl>
      <div className="mt-4">
        <p className="mb-2 text-xs font-black text-slate-400">부자재코드</p>
        <div className="flex flex-wrap gap-2">
          {targets.map((target) => (
            <span key={target.id} className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">
              {target.materialCode}
            </span>
          ))}
        </div>
      </div>
    </CuteCard>
  );
}

// 검수 행이 아예 없는 예외(작업마스터에 부자재 구성이 없는 등) 전용 로컬 전용 카드. 저장할 서버 대상이 없어
// 사진을 로컬 상태로만 표시하고 서버 호출은 하지 않는다.
function LocalOnlyProductCard({ target, index }: { target: ProductTarget; index: number }) {
  const [checked, setChecked] = useState({ code: false, name: false, lot: false });
  const [photoName, setPhotoName] = useState("");
  const ready = checked.code && checked.name && checked.lot;

  const capture = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPhotoName(file.name);
  };

  return (
    <CuteCard className="p-4">
      <div className="mb-4">
        <p className="text-xs font-black text-sky-600">제품 {index + 1}</p>
        <h3 className="mt-1 text-lg font-black text-slate-800">{target.productName}</h3>
        <p className="mt-1 text-xs font-bold text-slate-400">부자재코드 {target.materialCode}</p>
      </div>
      <div className="space-y-2 text-sm font-bold text-slate-600">
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-sky-100">
          제품코드 {target.productCode}
          <input type="checkbox" checked={checked.code} onChange={(event) => setChecked((current) => ({ ...current, code: event.target.checked }))} className="size-5 accent-emerald-500" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-sky-100">
          제품명 {target.productName}
          <input type="checkbox" checked={checked.name} onChange={(event) => setChecked((current) => ({ ...current, name: event.target.checked }))} className="size-5 accent-emerald-500" />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-sky-100">
          LOT {target.lot}
          <input type="checkbox" checked={checked.lot} onChange={(event) => setChecked((current) => ({ ...current, lot: event.target.checked }))} className="size-5 accent-emerald-500" />
        </label>
      </div>
      <label
        className={cn(
          "mt-4 flex aspect-[4/3] flex-col items-center justify-center rounded-[1.4rem] border-2 border-dashed text-center transition",
          ready ? "cursor-pointer border-sky-200 bg-sky-50/70" : "cursor-not-allowed border-slate-200 bg-slate-100/80"
        )}
      >
        <Camera className="mb-3 size-12 text-sky-400" />
        <p className="font-black text-slate-800">대상 제품 사진 촬영</p>
        <p className="mt-2 px-4 text-xs font-semibold leading-5 text-slate-500">
          {photoName || (ready ? "촬영하면 로컬에만 표시됩니다(검수 대상 없음)." : "제품정보 3개 항목을 먼저 체크해주세요.")}
        </p>
        <input type="file" accept="image/*" capture="environment" disabled={!ready} className="sr-only" onChange={capture} aria-label={`${target.productName} 제품 사진 촬영`} />
      </label>
      {photoName && (
        <CloudButton className="mt-3 w-full" tone="soft" onClick={() => setPhotoName("")}>
          <RotateCcw className="size-4" />
          다시 촬영
        </CloudButton>
      )}
    </CuteCard>
  );
}

export default function MobileInspectionWorkflowPage() {
  const { data: rows, source, warning, isLoading, error, refetch } = useMobileInspectionRows();
  const { data: materials } = useMobileMaterials();
  const [tab, setTab] = useState<InspectionTab>("scan");
  const [documentNo, setDocumentNo] = useState("");
  const [scannedWorkId, setScannedWorkId] = useState("");
  const [scanError, setScanError] = useState("");
  const [preparingInspections, setPreparingInspections] = useState(false);
  const router = useRouter();

  const scannedRow = rows.find((row) => row.work.id === scannedWorkId);
  const targets = useMemo(() => getProductTargets(scannedRow, materials), [materials, scannedRow]);
  // 같은 부자재가 OCR+비전 둘 다 필요하면 검수 행이 2개라 target도 2개가 되는데, 번호를 따로 매기면 서로
  // 다른 항목처럼 보인다("반복 표시"). 부자재 단위로 번호를 공유해 "부자재 N · OCR"/"부자재 N · 비전"으로
  // 묶어 보이게 한다.
  const materialIndexByTargetId = useMemo(() => {
    const order = new Map<string, number>();
    const indexByTarget = new Map<string, number>();
    let next = 0;
    targets.forEach((target) => {
      const inspection = scannedRow?.inspections.find((item) => item.id === target.id);
      const key = inspection?.material_id || target.id;
      if (!order.has(key)) order.set(key, next++);
      indexByTarget.set(target.id, order.get(key)!);
    });
    return indexByTarget;
  }, [targets, scannedRow]);
  // 작업현황 상태값이 "진행"이면(=시작검수 완료 후 시스템이 자동 전이한 상태) "검수시작" 대신 완료검수로
  // 안내한다. 집계도 함께 확인해 관리자 웹의 수동 "검수완료" 버튼으로 진행 상태가 된 예외 상황을 방어한다.
  const startInspectionDone =
    scannedRow != null &&
    scannedRow.work.status === "in_progress" &&
    getInspectionAggregateStatus(scannedRow.inspections.map((inspection) => inspection.status)) === "completed";
  // 문서 로드 시 상단 라벨: 아직 스캔 전이면 "작업검수", 시작검수 대상이면 "작업전 검수", 완료검수 대상이면 "완료검수".
  const scanLabel = !scannedRow ? "작업검수" : startInspectionDone ? "완료검수" : "작업전 검수";

  const completedCount = useMemo(() => {
    return targets.filter((target) => {
      const inspection = scannedRow?.inspections.find((item) => item.id === target.id);
      if (!inspection) return false; // 검수 대상 없는 로컬 전용 카드는 완료 집계에 포함하지 않는다(서버 판정 없음).
      return isTerminalPass(inspection.status);
    }).length;
  }, [targets, scannedRow]);
  const allProductsSaved = targets.length > 0 && completedCount === targets.length;

  const handleScan = async () => {
    const matched = rows.find((row) => row.work.document_no.toLowerCase() === documentNo.trim().toLowerCase());

    if (!matched) {
      setScannedWorkId("");
      setScanError("이 문서번호를 찾지 못했어요.");
      return;
    }

    if (matched.inspections.length === 0) {
      // 기존에 배정 시점에만 생성되던 검수 행을 스캔 시점에 lazy 생성해 커버한다.
      setPreparingInspections(true);
      setScanError("");
      try {
        const response = await fetch("/api/work-inspection/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workId: matched.work.id })
        });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok || payload?.error) throw new Error(payload?.error ?? "검수 대상 준비에 실패했습니다.");
        await refetch();
      } catch (error) {
        setPreparingInspections(false);
        setScanError(error instanceof Error ? error.message : "검수 대상 준비에 실패했습니다.");
        return;
      }
      setPreparingInspections(false);
    }

    setScannedWorkId(matched.work.id);
    setScanError("");
  };

  const startInspection = () => {
    if (!scannedRow) return;
    // 시작검수가 이미 끝난 문서는 여기서 완료검수 화면으로 보낸다("검수시작" 자리에 "완료검수"로 안내).
    if (startInspectionDone) {
      router.push(`/mobile/complete/${scannedRow.work.id}`);
      return;
    }
    if (targets.length === 0) return;
    setTab("product");
  };

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-sky-500" />
          <p className="text-xs font-black text-sky-600">{scanLabel}</p>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">
          {tab === "scan" ? "작업문서스캔" : tab === "product" ? "제품검수" : "검수 완료"}
        </h1>
        <p className="mt-2 text-xs font-black text-slate-400">
          {isLoading ? "데이터 동기화 중" : `데이터: ${source === "supabase" ? "Supabase" : "Mock/Fallback"}`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black">
          <button
            type="button"
            onClick={() => setTab("scan")}
            className={cn("rounded-full px-3 py-2", tab === "scan" ? "bg-sky-500 text-white" : "bg-white text-slate-400")}
          >
            작업문서스캔
          </button>
          <button
            type="button"
            disabled={!scannedRow}
            onClick={() => setTab("product")}
            className={cn(
              "rounded-full px-3 py-2 disabled:opacity-50",
              tab === "product" || tab === "done" ? "bg-sky-500 text-white" : "bg-white text-slate-400"
            )}
          >
            제품검수
          </button>
        </div>
      </CuteCard>

      {(warning || error) && (
        <CuteCard className="flex items-center justify-between gap-3 p-3 text-xs font-bold leading-5 text-amber-700">
          <span>{error || warning}</span>
          {error && (
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

      {tab === "scan" && (
        <>
          <CuteCard className="p-4">
            <div className="mb-4 flex aspect-square flex-col items-center justify-center rounded-[1.6rem] border-2 border-dashed border-sky-200 bg-sky-50/70 text-center">
              <Barcode className="mb-4 size-16 text-sky-400" />
              <p className="font-black text-slate-800">작업문서 바코드 스캔</p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                실제 카메라 스캔은 추후 BarcodeDetector 또는 @zxing/browser로 연결합니다.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">문서번호</span>
              <input
                value={documentNo}
                onChange={(event) => {
                  setDocumentNo(event.target.value);
                  setScanError("");
                }}
                className="h-12 w-full rounded-2xl border border-sky-100 bg-white px-4 text-base font-bold outline-none focus:ring-2 focus:ring-sky-200"
                placeholder="DOC-2026-1001"
                aria-label="작업문서 번호"
              />
            </label>
            {scanError && <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{scanError}</p>}
            {preparingInspections && (
              <p className="mt-3 rounded-2xl bg-sky-50 p-3 text-sm font-bold text-sky-600">검수 대상 준비 중...</p>
            )}
            <CloudButton className="mt-4 w-full" disabled={preparingInspections} onClick={() => void handleScan()}>
              <FileSearch className="size-4" />
              스캔
            </CloudButton>
          </CuteCard>

          {scannedRow && <ScanDocumentInfo row={scannedRow} targets={targets} />}

          <CloudButton
            className="w-full"
            disabled={!scannedRow || (!startInspectionDone && targets.length === 0)}
            onClick={startInspection}
          >
            <PackageCheck className="size-4" />
            {startInspectionDone ? "완료검수" : "검수시작"}
          </CloudButton>
          {scannedRow && startInspectionDone && (
            <p className="text-center text-xs font-bold text-slate-500">
              이 문서는 작업전 검수가 완료됐어요. "완료검수"를 누르면 완료검수 화면으로 이동합니다.
            </p>
          )}
        </>
      )}

      {tab === "product" && scannedRow && (
        <>
          <CuteCard className="p-4">
            <p className="text-xs font-black text-violet-600">작업전 검수</p>
            <h2 className="mt-1 text-xl font-black text-slate-800">{scannedRow.work.document_no}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              제품목록을 확인하고, 부자재는 OCR 영역설정 또는 비전 참고 사진을 보며 촬영해 저장합니다.
            </p>
            <div className="mt-3 rounded-2xl bg-white/80 p-3 text-sm font-black text-slate-600 ring-1 ring-sky-100">
              부자재 검수 완료 {completedCount}/{targets.length}
            </div>
          </CuteCard>

          <ProductChecklist workId={scannedRow.work.id} />

          {targets.map((target, index) => {
            const inspection = scannedRow.inspections.find((item) => item.id === target.id);
            const materialIndex = materialIndexByTargetId.get(target.id) ?? index;

            if (!inspection) {
              return <LocalOnlyProductCard key={target.id} target={target} index={materialIndex} />;
            }

            if (inspection.method === "OCR") {
              return (
                <OcrInspectionCard
                  key={target.id}
                  workId={scannedRow.work.id}
                  inspection={inspection}
                  material={materials.find((item) => item.id === inspection.material_id)}
                  index={materialIndex}
                  onSubmitted={refetch}
                />
              );
            }

            return (
              <CompletionPhotoCard
                key={target.id}
                workId={scannedRow.work.id}
                inspection={inspection}
                materialId={inspection.material_id}
                title={`부자재 ${materialIndex + 1} · ${target.materialName}`}
                subtitle="등록된 비전 참고 사진을 보며 촬영해 저장하세요"
                onSubmitted={refetch}
              />
            );
          })}

          <CloudButton className="w-full" disabled={!allProductsSaved} onClick={() => setTab("done")}>
            제품검수 완료
          </CloudButton>
        </>
      )}

      {tab === "done" && (
        <CuteCard className="p-5 text-center">
          <CheckCircle2 className="mx-auto size-16 text-emerald-500" />
          <h2 className="mt-3 text-2xl font-black text-slate-800">제품검수 완료</h2>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            문서번호 기준으로 제품 사진과 부자재코드가 매칭되었습니다.
          </p>
          <CloudButton
            className="mt-4 w-full"
            onClick={() => {
              setTab("scan");
              setScannedWorkId("");
            }}
          >
            다음 작업문서 스캔
          </CloudButton>
        </CuteCard>
      )}
    </div>
  );
}
