"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { Barcode, Camera, CheckCircle2, ClipboardCheck, FileSearch, PackageCheck, RotateCcw } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { appRepository } from "@/lib/repositories/app-repository";
import type { MaterialMaster, Work } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type InspectionTab = "scan" | "product" | "done";
type ProductPhotoState = {
  productCodeChecked: boolean;
  productNameChecked: boolean;
  lotChecked: boolean;
  photoName: string;
  storagePath: string;
  compressed: boolean;
};

type ProductTarget = {
  id: string;
  productCode: string;
  productName: string;
  lot: string;
  materialCode: string;
  materialName: string;
};

const emptyPhotoState: ProductPhotoState = {
  productCodeChecked: false,
  productNameChecked: false,
  lotChecked: false,
  photoName: "",
  storagePath: "",
  compressed: false
};

function getWorkMaster(work?: Work) {
  if (!work) return undefined;
  return appRepository
    .listWorkMasters({ departmentId: work.department_id, shipperId: work.shipper_id })
    .find((item) => item.id === work.work_master_id);
}

function getWorkMaterials(work?: Work) {
  if (!work) return [];

  const mappings = appRepository
    .listWorkMasterMaterials(work.work_master_id)
    .sort((a, b) => a.inspection_order - b.inspection_order);
  const materials = appRepository.listMaterials({ departmentId: work.department_id, shipperId: work.shipper_id });

  return mappings
    .map((mapping) => materials.find((material) => material.id === mapping.material_id))
    .filter((material): material is MaterialMaster => Boolean(material));
}

function getProductTargets(work?: Work): ProductTarget[] {
  const workMaster = getWorkMaster(work);
  const materials = getWorkMaterials(work);

  return materials.map((material, index) => ({
    id: material.id,
    productCode: workMaster?.code ?? work?.work_master_id.toUpperCase() ?? "-",
    productName: workMaster?.name ?? "-",
    lot: material.lot ?? "-",
    materialCode: material.code,
    materialName: material.name || `제품 ${index + 1}`
  }));
}

function getInitialPhotoMap(targets: ProductTarget[]) {
  return targets.reduce<Record<string, ProductPhotoState>>((acc, target) => {
    acc[target.id] = { ...emptyPhotoState };
    return acc;
  }, {});
}

function isProductReady(state?: ProductPhotoState) {
  return Boolean(state?.productCodeChecked && state.productNameChecked && state.lotChecked);
}

function isProductSaved(state?: ProductPhotoState) {
  return Boolean(isProductReady(state) && state?.storagePath);
}

function ChecklistRow({
  label,
  value,
  checked,
  onChange
}: {
  label: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-13 items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold ring-1 transition",
        checked ? "bg-emerald-50 text-emerald-800 ring-emerald-100" : "bg-white text-slate-700 ring-sky-100"
      )}
    >
      <span className="min-w-0">
        <span className="block text-[11px] font-black text-slate-400">{label}</span>
        <span className="block truncate">{value}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 accent-emerald-500"
      />
    </label>
  );
}

