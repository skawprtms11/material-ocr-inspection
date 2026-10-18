"use client";

import Link from "next/link";
import { Camera, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { inspectionMethodLabels } from "@/lib/constants/status";
import {
  getMissingReferences,
  missingReferenceBadgeText,
  missingReferenceHint
} from "@/lib/inspection/material-reference";
import { useFilterStore } from "@/lib/state/filter-store";
import type { InspectionMethod, MaterialInspectionRegion, MaterialMaster, RoiRect } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";
import { ReferenceDetailModal } from "./ReferenceDetailModal";
import { ReferenceRegisterModal } from "./ReferenceRegisterModal";
import { getReferenceButtonState, hasInspectionMethod, type ReferenceButtonState, type ReferenceMethod } from "./reference-status";

type MaterialInspectionRegionWithImages = MaterialInspectionRegion & { imageUrls: string[] };

type MaterialModalMode = "create" | "edit";
type MaterialFormValue = Pick<
  MaterialMaster,
  "code" | "name" | "lot" | "inspection_method" | "ocr_image_path" | "vision_image_path" | "remark"
>;

const tableHeaders = ["부자재코드", "부자재명", "LOT", "검증값", "검수방식", "OCR등록", "비전스캔등록", "비고"];

// 둘 다 해제하면 NONE(사진검수 대상)으로 저장한다.
function buildInspectionMethod(ocrChecked: boolean, visionChecked: boolean): InspectionMethod {
  if (ocrChecked && visionChecked) return "BOTH";
  if (visionChecked) return "VISION";
  if (ocrChecked) return "OCR";
  return "NONE";
}

const referenceButtonStyles: Record<ReferenceButtonState, { label: string; className: string; title?: string }> = {
  register: { label: "등록", className: "bg-sky-500 text-white hover:bg-sky-600" },
  complete: { label: "등록완료", className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
  incomplete: { label: "보완필요", className: "bg-amber-100 text-amber-800 hover:bg-amber-200" },
  unused: { label: "미사용", className: "cursor-not-allowed bg-slate-100 text-slate-400", title: "수정에서 해당 방식을 체크하면 등록할 수 있어요" },
  "unused-registered": { label: "등록완료(미사용)", className: "bg-white text-slate-500 ring-1 ring-slate-300 hover:bg-slate-50", title: "현재 사용하지 않는 방식이에요. 조회·재등록만 가능합니다" }
};

function ReferenceButton({ material, method, onClick }: { material: MaterialMaster; method: ReferenceMethod; onClick: () => void }) {
  const state = getReferenceButtonState(material, method);
  const style = referenceButtonStyles[state];
  const isDisabled = state === "unused";

  return (
    <button
      type="button"
      disabled={isDisabled}
      title={style.title}
      data-state={state}
      data-testid={`ref-btn-${method.toLowerCase()}`}
      aria-label={`${material.name} ${method === "OCR" ? "OCR" : "비전스캔"} ${style.label}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn("inline-flex min-h-8 items-center justify-center rounded-full px-3.5 text-xs font-extrabold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-sky-300", style.className)}
    >
      {style.label}
    </button>
  );
}

function FormCheck({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex min-h-11 items-center justify-between rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-700">
      {label}
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="size-4 rounded border-slate-300 accent-sky-500" />
    </label>
  );
}

export default function MaterialMasterPage() {
  const { departmentId, shipperId } = useFilterStore();
  const [materials, setMaterials] = useState<MaterialMaster[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | undefined>();
  const [modalMode, setModalMode] = useState<MaterialModalMode | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock" | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [previewMaterial, setPreviewMaterial] = useState<MaterialMaster | null>(null);
  const [detailTarget, setDetailTarget] = useState<{ materialId: string; method: ReferenceMethod } | null>(null);
  const [registerTarget, setRegisterTarget] = useState<{ materialId: string; method: ReferenceMethod; previousRoi?: RoiRect } | null>(null);

  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) ?? materials[0];
  const modalMaterial = modalMode === "edit" ? selectedMaterial : undefined;
  const detailMaterial = detailTarget ? materials.find((material) => material.id === detailTarget.materialId) : undefined;
  const registerMaterial = registerTarget ? materials.find((material) => material.id === registerTarget.materialId) : undefined;

  const openReference = (material: MaterialMaster, method: ReferenceMethod) => {
    if (getReferenceButtonState(material, method) === "register") setRegisterTarget({ materialId: material.id, method });
    else setDetailTarget({ materialId: material.id, method });
  };

  // mock 모드의 부분 응답에도 행이 깨지지 않도록 기존 행에 병합한다.
  const handleReferenceSaved = (saved: MaterialMaster) => {
    setMaterials((prevMaterials) => prevMaterials.map((material) => (material.id === saved.id ? { ...material, ...saved } : material)));
    setRegisterTarget(null);
    setDetailTarget(null);
  };

  const loadMaterials = useCallback(async () => {
    if (!departmentId || !shipperId) return;

    setIsLoading(true);

    try {
      const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
      const response = await fetch(`/api/material-master?${params.toString()}`);
      const data = (await response.json()) as { source: "supabase" | "mock"; warning?: string; error?: string; materials: MaterialMaster[] };
      if (!response.ok) throw new Error(data.error ?? "부자재마스터 조회에 실패했습니다.");
      setMaterials(data.materials);
      setSelectedMaterialId(data.materials[0]?.id);
      setModalMode(null);
      setDataSource(data.source);
      setLoadError(false);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "부자재마스터 조회에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [departmentId, shipperId]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  const handleSave = async (value: MaterialFormValue) => {
    if (!departmentId || !shipperId) return;

    try {
      const isEdit = modalMode === "edit" && selectedMaterial;
      const materialPayload = value;
      const response = await fetch("/api/material-master", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          departmentId,
          shipperId,
          ...(isEdit ? { id: selectedMaterial.id } : {}),
          reference_image_path: materialPayload.ocr_image_path || materialPayload.vision_image_path || selectedMaterial?.reference_image_path || "",
          ...materialPayload
        })
      });
      const result = (await response.json()) as { source?: "supabase" | "mock"; material?: MaterialMaster; error?: string };
      if (!response.ok || !result.material) throw new Error(result.error ?? "부자재 저장에 실패했습니다.");
      const savedMaterial = result.material;

      if (isEdit) {
        setMaterials((prevMaterials) =>
          prevMaterials.map((material) => (material.id === savedMaterial.id ? { ...material, ...savedMaterial } : material))
        );
      } else {
        setMaterials((prevMaterials) => [savedMaterial, ...prevMaterials]);
        setSelectedMaterialId(savedMaterial.id);
      }
      setDataSource(result.source ?? dataSource);
      setModalMode(null);
      toast.success("부자재마스터가 저장되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "부자재 저장에 실패했습니다.");
    }
  };

  const handleDelete = async () => {
    if (!selectedMaterial) return;

    try {
      const response = await fetch("/api/material-master", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, shipperId, id: selectedMaterial.id })
      });
      const result = (await response.json()) as { source?: "supabase" | "mock"; error?: string };
      if (!response.ok) throw new Error(result.error ?? "부자재 삭제에 실패했습니다.");

      setMaterials((prevMaterials) => {
        const nextMaterials = prevMaterials.filter((material) => material.id !== selectedMaterial.id);
        setSelectedMaterialId(nextMaterials[0]?.id);
        return nextMaterials;
      });
      setDataSource(result.source ?? dataSource);
      toast.success("부자재마스터가 삭제되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "부자재 삭제에 실패했습니다.");
    }
  };

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  return (
    <>
      <PageHeader
        title="부자재마스터"
        description="등록된 부자재 목록을 확인하고 OCR/비전 스캔 사용 여부를 관리합니다."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CloudButton onClick={() => setModalMode("create")}>
              <Plus className="size-4" />
              등록
            </CloudButton>
            <CloudButton tone="soft" disabled={!selectedMaterial} onClick={() => setModalMode("edit")}>
              <Pencil className="size-4" />
              수정
            </CloudButton>
            <CloudButton tone="danger" disabled={!selectedMaterial} onClick={handleDelete}>
              <Trash2 className="size-4" />
              삭제
            </CloudButton>
            <Link
              href={`/mobile/material-photo${selectedMaterial ? `?materialId=${selectedMaterial.id}` : ""}`}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-emerald-100 px-4 text-sm font-extrabold text-emerald-700 shadow-sm transition hover:bg-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-300"
            >
              <Camera className="size-4" />
              모바일 사진등록
            </Link>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/60 px-4 py-2 text-xs font-black text-slate-500 ring-1 ring-white/80">
        <span>{isLoading ? "부자재마스터를 불러오는 중이에요." : "선택된 부서/화주 기준으로 부자재를 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 ring-1 ${loadError ? "bg-rose-50 text-rose-700 ring-rose-100" : "bg-sky-50 text-sky-700 ring-sky-100"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button type="button" onClick={() => void loadMaterials()} className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
              다시 시도
            </button>
          )}
        </div>
      </div>

      <CuteCard className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header} className={cn("px-5 py-4", header.includes("등록") && "text-center")}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {materials.map((material) => {
                const isSelected = material.id === selectedMaterial?.id;

                return (
                  <tr
                    key={material.id}
                    onClick={() => setSelectedMaterialId(material.id)}
                    className={cn(
                      "cursor-pointer text-slate-600 transition hover:bg-sky-50/70",
                      isSelected && "bg-sky-50/90"
                    )}
                  >
                    <td className="px-5 py-4">
                      <span className="font-black text-sky-700">{material.code}</span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewMaterial(material);
                        }}
                        className="font-bold text-sky-700 underline decoration-sky-300 decoration-2 underline-offset-2 transition hover:text-sky-500"
                      >
                        {material.name}
                      </button>
                    </td>
                    <td className="px-5 py-4">{material.lot || "-"}</td>
                    <td className="px-5 py-4">{material.verification_value || "-"}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-black",
                            material.inspection_method === "NONE" ? "bg-slate-100 text-slate-600" : "bg-sky-100 text-sky-700"
                          )}
                        >
                          {inspectionMethodLabels[material.inspection_method]}
                        </span>
                        {getMissingReferences(material).length > 0 && (
                          <span
                            title={`${getMissingReferences(material).join("·")} ${missingReferenceHint}`}
                            className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800"
                          >
                            {missingReferenceBadgeText}({getMissingReferences(material).join("·")}) — {missingReferenceHint}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <ReferenceButton material={material} method="OCR" onClick={() => openReference(material, "OCR")} />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <ReferenceButton material={material} method="VISION" onClick={() => openReference(material, "VISION")} />
                    </td>
                    <td className="px-5 py-4 text-slate-500">{material.remark || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CuteCard>

      {modalMode && (
        <MaterialEditorModal
          mode={modalMode}
          material={modalMaterial}
          onSave={handleSave}
          onClose={() => setModalMode(null)}
        />
      )}

      {detailTarget && detailMaterial && (
        <ReferenceDetailModal
          key={`${detailTarget.materialId}-${detailTarget.method}`}
          material={detailMaterial}
          method={detailTarget.method}
          onClose={() => setDetailTarget(null)}
          onReregister={(roi) => {
            setRegisterTarget({ materialId: detailTarget.materialId, method: detailTarget.method, previousRoi: roi });
            setDetailTarget(null);
          }}
        />
      )}

      {registerTarget && registerMaterial && (
        <ReferenceRegisterModal
          key={`${registerTarget.materialId}-${registerTarget.method}`}
          material={registerMaterial}
          method={registerTarget.method}
          previousRoi={registerTarget.previousRoi}
          onClose={() => setRegisterTarget(null)}
          onSaved={handleReferenceSaved}
        />
      )}

      {previewMaterial && (
        <MaterialImagePreviewModal material={previewMaterial} onClose={() => setPreviewMaterial(null)} />
      )}
    </>
  );
}

function MaterialEditorModal({
  mode,
  material,
  onSave,
  onClose
}: {
  mode: MaterialModalMode;
  material?: MaterialMaster;
  onSave: (value: MaterialFormValue) => void;
  onClose: () => void;
}) {
  const isEditMode = mode === "edit";

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") ?? "").trim();
    const inspectionMethod = buildInspectionMethod(formData.get("ocr") === "on", formData.get("vision") === "on");

    // 이미지 경로는 기준 등록 팝업에서 서버 응답으로만 갱신하므로 기존 값을 그대로 보낸다
    onSave({
      code,
      name: String(formData.get("name") ?? "").trim(),
      lot: String(formData.get("lot") ?? "").trim(),
      inspection_method: inspectionMethod,
      ocr_image_path: material?.ocr_image_path,
      vision_image_path: material?.vision_image_path,
      remark: String(formData.get("remark") ?? "").trim()
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-[1.4rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-sky-600">{isEditMode ? "선택 부자재 수정" : "신규 부자재 등록"}</p>
            <h2 className="mt-1 text-2xl font-black tracking-normal text-slate-800">
              {isEditMode ? material?.name : "부자재 등록"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <CuteCard>
            <h3 className="mb-4 text-lg font-black text-slate-800">기본 정보</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="code"
                className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm"
                defaultValue={material?.code}
                placeholder="부자재코드"
                aria-label="부자재코드"
                required
              />
              <input
                name="name"
                className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm"
                defaultValue={material?.name}
                placeholder="부자재명"
                aria-label="부자재명"
                required
              />
              <input
                name="lot"
                className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm"
                defaultValue={material?.lot}
                placeholder="LOT"
                aria-label="LOT"
              />
              {isEditMode && (
                <div className="flex min-h-11 items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 text-sm font-bold text-slate-500 sm:col-span-2">
                  <span>검증값(OCR 기준 등록 팝업에서 설정)</span>
                  <span className="text-slate-700">{material?.verification_value || "-"}</span>
                </div>
              )}
              <p className="text-xs font-bold text-slate-500 sm:col-span-2">
                둘 다 해제하면 사진검수(작업자 사진 촬영 후 관리자 승인)로 운영됩니다. 체크한 방식은 목록의 OCR등록/비전스캔등록 버튼으로 기준을 등록해야 현장 검수가 진행됩니다.
              </p>
              <FormCheck name="ocr" defaultChecked={isEditMode ? hasInspectionMethod(material?.inspection_method, "OCR") : false} label="OCR등록" />
              <FormCheck name="vision" defaultChecked={isEditMode ? hasInspectionMethod(material?.inspection_method, "VISION") : false} label="비전스캔등록" />
              <textarea
                name="remark"
                className="min-h-24 w-full rounded-2xl border border-sky-100 bg-white px-3 py-3 text-sm sm:col-span-2"
                defaultValue={material?.remark}
                placeholder="비고"
                aria-label="비고"
              />
            </div>
          </CuteCard>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <CloudButton type="button" tone="soft" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="submit">
              <Save className="size-4" />
              저장
            </CloudButton>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoiOverlayImage({ imageUrl, roi, tone }: { imageUrl: string; roi: MaterialInspectionRegion["roi"]; tone: "OCR" | "VISION" }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="등록 이미지" className="block w-full max-w-full" />
      <div
        className={cn(
          "absolute rounded-md border-2 bg-white/20 shadow-sm",
          tone === "OCR" ? "border-sky-400" : "border-violet-400"
        )}
        style={{
          left: `${roi.x}%`,
          top: `${roi.y}%`,
          width: `${roi.width}%`,
          height: `${roi.height}%`
        }}
      />
    </div>
  );
}

function MaterialImagePreviewModal({ material, onClose }: { material: MaterialMaster; onClose: () => void }) {
  const { departmentId, shipperId } = useFilterStore();
  const [regions, setRegions] = useState<MaterialInspectionRegionWithImages[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError("");

    const loadRegions = async () => {
      try {
        const response = await fetch(`/api/material-master/registration?${new URLSearchParams({ material_id: material.id, department_id: departmentId, shipper_id: shipperId }).toString()}`);
        if (!response.ok) throw new Error("등록 이미지 조회에 실패했습니다.");
        const data = (await response.json()) as { regions?: MaterialInspectionRegionWithImages[] };
        if (!cancelled) setRegions(data.regions ?? []);
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "등록 이미지 조회에 실패했습니다.");
          setRegions([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadRegions();

    return () => {
      cancelled = true;
    };
  }, [material.id, departmentId, shipperId]);

  const ocrRegion = regions.find((region) => region.method === "OCR");
  const visionRegion = regions.find((region) => region.method === "VISION");
  const ocrRecognizedText = typeof ocrRegion?.options?.recognizedText === "string" ? ocrRegion.options.recognizedText : "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-[1.4rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black text-sky-600">등록 이미지 미리보기</p>
            <h2 className="mt-1 text-2xl font-black tracking-normal text-slate-800">{material.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[1.2rem] bg-white/70 text-sm font-bold text-slate-500">
            <Loader2 className="size-6 animate-spin text-sky-400" />
            등록 이미지를 불러오는 중이에요.
          </div>
        ) : error ? (
          <div className="rounded-[1.2rem] bg-rose-50 p-6 text-center text-sm font-bold text-rose-600">{error}</div>
        ) : (
          <div className="grid gap-5">
            <CuteCard>
              <h3 className="mb-3 text-lg font-black text-slate-800">OCR 등록 이미지</h3>
              {ocrRegion && ocrRegion.imageUrls.length > 0 ? (
                <div className="grid gap-3">
                  <RoiOverlayImage imageUrl={ocrRegion.imageUrls[0]} roi={ocrRegion.roi} tone="OCR" />
                  <div className="rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500">
                    <p>기준 텍스트: {ocrRegion.expected_text || "-"}</p>
                    <p>인식된 텍스트: {ocrRecognizedText || "-"}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.2rem] bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                  등록된 이미지가 없습니다.
                </div>
              )}
            </CuteCard>

            <CuteCard>
              <h3 className="mb-3 text-lg font-black text-slate-800">비전 등록 이미지</h3>
              {visionRegion && visionRegion.imageUrls.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {visionRegion.imageUrls.slice(0, 5).map((imageUrl, index) => (
                    <RoiOverlayImage key={`${imageUrl}-${index}`} imageUrl={imageUrl} roi={visionRegion.roi} tone="VISION" />
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.2rem] bg-slate-50 p-6 text-center text-sm font-bold text-slate-400">
                  등록된 이미지가 없습니다.
                </div>
              )}
            </CuteCard>
          </div>
        )}
      </div>
    </div>
  );
}
