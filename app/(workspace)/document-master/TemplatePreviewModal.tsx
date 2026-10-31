"use client";

import { X } from "lucide-react";
import { DocumentPreviewFrame, DocumentRenderer } from "@/components/documents/DocumentRenderer";
import { SAMPLE_WORK_ORDER_DTO } from "@/lib/documents/sample-data";
import type { DocumentTemplate, RenderableTemplate, WorkOrderPrintDto } from "@/lib/types/document-template";

export function buildSampleData(code: string, name: string, revisionDate: string): WorkOrderPrintDto {
  return {
    ...SAMPLE_WORK_ORDER_DTO,
    document: { ...SAMPLE_WORK_ORDER_DTO.document, templateCode: code, templateName: name, revisionDate }
  };
}

export function TemplatePreview({ template, data, scale }: { template: RenderableTemplate; data: WorkOrderPrintDto; scale: number }) {
  return (
    <DocumentPreviewFrame scale={scale}>
      <DocumentRenderer template={template} data={data} mode="preview" />
    </DocumentPreviewFrame>
  );
}

export function TemplatePreviewModal({ template, onClose }: { template: DocumentTemplate; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-fit rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-6 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">양식 미리보기 (샘플 데이터)</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {template.code} · {template.name}
            </h2>
            <p className="mt-1 text-xs font-medium text-muted-foreground">개정일자 {template.revision_date}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="미리보기 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-auto rounded-md bg-slate-100 p-3">
          <TemplatePreview
            template={{ templateType: template.template_type, layoutKey: template.layout_key, settings: template.settings }}
            data={buildSampleData(template.code, template.name, template.revision_date)}
            scale={0.7}
          />
        </div>
      </div>
    </div>
  );
}
