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
        setError("출력 조건(부서/화주/양식)이 없습니다. 작업등록 화면에서 다시 출력해주세요.");
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
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="min-w-0 text-sm font-black text-slate-700">
          작업지시서 인쇄
          {result && <span className="ml-2 font-bold text-slate-500">{result.data.work.documentNo}</span>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!result}
            className="rounded-full bg-sky-500 px-4 py-2 text-sm font-extrabold text-white transition hover:bg-sky-600 disabled:opacity-50"
          >
            인쇄
          </button>
          <button
            type="button"
            onClick={() => window.close()}
            className="rounded-full bg-white px-4 py-2 text-sm font-extrabold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            닫기
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-auto mt-10 max-w-md rounded-2xl bg-rose-50 px-5 py-4 text-sm font-bold text-rose-700 print:hidden">
          <p>연결 오류: {error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 rounded-full bg-rose-100 px-4 py-1.5 text-rose-800">
            다시 시도
          </button>
        </div>
      )}

      {!result && !error && <p className="mt-10 text-center text-sm font-bold text-slate-500 print:hidden">작업지시서를 불러오는 중입니다...</p>}

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
