"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FilePlus2, GitBranchPlus, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { CuteCard } from "@/components/common/CuteCard";
import { DataTable } from "@/components/common/DataTable";
import type {
  CreateDocumentTemplateRequest,
  DocumentTemplateListItemDto,
  DocumentTemplateListResponse,
  LayoutMetaDto,
  UpdateDocumentTemplateRequest
} from "@/lib/types/document-template";
import { templateTypeLabel } from "@/lib/documents/template-code";
import { DataStatusBar } from "./DataStatusBar";
import { TemplateFormModal, type TemplateFormMode, type TemplateFormValues } from "./TemplateFormModal";
import { TemplatePreviewModal } from "./TemplatePreviewModal";

type ErrorBody = { error?: string };

async function requestJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & ErrorBody;
  if (!response.ok) throw new Error(data.error ?? fallback);
  return data;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

export function TemplateTab({ departmentId }: { departmentId: string }) {
  const [templates, setTemplates] = useState<DocumentTemplateListItemDto[]>([]);
  const [layouts, setLayouts] = useState<LayoutMetaDto[]>([]);
  const [source, setSource] = useState<"supabase" | "mock" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [latestOnly, setLatestOnly] = useState(true);
  const [preview, setPreview] = useState<DocumentTemplateListItemDto | null>(null);
  const [form, setForm] = useState<{ mode: TemplateFormMode; target: DocumentTemplateListItemDto | null } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ department_id: departmentId, include_inactive: "true" });
      const data = await requestJson<DocumentTemplateListResponse>(`/api/document-templates?${params}`, {}, "문서양식 조회에 실패했습니다.");
      setTemplates(data.templates);
      setLayouts(data.layouts);
      setSource(data.source);
      setLoadError(false);
      if (data.warning) toast.warning(`Supabase 대신 mock 데이터로 표시합니다. ${data.warning}`);
    } catch (error) {
      setLoadError(true);
      toast.error(error instanceof Error ? error.message : "문서양식 조회에 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTemplates = useMemo(() => {
    if (!latestOnly) return templates;
    const latestByCode = new Map<string, string>();
    for (const template of templates) {
      const latest = latestByCode.get(template.code);
      if (!latest || template.revision_date > latest) latestByCode.set(template.code, template.revision_date);
    }
    return templates.filter((template) => template.revision_date === latestByCode.get(template.code));
  }, [latestOnly, templates]);

  const patchTemplate = async (templateId: string, body: Omit<UpdateDocumentTemplateRequest, "departmentId">) => {
    const result = await requestJson<{ source: "supabase" | "mock" }>(
      `/api/document-templates/${templateId}`,
      jsonInit("PATCH", { departmentId, ...body }),
      "문서양식 수정에 실패했습니다."
    );
    return result.source;
  };

  // mock 모드는 서버 데이터가 바뀌지 않으므로 화면 상태만 갱신한다.
  const refreshAfterWrite = async (writeSource: "supabase" | "mock", localUpdate: () => void) => {
    setSource(writeSource);
    if (writeSource === "supabase") await load();
    else localUpdate();
  };

  const toggleActive = async (template: DocumentTemplateListItemDto) => {
    try {
      const writeSource = await patchTemplate(template.id, { isActive: !template.is_active });
      await refreshAfterWrite(writeSource, () =>
        setTemplates((current) => current.map((item) => (item.id === template.id ? { ...item, is_active: !template.is_active } : item)))
      );
      toast.success(template.is_active ? "사용중지로 전환했습니다." : "다시 사용으로 전환했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "문서양식 수정에 실패했습니다.");
    }
  };

  const removeTemplate = async (template: DocumentTemplateListItemDto) => {
    if (!window.confirm(`${template.code} (${template.revision_date}) 양식을 삭제할까요?`)) return;
    try {
      const params = new URLSearchParams({ department_id: departmentId });
      const result = await requestJson<{ source: "supabase" | "mock" }>(
        `/api/document-templates/${template.id}?${params}`,
        { method: "DELETE" },
        "문서양식 삭제에 실패했습니다."
      );
      await refreshAfterWrite(result.source, () => setTemplates((current) => current.filter((item) => item.id !== template.id)));
      toast.success("양식을 삭제했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "문서양식 삭제에 실패했습니다.");
    }
  };

  const submitForm = async (values: TemplateFormValues) => {
    if (!form) return;
    setIsSaving(true);
    try {
      if (form.mode === "edit" && form.target) {
        const writeSource = await patchTemplate(form.target.id, {
          name: values.name,
          revisionDate: values.revisionDate,
          layoutKey: values.layoutKey,
          settings: values.settings,
          isActive: values.isActive
        });
        const targetId = form.target.id;
        await refreshAfterWrite(writeSource, () =>
          setTemplates((current) =>
            current.map((item) =>
              item.id === targetId
                ? {
                    ...item,
                    name: values.name,
                    revision_date: values.revisionDate,
                    layout_key: values.layoutKey,
                    settings: values.settings,
                    is_active: values.isActive
                  }
                : item
            )
          )
        );
        toast.success("양식을 수정했습니다.");
      } else {
        const basis = values.saveMode === "revision" ? values.basis : null;
        const payload: CreateDocumentTemplateRequest = {
          departmentId,
          ...(basis ? { code: basis.code } : {}),
          name: values.name,
          revisionDate: values.revisionDate,
          templateType: "layout",
          layoutKey: values.layoutKey,
          settings: values.settings,
          isActive: values.isActive,
          ...(basis && values.inheritMappings ? { inheritFromTemplateId: basis.id } : {})
        };
        const created = await requestJson<{ source: "supabase" | "mock"; template: DocumentTemplateListItemDto }>(
          "/api/document-templates",
          jsonInit("POST", payload),
          "문서양식 등록에 실패했습니다."
        );

        if (basis && values.deactivatePrevious) {
          try {
            await patchTemplate(basis.id, { isActive: false });
          } catch (error) {
            toast.warning(`새 개정은 등록됐으나 이전 개정 사용중지에 실패했습니다. ${error instanceof Error ? error.message : ""}`);
          }
        }

        const previousId = basis?.id;
        await refreshAfterWrite(created.source, () =>
          setTemplates((current) => [
            { ...created.template, mappedShipperCount: 0 },
            ...current.map((item) => (basis && values.deactivatePrevious && item.id === previousId ? { ...item, is_active: false } : item))
          ])
        );
        toast.success(basis ? `${created.template.code} 새 개정을 등록했습니다.` : `${created.template.code} 양식을 등록했습니다.`);
      }
      setForm(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "문서양식 저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const iconButton = "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-black ring-1 transition";

  return (
    <>
      <DataStatusBar
        message={isLoading ? "문서양식을 불러오는 중이에요." : "선택된 부서의 작업지시서 양식을 관리합니다."}
        source={source}
        loadError={loadError}
        onRetry={() => void load()}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-xs font-black text-slate-600">
          <input type="checkbox" checked={latestOnly} onChange={(event) => setLatestOnly(event.target.checked)} />
          최신 개정만 보기
        </label>
        <CloudButton type="button" onClick={() => setForm({ mode: "create", target: null })} disabled={layouts.length === 0}>
          <Plus className="size-4" />
          양식 등록
        </CloudButton>
      </div>

      <CuteCard>
        <DataTable
          headers={["문서코드", "문서명", "개정일자", "분류·레이아웃", "사용여부", "매핑 화주", "관리"]}
          rows={visibleTemplates.map((template) => [
            <span key="code" className="font-black text-sky-700">
              {template.code}
            </span>,
            <span key="name" className="font-black text-slate-800">
              {template.name}
            </span>,
            <span key="rev" className="font-bold text-slate-700">
              {template.revision_date}
            </span>,
            <span key="layout" className="font-bold text-slate-600">
              {templateTypeLabel(template.template_type, template.layout_key)}
            </span>,
            <span
              key="active"
              className={`rounded-full px-3 py-1 text-xs font-black ${template.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
            >
              {template.is_active ? "사용" : "중지"}
            </span>,
            <span key="count" className="block text-right font-black text-slate-700">
              {template.mappedShipperCount}
            </span>,
            <div key="actions" className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setPreview(template)} className={`${iconButton} bg-violet-50 text-violet-700 ring-violet-100 hover:bg-violet-100`}>
                <Eye className="size-3.5" />
                미리보기
              </button>
              <button type="button" disabled={template.template_type !== "layout"} title={template.template_type !== "layout" ? "준비 중(추후 정의)" : undefined} onClick={() => setForm({ mode: "edit", target: template })} className={`${iconButton} bg-white text-slate-600 ring-slate-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40`}>
                <Pencil className="size-3.5" />
                수정
              </button>
              <button type="button" disabled={template.template_type !== "layout"} title={template.template_type !== "layout" ? "준비 중(추후 정의)" : undefined} onClick={() => setForm({ mode: "revise", target: template })} className={`${iconButton} bg-white text-slate-600 ring-slate-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40`}>
                <GitBranchPlus className="size-3.5" />
                개정
              </button>
              <button type="button" onClick={() => void toggleActive(template)} className={`${iconButton} bg-amber-50 text-amber-800 ring-amber-100 hover:bg-amber-100`}>
                <Power className="size-3.5" />
                {template.is_active ? "사용중지" : "사용"}
              </button>
              <button type="button" onClick={() => void removeTemplate(template)} className={`${iconButton} bg-rose-50 text-rose-700 ring-rose-100 hover:bg-rose-100`}>
                <Trash2 className="size-3.5" />
                삭제
              </button>
            </div>
          ])}
        />
        {visibleTemplates.length === 0 && (
          <p className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-slate-400">
            <FilePlus2 className="size-4" />
            {isLoading ? "불러오는 중..." : "등록된 양식이 없습니다. 양식 등록으로 시작해 보세요."}
          </p>
        )}
      </CuteCard>

      {preview && <TemplatePreviewModal template={preview} onClose={() => setPreview(null)} />}
      {form && (
        <TemplateFormModal
          mode={form.mode}
          source={form.target}
          templates={templates}
          layouts={layouts}
          isSaving={isSaving}
          onClose={() => setForm(null)}
          onSubmit={(values) => void submitForm(values)}
        />
      )}
    </>
  );
}