function ScanDocumentInfo({ work, targets }: { work: Work; targets: ProductTarget[] }) {
  const workMaster = getWorkMaster(work);

  return (
    <CuteCard className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-emerald-600">스캔된 문서정보</p>
          <h2 className="mt-1 text-xl font-black text-slate-800">{work.document_no}</h2>
        </div>
        <CheckCircle2 className="size-7 text-emerald-500" />
      </div>
      <dl className="grid grid-cols-[82px_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className="font-black text-slate-400">제품코드</dt>
        <dd className="font-bold text-slate-800">{workMaster?.code ?? "-"}</dd>
        <dt className="font-black text-slate-400">제품명</dt>
        <dd className="font-bold text-slate-800">{workMaster?.name ?? "-"}</dd>
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

export default function MobileInspectionWorkflowPage() {
  const works = useMemo(() => appRepository.listWorks({}), []);
  const [tab, setTab] = useState<InspectionTab>("scan");
  const [documentNo, setDocumentNo] = useState(works[0]?.document_no ?? "");
  const [scannedWorkId, setScannedWorkId] = useState("");
  const [scanError, setScanError] = useState("");
  const [photoStates, setPhotoStates] = useState<Record<string, ProductPhotoState>>({});

  const scannedWork = works.find((work) => work.id === scannedWorkId);
  const targets = getProductTargets(scannedWork);
  const completedCount = targets.filter((target) => isProductSaved(photoStates[target.id])).length;
  const allProductsSaved = targets.length > 0 && completedCount === targets.length;

  const updateProductState = (targetId: string, next: Partial<ProductPhotoState>) => {
    setPhotoStates((current) => ({
      ...current,
      [targetId]: {
        ...(current[targetId] ?? emptyPhotoState),
        ...next
      }
    }));
  };

  const handleScan = () => {
    const matched = works.find((work) => work.document_no.toLowerCase() === documentNo.trim().toLowerCase());

    if (!matched) {
      setScannedWorkId("");
      setScanError("이 문서번호를 찾지 못했어요.");
      setPhotoStates({});
      return;
    }

    const nextTargets = getProductTargets(matched);
    setScannedWorkId(matched.id);
    setScanError("");
    setPhotoStates(getInitialPhotoMap(nextTargets));
  };

  const startInspection = () => {
    if (!scannedWork || targets.length === 0) return;
    setTab("product");
  };

  const captureProductPhoto = (target: ProductTarget, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !scannedWork) return;

    const safeName = file.name.replace(/\s+/g, "-");
    updateProductState(target.id, {
      photoName: file.name,
      storagePath: `inspection-images/${scannedWork.id}/products/${target.materialCode}-${safeName}`,
      compressed: true
    });
    event.target.value = "";
  };

  const resetProductPhoto = (targetId: string) => {
    updateProductState(targetId, {
      photoName: "",
      storagePath: "",
      compressed: false
    });
  };

  return (
    <div className="space-y-4">
      <CuteCard className="p-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-5 text-sky-500" />
          <p className="text-xs font-black text-sky-600">작업검수</p>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-800">
          {tab === "scan" ? "작업문서스캔" : tab === "product" ? "제품검수" : "검수 완료"}
        </h1>
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
            disabled={!scannedWork}
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
            <CloudButton className="mt-4 w-full" onClick={handleScan}>
              <FileSearch className="size-4" />
              스캔
            </CloudButton>
          </CuteCard>

          {scannedWork && <ScanDocumentInfo work={scannedWork} targets={targets} />}

          <CloudButton className="w-full" disabled={!scannedWork || targets.length === 0} onClick={startInspection}>
            <PackageCheck className="size-4" />
            검수시작
          </CloudButton>
        </>
      )}

      {tab === "product" && scannedWork && (
        <>
          <CuteCard className="p-4">
            <p className="text-xs font-black text-violet-600">제품검수</p>
            <h2 className="mt-1 text-xl font-black text-slate-800">{scannedWork.document_no}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
              제품정보가 맞는지 체크하고, 대상 제품 사진을 촬영하면 압축 후 서버 저장 경로가 생성됩니다.
            </p>
            <div className="mt-3 rounded-2xl bg-white/80 p-3 text-sm font-black text-slate-600 ring-1 ring-sky-100">
              완료 {completedCount}/{targets.length}
            </div>
          </CuteCard>

          {targets.map((target, index) => {
            const state = photoStates[target.id] ?? emptyPhotoState;
            const ready = isProductReady(state);
            const saved = isProductSaved(state);

            return (
              <CuteCard key={target.id} className="p-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-sky-600">제품 {index + 1}</p>
                    <h3 className="mt-1 text-lg font-black text-slate-800">{target.productName}</h3>
                    <p className="mt-1 text-xs font-bold text-slate-400">부자재코드 {target.materialCode}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-black",
                      saved ? "bg-emerald-100 text-emerald-700" : ready ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {saved ? "저장완료" : ready ? "촬영대기" : "확인필요"}
                  </span>
                </div>

                <div className="space-y-2">
                  <ChecklistRow
                    label="제품코드"
                    value={target.productCode}
                    checked={state.productCodeChecked}
                    onChange={(checked) => updateProductState(target.id, { productCodeChecked: checked })}
                  />
                  <ChecklistRow
                    label="제품명"
                    value={target.productName}
                    checked={state.productNameChecked}
                    onChange={(checked) => updateProductState(target.id, { productNameChecked: checked })}
                  />
                  <ChecklistRow
                    label="LOT"
                    value={target.lot}
                    checked={state.lotChecked}
                    onChange={(checked) => updateProductState(target.id, { lotChecked: checked })}
                  />
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
                    {state.photoName || (ready ? "촬영하면 압축 후 서버 저장 mock 처리됩니다." : "제품정보 3개 항목을 먼저 체크해주세요.")}
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={!ready}
                    className="sr-only"
                    onChange={(event) => captureProductPhoto(target, event)}
                    aria-label={`${target.productName} 제품 사진 촬영`}
                  />
                </label>

                {state.storagePath && (
                  <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-700">
                    서버 저장 mock 완료
                    <br />
                    {state.storagePath}
                    <br />
                    압축 여부: {state.compressed ? "압축됨" : "미압축"}
                  </div>
                )}

                {state.photoName && (
                  <CloudButton className="mt-3 w-full" tone="soft" onClick={() => resetProductPhoto(target.id)}>
                    <RotateCcw className="size-4" />
                    다시 촬영
                  </CloudButton>
                )}
              </CuteCard>
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
              setPhotoStates({});
            }}
          >
            다음 작업문서 스캔
          </CloudButton>
        </CuteCard>
      )}
    </div>
  );
}
