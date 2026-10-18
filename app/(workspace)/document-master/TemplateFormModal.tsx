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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-6xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-violet-600">문서양식등록</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{MODE_TITLE[mode]}</h2>
            {mode === "revise" && source && (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {source.code} 양식을 불러왔습니다. 새 개정으로 저장하면 같은 코드로 개정일자만 달리해 등록됩니다.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="mb-2 text-xs font-black text-slate-500">양식 분류</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {TEMPLATE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                disabled={fixed && type !== "layout"}
                onClick={() => setCategory(type)}
                aria-pressed={category === type}
                className={`rounded-2xl p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  category === type ? "bg-violet-50 ring-2 ring-violet-400" : "bg-white ring-slate-200 hover:bg-violet-50/50"
                }`}
              >
                <span className="block text-sm font-black text-slate-800">{TEMPLATE_TYPE_META[type].label}</span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">{TYPE_HINT[type]}</span>
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
