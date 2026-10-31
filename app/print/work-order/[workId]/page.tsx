"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { DocumentRenderer } from "@/components/documents/DocumentRenderer";
import type { WorkOrderPrintDataResponse } from "@/lib/types/document-template";

const CODE_READY_TIMEOUT_MS = 5000;

function waitForCodeReady() {
  return new Promise<void>((resolve) => {
    const startedAt = Date.now();
    const check = () => {
      const pending = document.querySelectorAll('[data-code-ready="false"]').length;
      if (pending === 0 || Date.now() - startedAt > CODE_READY_TIMEOUT_MS) {
        resolve();
        return;
      }
      window.setTimeout(check, 100);
    };
    check();
  });
}

function WorkOrderPrintContent() {
  const { workId } = useParams<{ workId: string }>();
  const searchParams = useSearchParams();
  const departmentId = searchParams.get("department_id") ?? "";
  const shipperId = searchParams.get("shipper_id") ?? "";
  const issueId = searchParams.get("issue_id") ?? "";
  const templateId = searchParams.get("template_id") ?? "";
  const autoPrint = searchParams.get("autoprint") === "1";

  const [result, setResult] = useState<WorkOrderPrintDataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoPrintedRef = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!departmentId || !shipperId || (!issueId && !templateId)) {
        setError("출력 조건(부서/화주/양식)이 없습니다. 작업등록 화면에서 다시 출력해 주세요.");
        return;
      }

      setError(null);
      try {
        const params = new URLSearchParams({ department_id: departmentId, shipper_id: shipperId });
        // mock print-data는 template_id로만 양식을 찾으므로 issue_id가 있어도 함께 보낸다(실DB는 issue_id 우선).
        if (issueId) params.set("issue_id", issueId);
        if (templateId) params.set("template_id", templateId);

        const response = await fetch(`/api/work-register/${workId}/work-order/print-data?${params.toString()}`, { signal });
        const data = (await response.json()) as WorkOrderPrintDataResponse & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "작업지시서 데이터를 불러오지 못했습니다.");
        setResult(data);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "작업지시서 데이터를 불러오지 못했습니다.");
      }
    },
    [departmentId, issueId, shipperId, templateId, workId]
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!result || !autoPrint || autoPrintedRef.current) return;
    autoPrintedRef.current = true;

    let cancelled = false;
    void (async () => {
      await waitForCodeReady();
      await document.fonts?.ready;
      // 렌더 직후 한 프레임을 더 기다려 QR SVG가 레이아웃에 반영된 뒤 인쇄한다
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      if (!cancelled) window.print();
    })();

    return () => {
      cancelled = true;
      autoPrintedRef.current = false;
    };
  }, [autoPrint, result]);

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 shadow-xs print:hidden">
        <div className="min-w-0 text-sm font-semibold text-foreground">
          작업지시서 인쇄
          {result && <span className="ml-2 font-normal text-muted-foreground">{result.data.work.documentNo}</span>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!result}
            className="inline-flex min-h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            인쇄
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="inline-flex min-h-9 items-center rounded-md border border-input bg-card px-4 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            닫기
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-auto mt-10 max-w-md rounded-md border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 print:hidden">
          <p>연결 오류: {error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 inline-flex min-h-9 items-center rounded-md border border-red-200 bg-card px-4 text-sm font-medium text-red-700 hover:bg-red-100">
            다시 시도
          </button>
        </div>
      )}

      {!result && !error && <p className="mt-10 text-center text-sm text-muted-foreground print:hidden">작업지시서를 불러오는 중입니다...</p>}

      {result && (
        <div className="py-6 print:py-0">
          <DocumentRenderer template={result.template} data={result.data} mode="print" />
        </div>
      )}
    </>
  );
}

export default function WorkOrderPrintPage() {
  return (
    <Suspense fallback={null}>
      <WorkOrderPrintContent />
    </Suspense>
  );
}
