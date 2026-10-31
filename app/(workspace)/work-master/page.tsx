"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PackagePlus, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { EmptyCloudState } from "@/components/common/EmptyCloudState";
import { PageHeader } from "@/components/common/PageHeader";
import { appRepository } from "@/lib/repositories/app-repository";
import { inspectionMethodLabels } from "@/lib/constants/status";
import {
  getMissingReferences,
  missingReferenceBadgeText,
  missingReferenceHint
} from "@/lib/inspection/material-reference";
import { useFilterStore } from "@/lib/state/filter-store";
import type { MaterialMaster, WorkMaster } from "@/lib/types/domain";
import type {
  BatchWorkMasterResponse,
  BatchWorkMasterRowDto,
  CreateWorkMasterResponse,
  DraftWorkMasterDto,
  ProductUsageRowDto,
  WorkMasterDataResponse,
  WorkMasterMetaDto,
  WorkMaterialRowDto
} from "@/lib/types/work-master-api";

type WorkMaterialRow = WorkMaterialRowDto;
type ProductUsageRow = ProductUsageRowDto;
type WorkMasterMeta = WorkMasterMetaDto;
type DraftWorkMaster = DraftWorkMasterDto;
type BatchWorkMasterRow = BatchWorkMasterRowDto & {
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
  const mockWorkMasters = useMemo(() => appRepository.listWorkMasters({ departmentId, shipperId }), [departmentId, shipperId]);
  const mockMaterials = useMemo(() => appRepository.listMaterials({ departmentId, shipperId }), [departmentId, shipperId]);
  const [visibleWorkMasters, setVisibleWorkMasters] = useState<WorkMaster[]>([]);
  const [localMaterials, setLocalMaterials] = useState<MaterialMaster[]>([]);
  const [workMasterMeta, setWorkMasterMeta] = useState<Record<string, WorkMasterMeta>>({});
  const [materialRowsByWork, setMaterialRowsByWork] = useState<Record<string, WorkMaterialRow[]>>({});
  const [productRowsByWork, setProductRowsByWork] = useState<Record<string, ProductUsageRow[]>>({});
  const [selectedWorkMaster, setSelectedWorkMaster] = useState<WorkMaster | null>(null);
  const [selectedProductWorkMaster, setSelectedProductWorkMaster] = useState<WorkMaster | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftWorkMaster, setDraftWorkMaster] = useState<DraftWorkMaster | null>(null);
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"supabase" | "mock" | null>(null);
  const [loadError, setLoadError] = useState(false);

  const applyWorkMasterData = useCallback((data: WorkMasterDataResponse) => {
    setVisibleWorkMasters(data.workMasters);
    setLocalMaterials(data.materials);
    setWorkMasterMeta(data.metaByWork ?? {});
    setMaterialRowsByWork(
      data.workMasters.reduce<Record<string, WorkMaterialRow[]>>((acc, workMaster) => {
        acc[workMaster.id] = data.materialRowsByWork?.[workMaster.id] ?? [];
        return acc;
      }, {})
    );
    setProductRowsByWork(
      data.workMasters.reduce<Record<string, ProductUsageRow[]>>((acc, workMaster) => {
        acc[workMaster.id] = data.productRowsByWork?.[workMaster.id] ?? [];
        return acc;
      }, {})
    );
    setDataSource(data.source);
    setSelectedIds(new Set());
    setSelectedWorkMaster(null);
    setSelectedProductWorkMaster(null);
    setDraftWorkMaster(null);
    setIsBatchOpen(false);
  }, []);

  const applyMockData = useCallback((warning?: string) => {
    applyWorkMasterData({
      source: "mock",
      warning,
      workMasters: mockWorkMasters,
      materials: mockMaterials,
      materialRowsByWork: initialMaterialRows(mockWorkMasters),
      productRowsByWork: initialProductRows(mockWorkMasters),
      metaByWork: {}
    });
  }, [applyWorkMasterData, mockMaterials, mockWorkMasters]);

  const loadWorkMasters = useCallback(
    async (signal?: AbortSignal) => {
      if (!departmentId || !shipperId) {
        applyMockData();
        return;
      }

      setIsLoading(true);

      try {
        const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
        const response = await fetch(`/api/work-masters?${params.toString()}`, { signal });
        const data = (await response.json()) as WorkMasterDataResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "작업마스터 조회에 실패했습니다.");
        applyWorkMasterData(data);
        setLoadError(false);
        if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
        toast.error(error instanceof Error ? error.message : "작업마스터 조회에 실패했습니다.");
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [applyMockData, applyWorkMasterData, departmentId, shipperId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkMasters(controller.signal);
    return () => controller.abort();
  }, [loadWorkMasters]);

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

  const deleteSelected = async () => {
    if (selectedIds.size === 0) {
      toast.warning("삭제할 작업마스터를 선택해주세요.");
      return;
    }

    const ids = Array.from(selectedIds);

    try {
      const response = await fetch("/api/work-masters", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, shipperId, ids })
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업마스터 삭제에 실패했습니다.");

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업마스터 삭제에 실패했습니다.");
    }
  };

  const saveRows = async (workMasterId: string, rows: WorkMaterialRow[]) => {
    try {
      const response = await fetch(`/api/work-masters/${workMasterId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, shipperId, rows })
      });
      const result = (await response.json()) as { rows?: WorkMaterialRow[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업마스터 부자재 저장에 실패했습니다.");

      setMaterialRowsByWork((current) => ({ ...current, [workMasterId]: result.rows ?? rows }));
      setSelectedWorkMaster(null);
      toast.success("작업마스터 부자재가 저장되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업마스터 부자재 저장에 실패했습니다.");
    }
  };

  const saveProductRows = async (workMasterId: string, rows: ProductUsageRow[]) => {
    try {
      const response = await fetch(`/api/work-masters/${workMasterId}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, shipperId, rows })
      });
      const result = (await response.json()) as { rows?: ProductUsageRow[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업마스터 사용제품코드 저장에 실패했습니다.");

      setProductRowsByWork((current) => ({ ...current, [workMasterId]: result.rows ?? rows }));
      setSelectedProductWorkMaster(null);
      toast.success("작업마스터 사용제품코드가 저장되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업마스터 사용제품코드 저장에 실패했습니다.");
    }
  };

  const saveDraftRow = async () => {
    if (!draftWorkMaster?.code.trim() || !draftWorkMaster.name.trim()) {
      toast.error("완성품코드와 완성품명을 입력해주세요.");
      return;
    }

    try {
      const response = await fetch("/api/work-masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "single", departmentId, shipperId, draft: draftWorkMaster })
      });
      const result = (await response.json()) as CreateWorkMasterResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업마스터 등록에 실패했습니다.");

      setVisibleWorkMasters((current) => [result.workMaster, ...current]);
      setMaterialRowsByWork((current) => ({ ...current, [result.workMaster.id]: result.materialRows ?? [] }));
      setProductRowsByWork((current) => ({ ...current, [result.workMaster.id]: result.productRows ?? [] }));
      setWorkMasterMeta((current) => ({
        ...current,
        [result.workMaster.id]: result.meta
      }));
      setDraftWorkMaster(null);
      setDataSource(result.source);
      toast.success("작업마스터 행이 추가되었습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업마스터 등록에 실패했습니다.");
    }
  };

  const registerBatchRows = async (batchRows: BatchWorkMasterRow[]) => {
    if (batchRows.length === 0) {
      toast.warning("붙여넣기 할 데이터가 없습니다.");
      return;
    }

    try {
      const response = await fetch("/api/work-masters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "batch", departmentId, shipperId, rows: batchRows })
      });
      const result = (await response.json()) as BatchWorkMasterResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업마스터 일괄등록에 실패했습니다.");

      setLocalMaterials((current) => {
        const byId = new Map(current.map((material) => [material.id, material]));
        result.createdMaterials.forEach((material) => byId.set(material.id, material));
        return Array.from(byId.values());
      });
      setVisibleWorkMasters((current) => [...result.workMasters, ...current]);
      setMaterialRowsByWork((current) => ({ ...current, ...result.materialRowsByWork }));
      setProductRowsByWork((current) => ({ ...current, ...result.productRowsByWork }));
      setWorkMasterMeta((current) => ({ ...current, ...result.metaByWork }));
      setIsBatchOpen(false);
      setDataSource(result.source);
      toast.success(`작업마스터 ${result.workMasters.length}건이 일괄등록되었습니다.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작업마스터 일괄등록에 실패했습니다.");
    }
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

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
        <span>{isLoading ? "작업마스터 데이터를 불러오는 중입니다." : "선택된 부서/화주 기준으로 작업마스터를 조회합니다."}</span>
        <div className="flex items-center gap-2">
          <span className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${loadError ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-muted text-muted-foreground ring-border"}`}>
            데이터: {loadError ? "연결 오류" : dataSource === "supabase" ? "Supabase" : dataSource === "mock" ? "Mock/Fallback" : "연결 확인 중"}
          </span>
          {loadError && (
            <button type="button" onClick={() => void loadWorkMasters()} className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100">
              다시 시도
            </button>
          )}
        </div>
      </div>

      <CuteCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1380px] text-left text-sm">
            <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="h-10 whitespace-nowrap px-4">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleAll(event.target.checked)}
                    aria-label="작업마스터 전체 선택"
                    className="size-4 rounded border-input accent-primary"
                  />
                </th>
                {["작업구분", "완성품코드", "타입", "완성품명", "사용제품코드", "부자재", "작업설명", "사용여부"].map((header) => (
                  <th key={header} className="h-10 whitespace-nowrap px-4">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {draftWorkMaster && (
                <tr className="bg-amber-50/60 text-foreground">
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5">
                    <select
                      value={draftWorkMaster.workType}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, workType: event.target.value })}
                      className="h-9 w-32 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      {workTypeLabels.map((label) => (
                        <option key={label} value={label}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      value={draftWorkMaster.code}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, code: event.target.value })}
                      className="h-9 w-36 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      placeholder="완성품코드"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      value={draftWorkMaster.type}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, type: event.target.value })}
                      className="h-9 w-28 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      placeholder="타입"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      value={draftWorkMaster.name}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, name: event.target.value })}
                      className="h-9 w-48 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      placeholder="완성품명"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground">저장 후 등록</td>
                  <td className="px-4 py-2.5 text-xs font-medium text-muted-foreground">저장 후 등록</td>
                  <td className="px-4 py-2.5">
                    <input
                      value={draftWorkMaster.description}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, description: event.target.value })}
                      className="h-9 w-64 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      placeholder="작업설명"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={draftWorkMaster.isActive ? "true" : "false"}
                      onChange={(event) => setDraftWorkMaster((current) => current && { ...current, isActive: event.target.value === "true" })}
                      className="h-9 w-24 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <option value="true">사용</option>
                      <option value="false">중지</option>
                    </select>
                    <div className="mt-2 flex gap-1">
                      <button type="button" onClick={saveDraftRow} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                        저장
                      </button>
                      <button type="button" onClick={() => setDraftWorkMaster(null)} className="rounded-md bg-card px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-input hover:bg-muted">
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
                  <tr key={workMaster.id} className="text-foreground transition-colors hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(workMaster.id)}
                        onChange={(event) => toggleRow(workMaster.id, event.target.checked)}
                        aria-label={`${workMaster.name} 선택`}
                        className="size-4 rounded border-input accent-primary"
                      />
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{meta.workType}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{workMaster.code}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-500/20">
                        {meta.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{workMaster.name}</td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedProductWorkMaster(workMaster)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                      >
                        <PackagePlus className="size-4" />
                        {productRows.length}가지
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedWorkMaster(workMaster)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                      >
                        <PackagePlus className="size-4" />
                        {rows.length}가지
                      </button>
                    </td>
                    <td className="max-w-[320px] truncate px-4 py-2.5 text-muted-foreground">{workMaster.description}</td>
                    <td className="px-4 py-2.5 font-medium">{workMaster.is_active ? "사용" : "중지"}</td>
                  </tr>
                );
              })}
              {visibleWorkMasters.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm font-medium text-muted-foreground">
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
    if (!Number.isFinite(unitQuantity) || unitQuantity < 1) {
      toast.warning("수량은 1 이상의 숫자로 입력해 주세요.");
      return;
    }
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
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-5xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">부자재 등록</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{workMaster.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{workMaster.code} 작업에 사용할 부자재를 등록합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="부자재 등록 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <form className="mb-4 grid gap-3 rounded-md border border-border bg-card p-4 lg:grid-cols-[1fr_140px_auto]" onSubmit={addMaterial}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">부자재</span>
            <select
              value={materialId}
              onChange={(event) => setMaterialId(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.code} / {material.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">단위수량</span>
            <input
              type="number"
              min={1}
              value={unitQuantity}
              onChange={(event) => setUnitQuantity(Number(event.target.value))}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          <CloudButton type="submit" className="self-end">
            <Plus className="size-4" />
            등록
          </CloudButton>
        </form>

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
              <tr>
                {["부자재코드", "부자재명", "단위수량", "검수방식", "OCR검수", "비전검수", "삭제"].map((header) => (
                  <th key={header} className="h-10 whitespace-nowrap px-4">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const material = materials.find((item) => item.id === row.materialId);

                return (
                  <tr key={row.id} className="text-foreground">
                    <td className="px-4 py-2.5 font-medium text-foreground">{material?.code ?? "-"}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{material?.name ?? "-"}</td>
                    <td className="px-4 py-2.5">
                      <input
                        type="number"
                        min={1}
                        value={row.unitQuantity}
                        onChange={(event) => updateQuantity(row.id, Number(event.target.value))}
                        className="h-9 w-24 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        aria-label={`${material?.name ?? "부자재"} 단위수량`}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      {material ? (
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                              material.inspection_method === "NONE" ? "bg-slate-100 text-slate-700 ring-slate-500/20" : "bg-blue-50 text-blue-700 ring-blue-600/20"
                            }`}
                          >
                            {inspectionMethodLabels[material.inspection_method]}
                          </span>
                          {getMissingReferences(material).length > 0 && (
                            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                              {missingReferenceBadgeText}({getMissingReferences(material).join("·")}) — {missingReferenceHint}
                            </span>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={hasOcrInspection(material)}
                        readOnly
                        aria-label={`${material?.name ?? "부자재"} OCR검수 대상여부`}
                        className="size-4 rounded border-input accent-primary"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={hasVisionInspection(material)}
                        readOnly
                        aria-label={`${material?.name ?? "부자재"} 비전검수 대상여부`}
                        className="size-4 rounded border-input accent-violet-500"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <CloudButton type="button" tone="danger" onClick={() => removeRow(row.id)}>
                        삭제
                      </CloudButton>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm font-medium text-muted-foreground">
                    등록된 부자재가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" className="min-w-24" onClick={() => onSave(rows)}>
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
    if (!Number.isFinite(unitQuantity) || unitQuantity < 1) {
      toast.warning("수량은 1 이상의 숫자로 입력해 주세요.");
      return;
    }
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
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-5xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">사용제품코드 등록</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{workMaster.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              완성품 1개를 만들기 위해 필요한 제품코드와 수량을 등록합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="사용제품코드 등록 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <form className="mb-4 grid gap-3 rounded-md border border-border bg-card p-4 lg:grid-cols-[1fr_140px_160px_auto]" onSubmit={addProduct}>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">제품코드</span>
            <input
              list="product-code-list"
              value={productCode}
              onChange={(event) => setProductCode(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
            <span className="mb-1 block text-sm font-medium text-foreground">단위수량</span>
            <input
              type="number"
              min={1}
              value={unitQuantity}
              onChange={(event) => setUnitQuantity(Number(event.target.value))}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">제품구분</span>
            <select
              value={productType}
              onChange={(event) => setProductType(event.target.value as ProductUsageRow["productType"])}
              className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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

        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
              <tr>
                {["제품코드", "제품명", "단위수량", "제품구분", "삭제"].map((header) => (
                  <th key={header} className="h-10 whitespace-nowrap px-4">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="text-foreground">
                  <td className="px-4 py-2.5 font-medium text-foreground">{row.productCode}</td>
                  <td className="px-4 py-2.5">
                    <input
                      value={row.productName}
                      onChange={(event) => updateRow(row.id, { productName: event.target.value })}
                      className="h-9 w-56 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      aria-label={`${row.productCode} 제품명`}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      min={1}
                      value={row.unitQuantity}
                      onChange={(event) => updateRow(row.id, { unitQuantity: Math.max(1, Number(event.target.value)) })}
                      className="h-9 w-24 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      aria-label={`${row.productCode} 단위수량`}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={row.productType}
                      onChange={(event) => updateRow(row.id, { productType: event.target.value as ProductUsageRow["productType"] })}
                      className="h-9 w-32 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      aria-label={`${row.productCode} 제품구분`}
                    >
                      {productTypeOptions.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <CloudButton type="button" tone="danger" onClick={() => removeRow(row.id)}>
                      삭제
                    </CloudButton>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm font-medium text-muted-foreground">
                    등록된 사용제품코드가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" className="min-w-24" onClick={() => onSave(rows)}>
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
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-6xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">일괄등록</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">엑셀 데이터 붙여넣기</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              컬럼 순서: 작업구분, 완성품코드, 타입, 완성품명, 사용제품코드, 부자재, 작업설명, 사용여부
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="일괄등록 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">복사한 데이터</span>
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                className="min-h-[180px] w-full rounded-md border border-input bg-card p-3 font-mono shadow-xs text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                placeholder={"리드레싱\tWM-001\t기본\t완성품명\tPRD001/PRD002\tA11100/A11001/A11002\t설명\t사용"}
              />
            </label>
            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs font-medium leading-5 text-blue-700">
              사용제품코드와 부자재 셀에 `a11100/a11001/a11002`처럼 입력하면 `/` 기준으로 여러 종류로 분리됩니다.
            </div>
            {unknownCodes.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-5 text-amber-700">
                부자재마스터 등록 필요: {unknownCodes.join(", ")}
                <br />
                일괄등록 시 임시 부자재로 등록되며, 추후 부자재마스터에서 상세 등록이 필요합니다.
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-foreground">복사한 데이터를 표형태로 확인</h3>
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                {parsedRows.length}행
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[1080px] text-left text-xs">
                <thead className="bg-muted/60 font-medium text-muted-foreground">
                  <tr>
                    {["작업구분", "완성품코드", "타입", "완성품명", "사용제품코드", "부자재", "작업설명", "사용여부", "확인"].map((header) => (
                      <th key={header} className="h-10 whitespace-nowrap px-3">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {parsedRows.map((row, index) => (
                    <tr key={`${row.code}-${index}`} className="text-foreground">
                      <td className="px-3 py-2.5 font-medium">{row.workType}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground">{row.code || "필수"}</td>
                      <td className="px-3 py-2.5">{row.type}</td>
                      <td className="px-3 py-2.5 font-medium text-foreground">{row.name || "필수"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.productCodes.map((code) => (
                            <span key={code} className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                              {code}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {row.materialCodes.map((code) => (
                            <span
                              key={code}
                              className={`rounded-md px-2 py-0.5 font-medium ring-1 ring-inset ${
                                row.unknownMaterialCodes.includes(code)
                                  ? "bg-amber-50 text-amber-800 ring-amber-600/20"
                                  : "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                              }`}
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2.5">{row.description || "-"}</td>
                      <td className="px-3 py-2.5">{row.isActive ? "사용" : "중지"}</td>
                      <td className="px-3 py-2.5">
                        {row.code && row.name ? (
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">등록가능</span>
                        ) : (
                          <span className="rounded-md bg-red-50 px-2 py-0.5 font-medium text-red-700 ring-1 ring-inset ring-red-600/20">확인필요</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {parsedRows.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm font-medium text-muted-foreground">
                        붙여넣기 한 데이터가 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
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
