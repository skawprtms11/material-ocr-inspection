"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Printer, X } from "lucide-react";
import { toast } from "sonner";
import { CloudButton } from "@/components/common/CloudButton";
import { DocumentPreviewFrame, DocumentRenderer } from "@/components/documents/DocumentRenderer";
import { getLayoutMeta } from "@/lib/documents/layout-meta";
import type {
  IssueWorkOrderRequest,
  IssueWorkOrderResponse,
  WorkOrderIssueSummaryDto,
  WorkOrderOptionTemplateDto,
  WorkOrderOptionsResponse,
  WorkOrderPrintDataResponse
} from "@/lib/types/document-template";
import type { PendingAssignmentWorkDto } from "@/lib/types/work-register-api";
import { formatDate } from "@/lib/utils/format";

type WorkOrderModalProps = {
  work: PendingAssignmentWorkDto;
  departmentId: string;
  shipperId: string;
  onClose: () => void;
  onIssued: (workId: string, result: IssueWorkOrderResponse, templateName: string) => void;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function layoutLabel(template: WorkOrderOptionTemplateDto["template"]) {
  try {
    return template.layout_key ? getLayoutMeta(template.layout_key).label : template.template_type;
  } catch {
    return template.layout_key ?? template.template_type;
  }
}

export function WorkOrderModal({ work, departmentId, shipperId, onClose, onIssued }: WorkOrderModalProps) {
  const [options, setOptions] = useState<WorkOrderOptionsResponse | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [preview, setPreview] = useState<WorkOrderPrintDataResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);

  const scopeParams = useMemo(() => new URLSearchParams({ department_id: departmentId, shipper_id: shipperId }), [departmentId, shipperId]);

  const loadOptions = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(`/api/work-register/${work.id}/work-order?${scopeParams.toString()}`, { signal });
        const data = (await response.json()) as WorkOrderOptionsResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "작업지시서 정보를 불러오지 못했습니다.");
        setOptions(data);
        setOptionsError(null);
        setSelectedTemplateId((current) => {
          if (current && data.templates.some((item) => item.template.id === current)) return current;
          const fallback = data.templates.find((item) => item.isDefault) ?? data.templates[0];
          return fallback?.template.id ?? "";
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOptionsError(error instanceof Error ? error.message : "작업지시서 정보를 불러오지 못했습니다.");
      }
    },
    [scopeParams, work.id]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadOptions(controller.signal);
    return () => controller.abort();
  }, [loadOptions]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setPreview(null);
      return;
    }

    const controller = new AbortController();
    setPreview(null);
    setPreviewError(null);

    const params = new URLSearchParams(scopeParams);
    params.set("template_id", selectedTemplateId);

    fetch(`/api/work-register/${work.id}/work-order/print-data?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as WorkOrderPrintDataResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "미리보기 데이터를 불러오지 못했습니다.");
        setPreview(data);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPreviewError(error instanceof Error ? error.message : "미리보기 데이터를 불러오지 못했습니다.");
      });

    return () => controller.abort();
  }, [scopeParams, selectedTemplateId, work.id]);

  const selected = options?.templates.find((item) => item.template.id === selectedTemplateId);
  const isAssigned = Boolean(options?.work.assignedAt);

  const handleIssue = async () => {
    if (!selected || isIssuing) return;

    // 팝업 차단을 피하려고 사용자 클릭 시점에 빈 탭을 먼저 연다
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      toast.error("팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해주세요.");
      return;
    }
    printWindow.document.title = "작업지시서";
    printWindow.document.body.innerText = "작업지시서를 준비하는 중입니다...";

    setIsIssuing(true);
    try {
      const response = await fetch(`/api/work-register/${work.id}/work-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ departmentId, shipperId, templateId: selected.template.id } satisfies IssueWorkOrderRequest)
      });
      const result = (await response.json()) as IssueWorkOrderResponse & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "작업지시서 출력에 실패했습니다.");

      printWindow.location.href = result.printUrl;
      onIssued(work.id, result, selected.template.name);
      toast.success(result.assigned ? "작업지시서를 출력하고 작업을 자동 배정했습니다." : "작업지시서를 재출력했습니다.");
      void loadOptions();
    } catch (error) {
      printWindow.close();
      toast.error(error instanceof Error ? error.message : "작업지시서 출력에 실패했습니다.");
    } finally {
      setIsIssuing(false);
    }
  };

  const issues: WorkOrderIssueSummaryDto[] = options?.issues ?? [];
  const noTemplates = options !== null && options.templates.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-5xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">작업지시서</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{work.documentNo}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {work.workType} · {work.finishedProductCode} {work.finishedProductName} · LOT {work.finishedProductLot || "-"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="작업지시서 팝업 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        {optionsError && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
            <span>{optionsError}</span>
            <button type="button" onClick={() => void loadOptions()} className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-red-700 transition-colors hover:bg-red-100">
              다시 시도
            </button>
          </div>
        )}

        {noTemplates && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium leading-6 text-amber-800">
            이 화주에 등록된 작업지시서 양식이 없습니다. 문서마스터 &gt; 화주별양식등록에서 양식을 등록하세요.
            <Link href="/document-master" className="ml-2 underline underline-offset-4">
              문서마스터로 이동
            </Link>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-4">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">양식 선택</h3>
              <div className="space-y-2">
                {(options?.templates ?? []).map((item) => {
                  const active = item.template.id === selectedTemplateId;
                  return (
                    <label
                      key={item.mappingId}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-sm transition-colors ${
                        active ? "border-primary bg-accent" : "border-border bg-card hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="work-order-template"
                        checked={active}
                        onChange={() => setSelectedTemplateId(item.template.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                          {item.template.name}
                          {item.isDefault && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">기본</span>}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.template.code} · 개정 {formatDate(item.template.revision_date)} · {layoutLabel(item.template)}
                        </span>
                      </span>
                    </label>
                  );
                })}
                {options === null && !optionsError && <p className="text-xs text-muted-foreground">양식을 불러오는 중입니다.</p>}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-foreground">출력 이력</h3>
              <div className="overflow-x-auto rounded-md border border-border bg-card">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/60 text-xs font-medium text-muted-foreground">
                    <tr>
                      <th className="h-9 whitespace-nowrap px-3 text-right">순번</th>
                      <th className="whitespace-nowrap px-3 h-9">출력일시</th>
                      <th className="whitespace-nowrap px-3 h-9">양식</th>
                      <th className="whitespace-nowrap px-3 h-9">구분</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-foreground">
                    {issues.map((issue) => (
                      <tr key={issue.id}>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{issue.seq}</td>
                        <td className="px-3 py-2 tabular-nums">{formatDateTime(issue.issued_at)}</td>
                        <td className="px-3 py-2">
                          {issue.template_name}
                          <span className="ml-1 text-muted-foreground">({issue.template_code})</span>
                        </td>
                        <td className="px-3 py-2">{issue.issue_kind === "initial" ? "최초" : "재출력"}</td>
                      </tr>
                    ))}
                    {issues.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                          출력 이력이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-foreground">미리보기</h3>
            <div className="flex min-h-[420px] items-start justify-center overflow-hidden rounded-md bg-muted p-3">
              {preview ? (
                <DocumentPreviewFrame scale={0.5}>
                  <DocumentRenderer template={preview.template} data={preview.data} mode="preview" />
                </DocumentPreviewFrame>
              ) : (
                <p className="self-center text-xs text-muted-foreground">
                  {previewError ?? (selectedTemplateId ? "미리보기를 불러오는 중입니다." : "양식을 선택하면 미리보기가 표시됩니다.")}
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
            닫기
          </CloudButton>
          <CloudButton type="button" className="min-w-24" disabled={!selected || !preview || isIssuing} onClick={() => void handleIssue()}>
            <Printer className="size-4" />
            {isIssuing ? "출력 중..." : isAssigned ? "재출력" : "출력(자동배정)"}
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
