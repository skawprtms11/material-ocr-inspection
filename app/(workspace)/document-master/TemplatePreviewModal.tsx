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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-fit rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-4 flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-black text-violet-600">양식 미리보기 (샘플 데이터)</p>
            <h2 className="mt-1 text-xl font-black text-slate-800">
              {template.code} · {template.name}
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-500">개정일자 {template.revision_date}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="미리보기 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-auto rounded-xl bg-slate-100 p-3">
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
