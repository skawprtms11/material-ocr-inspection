"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Plus, Star, Unlink } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { useFilterStore } from "@/lib/state/filter-store";
import type { Shipper } from "@/lib/types/domain";
import type {
  DocumentTemplate,
  ShipperDocumentMappingDto,
  ShipperDocumentTemplateListResponse
} from "@/lib/types/document-template";
import { DataStatusBar } from "./DataStatusBar";
import { TemplatePickerModal } from "./TemplatePickerModal";
import { TemplatePreviewModal } from "./TemplatePreviewModal";

type Source = "supabase" | "mock";

async function requestJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? fallback);
  return data;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

export function ShipperMappingTab({ departmentId }: { departmentId: string }) {
  const { shipperId, setShipperId } = useFilterStore();
  const [shippers, setShippers] = useState<Shipper[]>([]);
  const [mappings, setMappings] = useState<ShipperDocumentMappingDto[]>([]);
  const [candidates, setCandidates] = useState<DocumentTemplate[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [preview, setPreview] = useState<DocumentTemplate | null>(null);

  const selectedShipper = shippers.find((shipper) => shipper.id === shipperId) ?? null;
  const activeShipperId = selectedShipper?.id ?? "";

  const loadShippers = useCallback(async () => {
    try {
      const data = await requestJson<{ source: Source; shippers: Shipper[] }>(
        `/api/shipper-master?${new URLSearchParams({ department_id: departmentId })}`,
        {},
        "화주 목록 조회에 실패했습니다."
      );
      setShippers(data.shippers);
      setSource(data.source);
      setLoadError(false);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "화주 목록 조회에 실패했습니다.");
    }
  }, [departmentId]);

  const loadMappings = useCallback(async () => {
    if (!activeShipperId) {
      setMappings([]);
      setCandidates([]);
      return;
    }
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ department_id: departmentId, shipper_id: activeShipperId });
      const data = await requestJson<ShipperDocumentTemplateListResponse>(`/api/shipper-document-templates?${params}`, {}, "화주별 양식 조회에 실패했습니다.");
      setMappings(data.mappings);
      setCandidates(data.candidates);
      setSource(data.source);
      setLoadError(false);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "화주별 양식 조회에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [activeShipperId, departmentId]);

  useEffect(() => {
    void loadShippers();
  }, [loadShippers]);

  useEffect(() => {
    void loadMappings();
  }, [loadMappings]);

  const sorted = useMemo(() => [...mappings].sort((a, b) => a.sort_order - b.sort_order), [mappings]);
  const scopeBody = { departmentId, shipperId: activeShipperId };

  const run = async (action: () => Promise<void>, fallback: string) => {
    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback);
      await loadMappings();
    } finally {
      setIsBusy(false);
    }
  };

  const addMapping = (template: DocumentTemplate) =>
    run(async () => {
      const result = await requestJson<{ source: Source; mapping: ShipperDocumentMappingDto }>(
        "/api/shipper-document-templates",
        jsonInit("POST", { ...scopeBody, templateId: template.id }),
        "양식 추가에 실패했습니다."
      );
      if (result.source === "supabase") await loadMappings();
      else {
        const first = mappings.length === 0;
        setMappings((current) => [
          ...current,
          { ...result.mapping, template, is_default: first, sort_order: current.reduce((max, item) => Math.max(max, item.sort_order), 0) + 1 }
        ]);
        setCandidates((current) => current.filter((item) => item.id !== template.id));
        setSource("mock");
      }
      setPickerOpen(false);
      toast.success("화주에 양식을 추가했습니다.");
    }, "양식 추가에 실패했습니다.");

  const setDefault = (mapping: ShipperDocumentMappingDto) =>
    run(async () => {
      const result = await requestJson<{ source: Source }>(
        `/api/shipper-document-templates/${mapping.id}`,
        jsonInit("PATCH", { ...scopeBody, isDefault: true }),
        "기본 양식 지정에 실패했습니다."
      );
      if (result.source === "supabase") await loadMappings();
      else setMappings((current) => current.map((item) => ({ ...item, is_default: item.id === mapping.id })));
      toast.success("기본 양식으로 지정했습니다.");
    }, "기본 양식 지정에 실패했습니다.");

  // 인접 항목과 순서를 바꾼 뒤 1..n으로 재부여하며, 값이 달라진 행만 저장한다.
  const move = (index: number, delta: -1 | 1) =>
    run(async () => {
      const next = [...sorted];
      const target = index + delta;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      const changed = next.map((item, i) => ({ item, order: i + 1 })).filter(({ item, order }) => item.sort_order !== order);
      let writeSource: Source = source ?? "mock";
      for (const { item, order } of changed) {
        const result = await requestJson<{ source: Source }>(
          `/api/shipper-document-templates/${item.id}`,
          jsonInit("PATCH", { ...scopeBody, sortOrder: order }),
          "정렬 저장에 실패했습니다."
        );
        writeSource = result.source;
      }
      if (writeSource === "supabase") await loadMappings();
      else {
        const orderById = new Map(changed.map(({ item, order }) => [item.id, order]));
        setMappings((current) => current.map((item) => ({ ...item, sort_order: orderById.get(item.id) ?? item.sort_order })));
      }
    }, "정렬 저장에 실패했습니다.");

  const removeMapping = (mapping: ShipperDocumentMappingDto) =>
    run(async () => {
      if (!window.confirm(`${mapping.template.code} 양식을 이 화주에서 해제할까요?`)) return;
      const params = new URLSearchParams({ department_id: departmentId, shipper_id: activeShipperId });
      const result = await requestJson<{ source: Source; warning?: string }>(
        `/api/shipper-document-templates/${mapping.id}?${params}`,
        { method: "DELETE" },
        "양식 해제에 실패했습니다."
      );
      if (result.source === "supabase") await loadMappings();
      else {
        const promoted = mapping.is_default
          ? sorted.find((item) => item.id !== mapping.id && item.template.is_active)?.id
          : undefined;
        setMappings((current) =>
          current.filter((item) => item.id !== mapping.id).map((item) => (promoted ? { ...item, is_default: item.id === promoted } : item))
        );
        setCandidates((current) => (mapping.template.is_active ? [...current, mapping.template] : current));
      }
      toast.success("양식을 해제했습니다.");
      if (result.warning) toast.error(result.warning);
    }, "양식 해제에 실패했습니다.");

  const iconButton = "inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium ring-1 ring-inset transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <>
      <DataStatusBar
        message={isLoading ? "화주별 양식을 불러오는 중입니다." : "화주를 선택하고 사용할 양식을 추가·정렬합니다."}
        source={source}
        loadError={loadError}
        onRetry={() => {
          void loadShippers();
          void loadMappings();
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <CuteCard className="self-start p-3">
          <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">화주 선택</p>
          <div className="space-y-1.5">
            {shippers.map((shipper) => (
              <button
                key={shipper.id}
                type="button"
                onClick={() => setShipperId(shipper.id)}
                aria-pressed={shipper.id === activeShipperId}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                  shipper.id === activeShipperId ? "bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted"
                }`}
              >
                <span>{shipper.name}</span>
                <span className={`text-xs ${shipper.id === activeShipperId ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{shipper.code}</span>
              </button>
            ))}
            {shippers.length === 0 && <p className="px-2 py-6 text-center text-xs font-medium text-muted-foreground">부서에 등록된 화주가 없습니다.</p>}
          </div>
        </CuteCard>

        <CuteCard>
          {!selectedShipper ? (
            <p className="py-16 text-center text-sm font-medium text-muted-foreground">왼쪽에서 화주를 선택해 주세요.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">화주별 양식</p>
                  <h2 className="text-base font-semibold text-foreground">{selectedShipper.name}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CloudButton type="button" disabled={isBusy} onClick={() => setPickerOpen(true)}>
                    <Plus className="size-4" />
                    양식 추가
                  </CloudButton>
                </div>
              </div>

              <ul className="space-y-2">
                {sorted.map((mapping, index) => (
                  <li key={mapping.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-card px-4 py-3 ring-1 ring-border">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex size-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">{index + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          <span className="font-semibold">{mapping.template.code}</span> · {mapping.template.name}
                        </p>
                        <p className="text-xs font-medium text-muted-foreground">개정일자 {mapping.template.revision_date}</p>
                      </div>
                      {mapping.is_default && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">기본</span>}
                      {!mapping.template.is_active && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-500/20">사용중지</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" aria-label="위로" disabled={isBusy || index === 0} onClick={() => void move(index, -1)} className={`${iconButton} bg-card text-foreground ring-input hover:bg-accent hover:text-accent-foreground`}>
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button type="button" aria-label="아래로" disabled={isBusy || index === sorted.length - 1} onClick={() => void move(index, 1)} className={`${iconButton} bg-card text-foreground ring-input hover:bg-accent hover:text-accent-foreground`}>
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button type="button" disabled={isBusy || mapping.is_default} onClick={() => void setDefault(mapping)} className={`${iconButton} bg-amber-50 text-amber-800 ring-amber-600/20 hover:bg-amber-100`}>
                        <Star className="size-3.5" />
                        기본 지정
                      </button>
                      <button type="button" onClick={() => setPreview(mapping.template)} className={`${iconButton} bg-card text-foreground ring-input hover:bg-accent hover:text-accent-foreground`}>
                        <Eye className="size-3.5" />
                        미리보기
                      </button>
                      <button type="button" disabled={isBusy} onClick={() => void removeMapping(mapping)} className={`${iconButton} bg-red-50 text-red-700 ring-red-600/20 hover:bg-red-100`}>
                        <Unlink className="size-3.5" />
                        해제
                      </button>
                    </div>
                  </li>
                ))}
                {sorted.length === 0 && (
                  <li className="py-10 text-center text-sm font-medium text-muted-foreground">
                    {isLoading ? "불러오는 중..." : "이 화주에 지정된 양식이 없습니다. 양식을 추가하세요."}
                  </li>
                )}
              </ul>
            </div>
          )}
        </CuteCard>
      </div>

      {preview && <TemplatePreviewModal template={preview} onClose={() => setPreview(null)} />}
      {pickerOpen && selectedShipper && (
        <TemplatePickerModal
          shipperName={selectedShipper.name}
          candidates={candidates}
          isBusy={isBusy}
          onSubmit={(template) => void addMapping(template)}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </>
  );
}
