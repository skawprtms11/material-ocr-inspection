"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { templateTypeLabel } from "@/lib/documents/template-code";
import type { DocumentTemplate, TemplateType } from "@/lib/types/document-template";
import { inputClass } from "./FormParts";

type TemplateLoaderProps = {
  templates: DocumentTemplate[];
  templateType: TemplateType;
  selectedId: string | null;
  onSelect: (template: DocumentTemplate) => void;
};

// 같은 부서의 해당 분류 양식을 문서명·문서코드로 검색해 고른다. 기본은 코드별 최신 개정만 보인다.
export function TemplateLoader({ templates, templateType, selectedId, onSelect }: TemplateLoaderProps) {
  const [keyword, setKeyword] = useState("");
  const [includeRevisions, setIncludeRevisions] = useState(false);

  const candidates = useMemo(() => {
    const ofType = templates.filter((template) => template.template_type === templateType);
    const latestByCode = new Map<string, string>();
    for (const template of ofType) {
      const latest = latestByCode.get(template.code);
      if (!latest || template.revision_date > latest) latestByCode.set(template.code, template.revision_date);
    }
    const needle = keyword.trim().toLowerCase();
    return ofType
      .filter((template) => includeRevisions || template.revision_date === latestByCode.get(template.code))
      .filter((template) => !needle || template.name.toLowerCase().includes(needle) || template.code.toLowerCase().includes(needle))
      .sort((a, b) => a.code.localeCompare(b.code) || b.revision_date.localeCompare(a.revision_date));
  }, [templates, templateType, keyword, includeRevisions]);

  const hasAny = templates.some((template) => template.template_type === templateType);

  return (
    <div className="rounded-md bg-card p-3 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">기존 문서 불러오기</p>
        <label className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <input type="checkbox" checked={includeRevisions} onChange={(event) => setIncludeRevisions(event.target.checked)} />
          개정 포함
        </label>
      </div>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className={`${inputClass} pl-9`}
          placeholder="문서명 또는 문서코드로 검색"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </div>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
        {candidates.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              onClick={() => onSelect(template)}
              aria-pressed={selectedId === template.id}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-xs font-medium ring-1 transition-colors ${
                selectedId === template.id ? "bg-accent ring-2 ring-primary" : "bg-card ring-border hover:bg-muted/50"
              }`}
            >
              <span className="font-medium text-foreground">{template.code}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{template.name}</span>
              <span className="text-muted-foreground">{template.revision_date}</span>
              <span className="text-muted-foreground">{templateTypeLabel(template.template_type, template.layout_key)}</span>
              {!template.is_active && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-muted-foreground">중지</span>}
            </button>
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="py-3 text-center text-xs font-medium text-muted-foreground">
            {hasAny ? "검색 결과가 없습니다." : "등록된 문서가 없습니다."}
          </li>
        )}
      </ul>
    </div>
  );
}
