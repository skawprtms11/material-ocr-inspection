"use client";

import Link from "next/link";
import { Camera, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { InspectionRegionEditor } from "@/components/inspection/InspectionRegionEditor";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";
import type { InspectionMethod, MaterialMaster } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type MaterialModalMode = "create" | "edit";
type MaterialFormValue = Pick<
  MaterialMaster,
  "code" | "name" | "lot" | "inspection_method" | "ocr_image_path" | "vision_image_path" | "remark"
>;

const tableHeaders = ["부자재코드", "부자재명", "LOT", "OCR등록", "비전스캔등록", "비고"];

function hasInspectionMethod(method: InspectionMethod | undefined, target: "OCR" | "VISION") {
  return method === target || method === "BOTH";
}

function buildInspectionMethod(ocrChecked: boolean, visionChecked: boolean): InspectionMethod {
  if (ocrChecked && visionChecked) return "BOTH";
  if (visionChecked) return "VISION";
  if (ocrChecked) return "OCR";
  return "BOTH";
}

function buildMockStoragePath(code: string, type: "ocr" | "vision", file: FormDataEntryValue | null, fallback?: string) {
  if (!(file instanceof File) || !file.name) return fallback ?? "";
  const safeCode = code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const safeName = file.name.replace(/\s+/g, "-");
  return `material-images/mock/${safeCode}/${type}-${safeName}`;
}

function ReadOnlyCheck({ checked, label }: { checked: boolean; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      aria-label={label}
      className="size-4 rounded border-slate-300 accent-sky-500"
    />
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
  const [dataSource, setDataSource] = useState<"supabase" | "mock">("mock");

  const selectedMaterial = materials.find((material) => material.id === selectedMaterialId) ?? materials[0];
  const modalMaterial = modalMode === "edit" ? selectedMaterial : undefined;

  const loadMaterials = useCallback(async () => {
    if (!departmentId || !shipperId) return;

    setIsLoading(true);

    try {
      const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
      const response = await fetch(`/api/material-master?${params.toString()}`);
      if (!response.ok) throw new Error("부자재마스터 조회에 실패했습니다.");
      const data = (await response.json()) as { source: "supabase" | "mock"; warning?: string; materials: MaterialMaster[] };
      setMaterials(data.materials);
      setSelectedMaterialId(data.materials[0]?.id);
      setModalMode(null);
      setDataSource(data.source);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
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
      const response = await fetch("/api/material-master", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isEdit ? { id: selectedMaterial.id } : { departmentId, shipperId }),
          reference_image_path: value.ocr_image_path || value.vision_image_path || selectedMaterial?.reference_image_path || "",
          ...value
        })
      });
      const result = (await response.json()) as { source?: "supabase" | "mock"; material?: MaterialMaster; error?: string };
      if (!response.ok || !result.material) throw new Error(result.error ?? "부자재 저장에 실패했습니다.");

      if (isEdit) {
        setMaterials((prevMaterials) =>
          prevMaterials.map((material) => (material.id === result.material!.id ? result.material! : material))
        );
      } else {
        setMaterials((prevMaterials) => [result.material!, ...prevMaterials]);
        setSelectedMaterialId(result.material.id);
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
        body: JSON.stringify({ id: selectedMaterial.id })
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
        <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 ring-1 ring-sky-100">
          데이터: {dataSource === "supabase" ? "Supabase" : "Mock/Fallback"}
        </span>
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
                      <span className="font-bold text-slate-800">{material.name}</span>
                    </td>
                    <td className="px-5 py-4">{material.lot || "-"}</td>
                    <td className="px-5 py-4 text-center">
                      <div className="inline-flex items-center gap-2">
                        <ReadOnlyCheck checked={hasInspectionMethod(material.inspection_method, "OCR")} label={`${material.name} OCR 등록`} />
                        <span className="text-xs font-bold text-slate-400">{material.ocr_image_path ? "이미지 있음" : "대기"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="inline-flex items-center gap-2">
                        <ReadOnlyCheck checked={hasInspectionMethod(material.inspection_method, "VISION")} label={`${material.name} 비전스캔 등록`} />
                        <span className="text-xs font-bold text-slate-400">{material.vision_image_path ? "이미지 있음" : "대기"}</span>
                      </div>
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
  const regions = material ? appRepository.listMaterialRegions(material.id) : [];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const code = String(formData.get("code") ?? "").trim();

    onSave({
      code,
      name: String(formData.get("name") ?? "").trim(),
      lot: String(formData.get("lot") ?? "").trim(),
      inspection_method: buildInspectionMethod(formData.get("ocr") === "on", formData.get("vision") === "on"),
      ocr_image_path: buildMockStoragePath(code, "ocr", formData.get("ocr_image"), material?.ocr_image_path),
      vision_image_path: buildMockStoragePath(code, "vision", formData.get("vision_image"), material?.vision_image_path),
      remark: String(formData.get("remark") ?? "").trim()
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-6xl rounded-[1.4rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
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
              <FormCheck name="ocr" defaultChecked={isEditMode ? hasInspectionMethod(material?.inspection_method, "OCR") : true} label="OCR등록" />
              <FormCheck name="vision" defaultChecked={isEditMode ? hasInspectionMethod(material?.inspection_method, "VISION") : true} label="비전스캔등록" />
              <textarea
                name="remark"
                className="min-h-24 w-full rounded-2xl border border-sky-100 bg-white px-3 py-3 text-sm sm:col-span-2"
                defaultValue={material?.remark}
                placeholder="비고"
                aria-label="비고"
              />
            </div>
          </CuteCard>
          <div className="grid gap-5 lg:grid-cols-2">
            <ImageRegistrationPanel
              title="OCR 이미지 등록"
              description="OCR 기준 텍스트를 읽을 이미지와 영역을 등록합니다."
              inputName="ocr_image"
              enabledName="ocr"
              enabledLabel="OCR등록"
              defaultEnabled={isEditMode ? hasInspectionMethod(material?.inspection_method, "OCR") : true}
              currentPath={material?.ocr_image_path}
              storageHint="material-images/{부자재코드}/ocr-{파일명}"
            />
            <ImageRegistrationPanel
              title="비전 이미지 등록"
              description="이미지 유사도 비교에 사용할 기준 이미지를 등록합니다."
              inputName="vision_image"
              enabledName="vision"
              enabledLabel="비전스캔등록"
              defaultEnabled={isEditMode ? hasInspectionMethod(material?.inspection_method, "VISION") : true}
              currentPath={material?.vision_image_path}
              storageHint="material-images/{부자재코드}/vision-{파일명}"
            />
          </div>
          {isEditMode && (
            <CuteCard>
              <div className="mb-4">
                <h3 className="text-lg font-black text-slate-800">등록 영역 미리보기</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  현재 저장된 OCR/비전 ROI입니다. 드래그 편집은 추후 확장하고, 지금은 팝업 안에서 등록 흐름만 유지합니다.
                </p>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <InspectionRegionEditor regions={regions} mode="OCR" />
                <InspectionRegionEditor regions={regions} mode="VISION" />
              </div>
            </CuteCard>
          )}
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

function ImageRegistrationPanel({
  title,
  description,
  inputName,
  enabledName,
  enabledLabel,
  defaultEnabled,
  currentPath,
  storageHint
}: {
  title: string;
  description: string;
  inputName: string;
  enabledName: string;
  enabledLabel: string;
  defaultEnabled: boolean;
  currentPath?: string;
  storageHint: string;
}) {
  return (
    <CuteCard>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-800">{title}</h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p>
        </div>
        <FormCheck name={enabledName} defaultChecked={defaultEnabled} label={enabledLabel} />
      </div>
      <label className="flex aspect-[5/3] cursor-pointer flex-col items-center justify-center rounded-[1.4rem] border border-dashed border-sky-200 bg-white/75 p-4 text-center transition hover:bg-sky-50">
        <Camera className="mb-3 size-9 text-sky-400" />
        <span className="font-black text-slate-700">이미지 선택</span>
        <span className="mt-1 text-xs font-semibold leading-5 text-slate-400">{storageHint}</span>
        <input name={inputName} type="file" accept="image/*" className="sr-only" aria-label={`${title} 이미지 선택`} />
      </label>
      <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500">
        현재 경로: {currentPath || "아직 등록된 이미지가 없어요."}
      </div>
    </CuteCard>
  );
}
