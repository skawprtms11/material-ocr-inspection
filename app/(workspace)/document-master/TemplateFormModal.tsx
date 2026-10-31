"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { TEMPLATE_TYPES, TEMPLATE_TYPE_META } from "@/lib/documents/template-code";
import type { DocumentTemplate, LayoutMetaDto, TemplateType } from "@/lib/types/document-template";
import { BasicLayoutPanel, type TemplateFormMode, type TemplateFormValues } from "./BasicLayoutPanel";
import { EditorTemplatePanel } from "./EditorTemplatePanel";
import { ShipperFileTemplatePanel } from "./ShipperFileTemplatePanel";

export type { TemplateFormMode, TemplateFormValues };

type TemplateFormModalProps = {
  mode: TemplateFormMode;
  source: DocumentTemplate | null;
  templates: DocumentTemplate[];
  layouts: LayoutMetaDto[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: TemplateFormValues) => void;
};

const MODE_TITLE: Record<TemplateFormMode, string> = { create: "양식 등록", edit: "양식 수정", revise: "개정 등록" };
const TYPE_HINT: Record<TemplateType, string> = {
  layout: "표준·BOM 상세·LOT 분할 중 선택",
  editor: "추후 정의",
  file: "추후 정의"
};

// 분류(기본형/양식제작/화주양식) 선택 셸. 분류별 화면은 각 Panel 컴포넌트가 맡는다.
export function TemplateFormModal({ mode, source, templates, layouts, isSaving, onClose, onSubmit }: TemplateFormModalProps) {
  const [category, setCategory] = useState<TemplateType>("layout");
  const fixed = mode !== "create";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-6xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">문서양식등록</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{MODE_TITLE[mode]}</h2>
            {mode === "revise" && source && (
              <p className="mt-1 text-sm text-muted-foreground">
                {source.code} 양식을 불러왔습니다. 새 개정으로 저장하면 같은 코드로 개정일자만 달리해 등록됩니다.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">양식 분류</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                disabled={fixed && type !== "layout"}
                onClick={() => setCategory(type)}
                aria-pressed={category === type}
                className={`rounded-md p-3 text-left ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  category === type ? "bg-accent ring-2 ring-primary" : "bg-card ring-input hover:bg-muted/50"
                }`}
              >
                <span className="block text-sm font-medium text-foreground">{TEMPLATE_TYPE_META[type].label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{TYPE_HINT[type]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={category === "layout" ? "" : "hidden"}>
          <BasicLayoutPanel
            mode={mode}
            source={source}
            templates={templates}
            layouts={layouts}
            isSaving={isSaving}
            onClose={onClose}
            onSubmit={onSubmit}
          />
        </div>
        {category === "editor" && <EditorTemplatePanel templates={templates} onClose={onClose} />}
        {category === "file" && <ShipperFileTemplatePanel templates={templates} onClose={onClose} />}
      </div>
    </div>
  );
}
