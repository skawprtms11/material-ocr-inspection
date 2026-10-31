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
  register: { label: "등록", className: "bg-primary text-primary-foreground hover:bg-primary/90" },
  complete: { label: "등록완료", className: "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  incomplete: { label: "보완필요", className: "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100" },
  unused: { label: "미사용", className: "cursor-not-allowed bg-slate-100 text-muted-foreground", title: "수정에서 해당 방식을 체크하면 등록할 수 있습니다" },
  "unused-registered": { label: "등록완료(미사용)", className: "bg-card text-muted-foreground ring-1 ring-inset ring-input hover:bg-muted", title: "현재 사용하지 않는 방식입니다. 조회·재등록만 가능합니다" }
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
      className={cn("inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-md px-3.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", style.className)}
    >
      {style.label}
    </button>
  );
}

function FormCheck({ name, defaultChecked, label }: { name: string; defaultChecked: boolean; label: string }) {
  return (
    <label className="flex min-h-9 items-center justify-between rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground shadow-xs">
      {label}
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="size-4 rounded border-input accent-primary" />
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
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Camera className="size-4" />
              모바일 사진등록
            </Link>
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        <span>{isLoading ? "부자재마스터를 불러오는 중입니다." : "선택된 부서/화주 기준으로 부자재를 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${loadError ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button type="button" onClick={() => void loadMaterials()} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
              다시 시도
            </button>
          )}
        </div>
      </div>

      <CuteCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
              <tr>
                {tableHeaders.map((header) => (
                  <th key={header} className={cn("h-10 whitespace-nowrap px-4 align-middle", header.includes("등록") && "text-center")}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {materials.map((material) => {
                const isSelected = material.id === selectedMaterial?.id;

                return (
                  <tr
                    key={material.id}
                    onClick={() => setSelectedMaterialId(material.id)}
                    className={cn(
                      "cursor-pointer text-foreground transition-colors hover:bg-muted/40",
                      isSelected && "bg-accent hover:bg-accent"
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <span className="font-medium text-foreground">{material.code}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewMaterial(material);
                        }}
                        className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:text-primary/80"
                      >
                        {material.name}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">{material.lot || "-"}</td>
                    <td className="max-w-xs px-4 py-2.5" title={material.verification_value || undefined}>
                      <span className="line-clamp-3">{material.verification_value || "-"}</span>
                    </td>
                    <td className="min-w-56 px-4 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                            material.inspection_method === "NONE" ? "bg-slate-100 text-slate-700 ring-slate-500/20" : "bg-blue-50 text-blue-700 ring-blue-600/20"
                          )}
                        >
                          {inspectionMethodLabels[material.inspection_method]}
                        </span>
                        {getMissingReferences(material).length > 0 && (
                          <span
                            title={`${getMissingReferences(material).join("·")} ${missingReferenceHint}`}
                            className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20"
                          >
                            {missingReferenceBadgeText}({getMissingReferences(material).join("·")}) — {missingReferenceHint}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <ReferenceButton material={material} method="OCR" onClick={() => openReference(material, "OCR")} />
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <ReferenceButton material={material} method="VISION" onClick={() => openReference(material, "VISION")} />
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{material.remark || "-"}</td>
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-3xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{isEditMode ? "선택 부자재 수정" : "신규 부자재 등록"}</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {isEditMode ? material?.name : "부자재 등록"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <form className="grid gap-5" onSubmit={handleSubmit}>
          <CuteCard className="shadow-none">
            <h3 className="mb-4 text-base font-semibold text-foreground">기본 정보</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="code"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                defaultValue={material?.code}
                placeholder="부자재코드"
                aria-label="부자재코드"
                required
              />
              <input
                name="name"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                defaultValue={material?.name}
                placeholder="부자재명"
                aria-label="부자재명"
                required
              />
              <input
                name="lot"
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                defaultValue={material?.lot}
                placeholder="LOT"
                aria-label="LOT"
              />
              {isEditMode && (
                <div className="flex min-h-9 items-center justify-between rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground sm:col-span-2">
                  <span>검증값(OCR 기준 등록 팝업에서 설정)</span>
                  <span className="text-foreground">{material?.verification_value || "-"}</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground sm:col-span-2">
                둘 다 해제하면 사진검수(작업자 사진 촬영 후 관리자 승인)로 운영됩니다. 체크한 방식은 목록의 OCR등록/비전스캔등록 버튼으로 기준을 등록해야 현장 검수가 진행됩니다.
              </p>
              <FormCheck name="ocr" defaultChecked={isEditMode ? hasInspectionMethod(material?.inspection_method, "OCR") : false} label="OCR등록" />
              <FormCheck name="vision" defaultChecked={isEditMode ? hasInspectionMethod(material?.inspection_method, "VISION") : false} label="비전스캔등록" />
              <textarea
                name="remark"
                className="min-h-24 w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:col-span-2"
                defaultValue={material?.remark}
                placeholder="비고"
                aria-label="비고"
              />
            </div>
          </CuteCard>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="submit" className="min-w-24">
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
    <div className="relative overflow-hidden rounded-md border border-border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="등록 이미지" className="block w-full max-w-full" />
      <div
        className={cn(
          "absolute rounded-md border-2 bg-white/20 shadow-sm",
          tone === "OCR" ? "border-blue-400" : "border-violet-400"
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">등록 이미지 미리보기</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{material.name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg bg-card text-sm font-medium text-muted-foreground">
            <Loader2 className="size-6 animate-spin text-primary" />
            등록 이미지를 불러오는 중입니다.
          </div>
        ) : error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-6 text-center text-sm font-medium text-red-700">{error}</div>
        ) : (
          <div className="grid gap-5">
            <CuteCard className="shadow-none">
              <h3 className="mb-3 text-base font-semibold text-foreground">OCR 등록 이미지</h3>
              {ocrRegion && ocrRegion.imageUrls.length > 0 ? (
                <div className="grid gap-3">
                  <RoiOverlayImage imageUrl={ocrRegion.imageUrls[0]} roi={ocrRegion.roi} tone="OCR" />
                  <div className="rounded-md bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                    <p>기준 텍스트: {ocrRegion.expected_text || "-"}</p>
                    <p>인식된 텍스트: {ocrRecognizedText || "-"}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  등록된 이미지가 없습니다.
                </div>
              )}
            </CuteCard>

            <CuteCard className="shadow-none">
              <h3 className="mb-3 text-base font-semibold text-foreground">비전 등록 이미지</h3>
              {visionRegion && visionRegion.imageUrls.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {visionRegion.imageUrls.slice(0, 5).map((imageUrl, index) => (
                    <RoiOverlayImage key={`${imageUrl}-${index}`} imageUrl={imageUrl} roi={visionRegion.roi} tone="VISION" />
                  ))}
                </div>
              ) : (
                <div className="rounded-md bg-muted/40 p-6 text-center text-sm text-muted-foreground">
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
