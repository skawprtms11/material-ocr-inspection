"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PackagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { appRepository } from "@/lib/repositories/app-repository";
import { useFilterStore } from "@/lib/state/filter-store";
import type { MaterialMaster, WorkMaster } from "@/lib/types/domain";

type WorkMaterialRow = {
  id: string;
  workMasterId: string;
  materialId: string;
  unitQuantity: number;
};

type ProductUsageRow = {
  id: string;
  workMasterId: string;
  productCode: string;
  productName: string;
  unitQuantity: number;
  productType: "정상품" | "샘플" | "세트제품";
};

type WorkMasterMeta = {
  workType: string;
  type: string;
};

type DraftWorkMaster = {
  workType: string;
  code: string;
  type: string;
  name: string;
  description: string;
  isActive: boolean;
};

type BatchWorkMasterRow = DraftWorkMaster & {
  productCodes: string[];
  materialCodes: string[];
  unknownMaterialCodes: string[];
};

const workTypeLabels = ["리드레싱", "세트작업", "해체작업", "기타작업"];
const productTypeOptions: ProductUsageRow["productType"][] = ["정상품", "샘플", "세트제품"];
const baseProducts = [
  { code: "PRD-MT-001", name: "민트 완제품" },
  { code: "PRD-CL-001", name: "구름 완제품" },
  { code: "PRD-LV-001", name: "라벤더 완제품" }
];
const defaultDraftWorkMaster: DraftWorkMaster = {
  workType: "리드레싱",
  code: "",
  type: "",
  name: "",
  description: "",
  isActive: true
};

function hasOcrInspection(material?: MaterialMaster) {
  return material?.inspection_method === "OCR" || material?.inspection_method === "BOTH";
}

function hasVisionInspection(material?: MaterialMaster) {
  return material?.inspection_method === "VISION" || material?.inspection_method === "BOTH";
}

function initialMaterialRows(workMasters: WorkMaster[]) {
  return workMasters.reduce<Record<string, WorkMaterialRow[]>>((acc, workMaster) => {
    acc[workMaster.id] = appRepository.listWorkMasterMaterials(workMaster.id).map((mapping) => ({
      id: mapping.id,
      workMasterId: mapping.work_master_id,
      materialId: mapping.material_id,
      unitQuantity: mapping.inspection_order
    }));
    return acc;
  }, {});
}

function initialProductRows(workMasters: WorkMaster[]) {
  return workMasters.reduce<Record<string, ProductUsageRow[]>>((acc, workMaster, index) => {
    acc[workMaster.id] = [
      {
        id: `prod-${workMaster.id}-1`,
        workMasterId: workMaster.id,
        productCode: baseProducts[index % baseProducts.length].code,
        productName: baseProducts[index % baseProducts.length].name,
        unitQuantity: 1,
        productType: index % 2 === 0 ? "정상품" : "세트제품"
      }
    ];
    return acc;
  }, {});
}

function inferType(workMaster: WorkMaster) {
  if (workMaster.code.includes("BASIC")) return "기본";
  if (workMaster.code.includes("GUIDE")) return "동봉";
  return "검수";
}

