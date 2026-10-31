"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { templateTypeLabel } from "@/lib/documents/template-code";
import type { DocumentTemplate } from "@/lib/types/document-template";

const MAX_SUGGESTIONS = 8;

/** 문서코드·문서명에 검색어가 포함된 양식만 남긴다(대소문자 무시). */
function matchTemplates(templates: DocumentTemplate[], keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return templates;
  return templates.filter(
    (template) => template.code.toLowerCase().includes(normalized) || template.name.toLowerCase().includes(normalized)
  );
}

/** 검색어와 일치하는 부분을 강조 표시한다. */
function Highlight({ text, keyword }: { text: string; keyword: string }) {
  const normalized = keyword.trim().toLowerCase();
  const index = normalized ? text.toLowerCase().indexOf(normalized) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-amber-100 px-0.5 text-foreground">{text.slice(index, index + normalized.length)}</mark>
      {text.slice(index + normalized.length)}
    </>
  );
}

/**
 * 화주에 추가할 양식을 고르는 팝업.
 * 문서코드·문서명 자동완성 검색 + 후보 목록에서 1건을 선택해 등록한다.
 */
export function TemplatePickerModal({
  shipperName,
  candidates,
  isBusy,
  onSubmit,
  onClose
}: {
  shipperName: string;
  candidates: DocumentTemplate[];
  isBusy: boolean;
  onSubmit: (template: DocumentTemplate) => void;
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => matchTemplates(candidates, keyword), [candidates, keyword]);
  const suggestions = keyword.trim() ? filtered.slice(0, MAX_SUGGESTIONS) : [];
  const selected = candidates.find((template) => template.id === selectedId) ?? null;

  const pick = (template: DocumentTemplate) => {
    setSelectedId(template.id);
    setKeyword(template.code);
    setSuggestOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen || suggestions.length === 0) {
      if (event.key === "Escape") onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(suggestions[Math.min(activeIndex, suggestions.length - 1)]);
    } else if (event.key === "Escape") {
      setSuggestOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center-safe justify-center overflow-y-auto bg-slate-950/50 px-4 py-8">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-6 border-b border-border pb-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">화주별양식등록</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">양식 추가 · {shipperName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">같은 부서의 사용 중인 양식 중 아직 연결되지 않은 양식만 표시합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="양식 추가 닫기"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            autoFocus
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setSelectedId("");
              setSuggestOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
            onKeyDown={handleKeyDown}
            placeholder="문서코드 또는 문서명으로 검색"
            aria-label="양식 검색"
            role="combobox"
            aria-expanded={suggestOpen && suggestions.length > 0}
            aria-autocomplete="list"
            className="h-9 w-full rounded-md border border-input bg-card pl-11 pr-4 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul role="listbox" className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md bg-popover py-1 shadow-md ring-1 ring-border">
              {suggestions.map((template, index) => (
                <li
                  key={template.id}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(template);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`cursor-pointer px-4 py-2 text-sm font-medium ${index === activeIndex ? "bg-accent" : ""}`}
                >
                  <span className="font-medium text-foreground">
                    <Highlight text={template.code} keyword={keyword} />
                  </span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-foreground">
                    <Highlight text={template.name} keyword={keyword} />
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">개정 {template.revision_date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 max-h-80 overflow-y-auto rounded-md bg-card ring-1 ring-border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted text-xs font-medium text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2">문서코드</th>
                <th className="px-3 py-2">문서명</th>
                <th className="px-3 py-2">개정일자</th>
                <th className="px-3 py-2">분류·레이아웃</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((template) => {
                const isSelected = template.id === selectedId;
                return (
                  <tr
                    key={template.id}
                    onClick={() => setSelectedId(template.id)}
                    className={`cursor-pointer border-t border-border ${isSelected ? "bg-accent" : "hover:bg-muted/50"}`}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex size-5 items-center justify-center rounded-full ring-1 ${isSelected ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-input"}`}
                      >
                        {isSelected && <Check className="size-3.5" />}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      <Highlight text={template.code} keyword={keyword} />
                    </td>
                    <td className="px-3 py-2 text-foreground">
                      <Highlight text={template.name} keyword={keyword} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{template.revision_date}</td>
                    <td className="px-3 py-2 text-muted-foreground">{templateTypeLabel(template.template_type, template.layout_key)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs font-medium text-muted-foreground">
                    {candidates.length === 0 ? "추가할 수 있는 양식이 없습니다. 문서양식등록에서 양식을 먼저 등록하세요." : "검색 결과가 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="truncate text-xs font-medium text-muted-foreground">
            {selected ? `선택: ${selected.code} · ${selected.name} (개정 ${selected.revision_date})` : "목록에서 양식을 선택하세요."}
          </p>
          <div className="flex shrink-0 gap-2">
            <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="button" className="min-w-24" disabled={!selected || isBusy} onClick={() => selected && onSubmit(selected)}>
              등록
            </CloudButton>
          </div>
        </div>
      </div>
    </div>
  );
}
