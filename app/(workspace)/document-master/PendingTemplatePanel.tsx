"use client";

import { useState } from "react";
import { Construction } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { TEMPLATE_TYPE_META } from "@/lib/documents/template-code";
import type { DocumentTemplate, TemplateType } from "@/lib/types/document-template";
import { TemplateLoader } from "./TemplateLoader";

type PendingTemplatePanelProps = {
  templateType: Exclude<TemplateType, "layout">;
  description: string;
  templates: DocumentTemplate[];
  onClose: () => void;
};

// 추후 정의 분류 공통 화면: 안내 영역 + 불러오기 목록 + 비활성 저장 버튼.
export function PendingTemplatePanel({ templateType, description, templates, onClose }: PendingTemplatePanelProps) {
  const [selected, setSelected] = useState<DocumentTemplate | null>(null);
  const meta = TEMPLATE_TYPE_META[templateType];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-5">
        <Construction className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-amber-800">{meta.label} 양식은 준비 중입니다 (추후 정의)</p>
          <p className="mt-1 text-xs text-amber-700">{description}</p>
          <p className="mt-1 text-xs text-amber-700">
            문서코드는 저장 시 {meta.codePrefix}0001 형식으로 자동채번될 예정입니다.
          </p>
        </div>
      </div>
      <TemplateLoader templates={templates} templateType={templateType} selectedId={selected?.id ?? null} onSelect={setSelected} />
      {selected && (
        <p className="rounded-md bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
          선택: {selected.code} · {selected.name} ({selected.revision_date}) — 불러온 값을 채울 화면은 추후 정의됩니다.
        </p>
      )}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
          취소
        </CloudButton>
        <CloudButton type="button" className="min-w-24" disabled>
          저장 (준비 중)
        </CloudButton>
      </div>
    </div>
  );
}