function createWorkMasterFromDraft(draft: DraftWorkMaster, departmentId: string, shipperId: string): WorkMaster {
  return {
    id: `wm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    department_id: departmentId,
    shipper_id: shipperId,
    code: draft.code.trim(),
    name: draft.name.trim(),
    description: draft.description.trim(),
    is_active: draft.isActive
  };
}

export default function WorkMasterPage() {
  const { departmentId, shipperId } = useFilterStore();
  const workMasters = useMemo(() => appRepository.listWorkMasters({ departmentId, shipperId }), [departmentId, shipperId]);
  const materials = useMemo(() => appRepository.listMaterials({ departmentId, shipperId }), [departmentId, shipperId]);
  const [visibleWorkMasters, setVisibleWorkMasters] = useState<WorkMaster[]>(workMasters);
  const [localMaterials, setLocalMaterials] = useState<MaterialMaster[]>(materials);
  const [workMasterMeta, setWorkMasterMeta] = useState<Record<string, WorkMasterMeta>>({});
  const [materialRowsByWork, setMaterialRowsByWork] = useState<Record<string, WorkMaterialRow[]>>(() =>
    initialMaterialRows(workMasters)
  );
  const [productRowsByWork, setProductRowsByWork] = useState<Record<string, ProductUsageRow[]>>(() =>
    initialProductRows(workMasters)
  );
  const [selectedWorkMaster, setSelectedWorkMaster] = useState<WorkMaster | null>(null);
  const [selectedProductWorkMaster, setSelectedProductWorkMaster] = useState<WorkMaster | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftWorkMaster, setDraftWorkMaster] = useState<DraftWorkMaster | null>(null);
  const [isBatchOpen, setIsBatchOpen] = useState(false);

  useEffect(() => {
    setVisibleWorkMasters(workMasters);
    setLocalMaterials(materials);
    setWorkMasterMeta({});
    setMaterialRowsByWork(initialMaterialRows(workMasters));
    setProductRowsByWork(initialProductRows(workMasters));
    setSelectedIds(new Set());
    setSelectedWorkMaster(null);
    setSelectedProductWorkMaster(null);
    setDraftWorkMaster(null);
    setIsBatchOpen(false);
  }, [materials, workMasters]);

  if (!departmentId || !shipperId) return <EmptyCloudState />;

  const getRows = (workMasterId: string) => materialRowsByWork[workMasterId] ?? [];
  const getProductRows = (workMasterId: string) => productRowsByWork[workMasterId] ?? [];
  const allSelected = visibleWorkMasters.length > 0 && visibleWorkMasters.every((workMaster) => selectedIds.has(workMaster.id));
  const getMeta = (workMaster: WorkMaster, index: number): WorkMasterMeta => {
    return workMasterMeta[workMaster.id] ?? { workType: workTypeLabels[index % workTypeLabels.length], type: inferType(workMaster) };
  };

  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(visibleWorkMasters.map((workMaster) => workMaster.id)) : new Set());
  };

  const toggleRow = (workMasterId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(workMasterId);
      } else {
        next.delete(workMasterId);
      }
      return next;
    });
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) {
      toast.warning("삭제할 작업마스터를 선택해주세요.");
      return;
    }

    setVisibleWorkMasters((current) => current.filter((workMaster) => !selectedIds.has(workMaster.id)));
    setMaterialRowsByWork((current) => {
      const next = { ...current };
      selectedIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setProductRowsByWork((current) => {
      const next = { ...current };
      selectedIds.forEach((id) => {
        delete next[id];
      });
      return next;
    });
    setSelectedIds(new Set());
    toast.success("선택한 작업마스터가 삭제되었습니다.");
  };

  const saveRows = (workMasterId: string, rows: WorkMaterialRow[]) => {
    setMaterialRowsByWork((current) => ({ ...current, [workMasterId]: rows }));
    setSelectedWorkMaster(null);
    toast.success("작업마스터 부자재가 저장되었습니다.");
  };

  const saveProductRows = (workMasterId: string, rows: ProductUsageRow[]) => {
    setProductRowsByWork((current) => ({ ...current, [workMasterId]: rows }));
    setSelectedProductWorkMaster(null);
    toast.success("작업마스터 사용제품코드가 저장되었습니다.");
  };

  const saveDraftRow = () => {
    if (!draftWorkMaster?.code.trim() || !draftWorkMaster.name.trim()) {
      toast.error("완성품코드와 완성품명을 입력해주세요.");
      return;
    }

    const newWorkMaster = createWorkMasterFromDraft(draftWorkMaster, departmentId, shipperId);
    setVisibleWorkMasters((current) => [newWorkMaster, ...current]);
    setMaterialRowsByWork((current) => ({ ...current, [newWorkMaster.id]: [] }));
    setProductRowsByWork((current) => ({ ...current, [newWorkMaster.id]: [] }));
    setWorkMasterMeta((current) => ({
      ...current,
      [newWorkMaster.id]: { workType: draftWorkMaster.workType, type: draftWorkMaster.type || "신규" }
    }));
    setDraftWorkMaster(null);
    toast.success("작업마스터 행이 추가되었습니다.");
  };

  const registerBatchRows = (batchRows: BatchWorkMasterRow[]) => {
    if (batchRows.length === 0) {
      toast.warning("붙여넣기 할 데이터가 없습니다.");
      return;
    }

    const createdMaterials: MaterialMaster[] = [];
    const newWorkMasters = batchRows.map((row) => createWorkMasterFromDraft(row, departmentId, shipperId));
    const existingMaterials = [...localMaterials];
    const nextMaterialRows: Record<string, WorkMaterialRow[]> = {};
    const nextProductRows: Record<string, ProductUsageRow[]> = {};
    const nextMeta: Record<string, WorkMasterMeta> = {};

    batchRows.forEach((row, rowIndex) => {
      const workMaster = newWorkMasters[rowIndex];
      nextMeta[workMaster.id] = { workType: row.workType, type: row.type || "일괄" };
      nextProductRows[workMaster.id] = row.productCodes.map((productCode, productIndex) => ({
        id: `prod-batch-${workMaster.id}-${productCode}`,
        workMasterId: workMaster.id,
        productCode,
        productName: baseProducts.find((product) => product.code === productCode)?.name ?? `${productCode} 제품명 확인 필요`,
        unitQuantity: 1,
        productType: productIndex === 0 ? "정상품" : "세트제품"
      }));
      nextMaterialRows[workMaster.id] = row.materialCodes.map((code, materialIndex) => {
        let material = existingMaterials.find((item) => item.code === code) ?? createdMaterials.find((item) => item.code === code);

        if (!material) {
          material = {
            id: `mat-batch-${code}-${Date.now()}-${materialIndex}`,
            department_id: departmentId,
            shipper_id: shipperId,
            name: `${code} (부자재마스터 등록 필요)`,
            code,
            inspection_method: "BOTH",
            reference_image_path: "",
            remark: "엑셀 일괄등록에서 자동 생성됨. 부자재마스터 등록 필요",
            is_active: true
          };
          createdMaterials.push(material);
        }

        return {
          id: `wmm-batch-${workMaster.id}-${material.id}`,
          workMasterId: workMaster.id,
          materialId: material.id,
          unitQuantity: 1
        };
      });
    });

    setLocalMaterials((current) => [...current, ...createdMaterials]);
    setVisibleWorkMasters((current) => [...newWorkMasters, ...current]);
    setMaterialRowsByWork((current) => ({ ...current, ...nextMaterialRows }));
    setProductRowsByWork((current) => ({ ...current, ...nextProductRows }));
    setWorkMasterMeta((current) => ({ ...current, ...nextMeta }));
    setIsBatchOpen(false);
    toast.success(`작업마스터 ${newWorkMasters.length}건이 일괄등록되었습니다.`);
  };

  return (
    <>
      <PageHeader
        title="작업마스터"
        description="작업구분, 완성품 정보, 부자재 구성과 검수대상 여부를 관리합니다."
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CloudButton tone="danger" disabled={selectedIds.size === 0} onClick={deleteSelected}>
              <Trash2 className="size-4" />
              선택삭제
            </CloudButton>
            <CloudButton tone="soft" onClick={() => setDraftWorkMaster({ ...defaultDraftWorkMaster })}>
              <Plus className="size-4" />
              행추가
            </CloudButton>
            <CloudButton onClick={() => setIsBatchOpen(true)}>
              <Plus className="size-4" />
              일괄등록
            </CloudButton>
          </div>
        }
      />

      <CuteCard className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1380px] text-left text-sm">
            <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="작업마스터 전체 선택"
                    className="size-4 rounded border-slate-300 accent-sky-500"
                  />
                </th>
                {["작업구분", "완성품코드", "타입", "완성품명", "사용제품코드", "부자재", "작업설명", "사용여부"].map((header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/70">
              {draftWorkMaster && (
                <tr className="bg-amber-50/60 text-slate-700">
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3">
                    <select
                      value={draftWorkMaster.workType}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, workType: event.target.value })}
                      className="h-10 w-32 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                    >
                      {workTypeLabels.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={draftWorkMaster.code}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, code: event.target.value })}
                      className="h-10 w-36 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                      placeholder="완성품코드"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={draftWorkMaster.type}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, type: event.target.value })}
                      className="h-10 w-28 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                      placeholder="타입"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      value={draftWorkMaster.name}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, name: event.target.value })}
                      className="h-10 w-48 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                      placeholder="완성품명"
                    />
                  </td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-400">저장 후 등록</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-400">저장 후 등록</td>
                  <td className="px-4 py-3">
                    <input
                      value={draftWorkMaster.description}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, description: event.target.value })}
                      className="h-10 w-64 rounded-xl border border-sky-100 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sky-200"
                      placeholder="작업설명"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={draftWorkMaster.isActive ? "true" : "false"}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, isActive: event.target.value === "true" })}
                      className="h-10 w-24 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                    >
                      <option value="true">사용</option>
                      <option value="false">중지</option>
                    </select>
                    <div className="mt-2 flex gap-1">
                      <button type="button" onClick={saveDraftRow} className="rounded-full bg-sky-500 px-3 py-1 text-xs font-black text-white">
                        저장
                      </button>
                      <button type="button" onClick={() => setDraftWorkMaster(null)} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 ring-1 ring-slate-200">
                        취소
                      </button>
                    </div>
                  </td>
                </tr>
              )}
              {visibleWorkMasters.map((workMaster, index) => {
                const rows = getRows(workMaster.id);
                const productRows = getProductRows(workMaster.id);
                const meta = getMeta(workMaster, index);

                return (
                  <tr key={workMaster.id} className="text-slate-600 transition hover:bg-sky-50/70">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(workMaster.id)}
                        onChange={(event) => toggleRow(workMaster.id, event.target.checked)}
                        aria-label={`${workMaster.name} 선택`}
                        className="size-4 rounded border-slate-300 accent-sky-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-black text-slate-800">{meta.workType}</td>
                    <td className="px-4 py-3 font-black text-sky-700">{workMaster.code}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">
                        {meta.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-800">{workMaster.name}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedProductWorkMaster(workMaster)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-full bg-emerald-50 px-3 text-xs font-black text-emerald-700 ring-1 ring-emerald-100 transition hover:bg-emerald-100"
                      >
                        <PackagePlus className="size-4" />
                        {productRows.length}가지
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedWorkMaster(workMaster)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-full bg-sky-50 px-3 text-xs font-black text-sky-700 ring-1 ring-sky-100 transition hover:bg-sky-100"
                      >
                        <PackagePlus className="size-4" />
                        {rows.length}가지
                      </button>
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-3 text-slate-500">{workMaster.description}</td>
                    <td className="px-4 py-3 font-bold">{workMaster.is_active ? "사용" : "중지"}</td>
                  </tr>
                );
              })}
              {visibleWorkMasters.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    표시할 작업마스터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CuteCard>

      {selectedWorkMaster && (
        <WorkMaterialModal
          workMaster={selectedWorkMaster}
          materials={localMaterials}
          initialRows={getRows(selectedWorkMaster.id)}
          onClose={() => setSelectedWorkMaster(null)}
          onSave={(rows) => saveRows(selectedWorkMaster.id, rows)}
        />
      )}
      {selectedProductWorkMaster && (
        <ProductCodeModal
          workMaster={selectedProductWorkMaster}
          initialRows={getProductRows(selectedProductWorkMaster.id)}
          onClose={() => setSelectedProductWorkMaster(null)}
          onSave={(rows) => saveProductRows(selectedProductWorkMaster.id, rows)}
        />
      )}
      {isBatchOpen && (
        <BatchRegisterModal
          materials={localMaterials}
          onClose={() => setIsBatchOpen(false)}
          onRegister={registerBatchRows}
        />
      )}
    </>
  );
}

function WorkMaterialModal({
  workMaster,
  materials,
  initialRows,
  onClose,
  onSave
}: {
  workMaster: WorkMaster;
  materials: MaterialMaster[];
  initialRows: WorkMaterialRow[];
  onClose: () => void;
  onSave: (rows: WorkMaterialRow[]) => void;
}) {
  const [rows, setRows] = useState<WorkMaterialRow[]>(initialRows);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [unitQuantity, setUnitQuantity] = useState(1);

  const addMaterial = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!materialId) return;
    if (rows.some((row) => row.materialId === materialId)) {
      toast.warning("이미 등록된 부자재입니다.");
      return;
    }

    setRows((current) => [
      ...current,
      {
        id: `wmm-${Date.now()}`,
        workMasterId: workMaster.id,
        materialId,
        unitQuantity
      }
    ]);
    setUnitQuantity(1);
  };

  const updateQuantity = (rowId: string, nextQuantity: number) => {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, unitQuantity: Math.max(1, nextQuantity) } : row))
    );
  };

  const removeRow = (rowId: string) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-600">부자재 등록</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{workMaster.name}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">{workMaster.code} 작업에 사용할 부자재를 등록합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="부자재 등록 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <form className="mb-4 grid gap-3 rounded-[1.2rem] bg-white/70 p-4 ring-1 ring-white/80 lg:grid-cols-[1fr_140px_auto]" onSubmit={addMaterial}>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">부자재</span>
            <select
              value={materialId}
              onChange={(event) => setMaterialId(event.target.value)}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
            >
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.code} / {material.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">단위수량</span>
            <input
              type="number"
              min={1}
              value={unitQuantity}
              onChange={(event) => setUnitQuantity(Number(event.target.value))}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <CloudButton type="submit" className="self-end">
            <Plus className="size-4" />
            등록
          </CloudButton>
        </form>

        <div className="overflow-x-auto rounded-[1.2rem] border border-white/80 bg-white/70">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-sky-50/80 text-xs font-black text-sky-700">
              <tr>
                {["부자재코드", "부자재명", "단위수량", "OCR검수", "비전검수", "삭제"].map((header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const material = materials.find((item) => item.id === row.materialId);

                return (
                  <tr key={row.id} className="text-slate-600">
                    <td className="px-4 py-3 font-black text-sky-700">{material?.code ?? "-"}</td>
                    <td className="px-4 py-3 font-bold text-slate-800">{material?.name ?? "-"}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={1}
                        value={row.unitQuantity}
                        onChange={(event) => updateQuantity(row.id, Number(event.target.value))}
                        className="h-10 w-24 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                        aria-label={`${material?.name ?? "부자재"} 단위수량`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={hasOcrInspection(material)}
                        readOnly
                        aria-label={`${material?.name ?? "부자재"} OCR검수 대상여부`}
                        className="size-4 rounded border-slate-300 accent-sky-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={hasVisionInspection(material)}
                        readOnly
                        aria-label={`${material?.name ?? "부자재"} 비전검수 대상여부`}
                        className="size-4 rounded border-slate-300 accent-violet-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <CloudButton type="button" tone="danger" onClick={() => removeRow(row.id)}>
                        삭제
                      </CloudButton>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                    등록된 부자재가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <CloudButton type="button" tone="soft" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" onClick={() => onSave(rows)}>
            <Save className="size-4" />
            저장
          </CloudButton>
        </div>
      </div>
    </div>
  );
}

function ProductCodeModal({
  workMaster,
  initialRows,
  onClose,
  onSave
}: {
  workMaster: WorkMaster;
  initialRows: ProductUsageRow[];
  onClose: () => void;
  onSave: (rows: ProductUsageRow[]) => void;
}) {
  const [rows, setRows] = useState<ProductUsageRow[]>(initialRows);
  const [productCode, setProductCode] = useState(baseProducts[0]?.code ?? "");
  const [unitQuantity, setUnitQuantity] = useState(1);
  const [productType, setProductType] = useState<ProductUsageRow["productType"]>("정상품");

  const addProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = productCode.trim();
    if (!code) return;
    if (rows.some((row) => row.productCode === code)) {
      toast.warning("이미 등록된 제품코드입니다.");
      return;
    }

    const knownProduct = baseProducts.find((product) => product.code === code);
    setRows((current) => [
      ...current,
      {
        id: `prod-${Date.now()}`,
        workMasterId: workMaster.id,
        productCode: code,
        productName: knownProduct?.name ?? `${code} 제품명 확인 필요`,
        unitQuantity,
        productType
      }
    ]);
    setUnitQuantity(1);
  };

  const updateRow = (rowId: string, next: Partial<ProductUsageRow>) => {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...next } : row)));
  };

  const removeRow = (rowId: string) => {
    setRows((current) => current.filter((row) => row.id !== rowId));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-5xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-emerald-600">사용제품코드 등록</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{workMaster.name}</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              완성품 1개를 만들기 위해 필요한 제품코드와 수량을 등록합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="사용제품코드 등록 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <form className="mb-4 grid gap-3 rounded-[1.2rem] bg-white/70 p-4 ring-1 ring-white/80 lg:grid-cols-[1fr_140px_160px_auto]" onSubmit={addProduct}>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">제품코드</span>
            <input
              list="product-code-list"
              value={productCode}
              onChange={(event) => setProductCode(event.target.value)}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
              placeholder="제품코드"
            />
            <datalist id="product-code-list">
              {baseProducts.map((product) => (
                <option key={product.code} value={product.code}>
                  {product.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">단위수량</span>
            <input
              type="number"
              min={1}
              value={unitQuantity}
              onChange={(event) => setUnitQuantity(Number(event.target.value))}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-black text-slate-500">제품구분</span>
            <select
              value={productType}
              onChange={(event) => setProductType(event.target.value as ProductUsageRow["productType"])}
              className="h-11 w-full rounded-2xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
            >
              {productTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <CloudButton type="submit" className="self-end">
            <Plus className="size-4" />
            등록
          </CloudButton>
        </form>

        <div className="overflow-x-auto rounded-[1.2rem] border border-white/80 bg-white/70">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-emerald-50/80 text-xs font-black text-emerald-700">
              <tr>
                {["제품코드", "제품명", "단위수량", "제품구분", "삭제"].map((header) => (
                  <th key={header} className="px-4 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className="text-slate-600">
                  <td className="px-4 py-3 font-black text-emerald-700">{row.productCode}</td>
                  <td className="px-4 py-3">
                    <input
                      value={row.productName}
                      onChange={(event) => updateRow(row.id, { productName: event.target.value })}
                      className="h-10 w-56 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-sky-200"
                      aria-label={`${row.productCode} 제품명`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      min={1}
                      value={row.unitQuantity}
                      onChange={(event) => updateRow(row.id, { unitQuantity: Math.max(1, Number(event.target.value)) })}
                      className="h-10 w-24 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                      aria-label={`${row.productCode} 단위수량`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row.productType}
                      onChange={(event) => updateRow(row.id, { productType: event.target.value as ProductUsageRow["productType"] })}
                      className="h-10 w-32 rounded-xl border border-sky-100 bg-white px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-sky-200"
                      aria-label={`${row.productCode} 제품구분`}
                    >
                      {productTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <CloudButton type="button" tone="danger" onClick={() => removeRow(row.id)}>
                      삭제
                    </CloudButton>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                    등록된 사용제품코드가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <CloudButton type="button" tone="soft" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" onClick={() => onSave(rows)}>
            <Save className="size-4" />
            저장
          </CloudButton>
        </div>
      </div>
    </div>
  );
}

function parseBatchRows(text: string, materials: MaterialMaster[]): BatchWorkMasterRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [workType, code, type, name, productCell, materialCell, description, isActiveCell] = line.split("\t").map((cell) => cell.trim());
      const productCodes = (productCell ?? "")
        .split("/")
        .map((codeValue) => codeValue.trim())
        .filter(Boolean);
      const materialCodes = (materialCell ?? "")
        .split("/")
        .map((codeValue) => codeValue.trim())
        .filter(Boolean);
      const knownCodes = new Set(materials.map((material) => material.code));

      return {
        workType: workType || "리드레싱",
        code: code || "",
        type: type || "일괄",
        name: name || "",
        productCodes,
        materialCodes,
        unknownMaterialCodes: materialCodes.filter((materialCode) => !knownCodes.has(materialCode)),
        description: description || "",
        isActive: !["N", "n", "false", "중지", "미사용"].includes(isActiveCell || "")
      };
    });
}

function BatchRegisterModal({
  materials,
  onClose,
  onRegister
}: {
  materials: MaterialMaster[];
  onClose: () => void;
  onRegister: (rows: BatchWorkMasterRow[]) => void;
}) {
  const [pasteText, setPasteText] = useState(
    "리드레싱\tWM-NEW-001\t기본\t신규 완성품\tPRD-MT-001/PRD-CL-001\tLBL-MT-01/STK-MT-02\t신규 작업 설명\t사용"
  );
  const parsedRows = useMemo(() => parseBatchRows(pasteText, materials), [materials, pasteText]);
  const invalidRows = parsedRows.filter((row) => !row.code || !row.name);
  const unknownCodes = Array.from(new Set(parsedRows.flatMap((row) => row.unknownMaterialCodes)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-6xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-sky-600">일괄등록</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">엑셀 데이터 붙여넣기</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">
              컬럼 순서: 작업구분, 완성품코드, 타입, 완성품명, 사용제품코드, 부자재, 작업설명, 사용여부
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="일괄등록 팝업 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-[1.2rem] border border-white/80 bg-white/70 p-4 shadow-sm">
            <label className="block">
              <span className="mb-1 block text-xs font-black text-slate-500">복사한 데이터</span>
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                className="min-h-[180px] w-full rounded-[1.2rem] border border-sky-100 bg-white p-3 font-mono text-xs leading-5 outline-none focus:ring-2 focus:ring-sky-200"
                placeholder={"리드레싱\tWM-001\t기본\t완성품명\tPRD001/PRD002\tA11100/A11001/A11002\t설명\t사용"}
              />
            </label>
            <div className="mt-3 rounded-2xl bg-sky-50 p-3 text-xs font-bold leading-5 text-sky-700">
              사용제품코드와 부자재 셀에 `a11100/a11001/a11002`처럼 입력하면 `/` 기준으로 여러 종류로 분리됩니다.
            </div>
            {unknownCodes.length > 0 && (
              <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-700">
                부자재마스터 등록 필요: {unknownCodes.join(", ")}
                <br />
                일괄등록 시 임시 부자재로 등록되며, 추후 부자재마스터에서 상세 등록이 필요합니다.
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-slate-700">복사한 데이터를 표형태로 확인</h3>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-sky-700 shadow-sm ring-1 ring-sky-100">
                {parsedRows.length}행
              </span>
            </div>
            <div className="overflow-x-auto rounded-[1.2rem] border border-white/80 bg-white/70">
              <table className="w-full min-w-[1080px] text-left text-xs">
                <thead className="bg-sky-50/80 font-black text-sky-700">
                  <tr>
                    {["작업구분", "완성품코드", "타입", "완성품명", "사용제품코드", "부자재", "작업설명", "사용여부", "확인"].map((header) => (
                      <th key={header} className="px-3 py-3">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.map((row, index) => (
                    <tr key={`${row.code}-${index}`} className="text-slate-600">
                      <td className="px-3 py-3 font-bold">{row.workType}</td>
                      <td className="px-3 py-3 font-black text-sky-700">{row.code || "필수"}</td>
                      <td className="px-3 py-3">{row.type}</td>
                      <td className="px-3 py-3 font-bold text-slate-800">{row.name || "필수"}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.productCodes.map((code) => (
                            <span key={code} className="rounded-full bg-emerald-100 px-2 py-0.5 font-black text-emerald-700">
                              {code}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {row.materialCodes.map((code) => (
                            <span
                              key={code}
                              className={`rounded-full px-2 py-0.5 font-black ${
                                row.unknownMaterialCodes.includes(code)
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-3">{row.description || "-"}</td>
                      <td className="px-3 py-3">{row.isActive ? "사용" : "중지"}</td>
                      <td className="px-3 py-3">
                        {row.code && row.name ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 font-black text-emerald-700">등록가능</span>
                        ) : (
                          <span className="rounded-full bg-rose-100 px-2 py-1 font-black text-rose-700">확인필요</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {parsedRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm font-bold text-slate-400">
                        붙여넣기 한 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <CloudButton type="button" tone="soft" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton
            type="button"
            disabled={parsedRows.length === 0 || invalidRows.length > 0}
            onClick={() => onRegister(parsedRows)}
          >
            <Save className="size-4" />
            일괄등록
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
