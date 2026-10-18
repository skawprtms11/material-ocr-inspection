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
      <mark className="rounded bg-amber-100 px-0.5 text-slate-900">{text.slice(index, index + normalized.length)}</mark>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-4 flex items-start justify-between gap-6">
          <div>
            <p className="text-xs font-black text-violet-600">화주별양식등록</p>
            <h2 className="mt-1 text-xl font-black text-slate-800">양식 추가 · {shipperName}</h2>
            <p className="mt-1 text-xs font-bold text-slate-500">같은 부서의 사용 중인 양식 중 아직 연결되지 않은 양식만 표시합니다.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="양식 추가 닫기"
            className="inline-flex size-10 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:bg-sky-50"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
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
            className="min-h-11 w-full rounded-full border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-300"
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul role="listbox" className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-2xl bg-white py-1 shadow-lg ring-1 ring-slate-200">
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
                  className={`cursor-pointer px-4 py-2 text-sm font-bold ${index === activeIndex ? "bg-sky-50" : ""}`}
                >
                  <span className="text-sky-700">
                    <Highlight text={template.code} keyword={keyword} />
                  </span>
                  <span className="text-slate-400"> · </span>
                  <span className="text-slate-800">
                    <Highlight text={template.name} keyword={keyword} />
                  </span>
                  <span className="ml-2 text-xs text-slate-400">개정 {template.revision_date}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-4 max-h-80 overflow-y-auto rounded-2xl bg-white ring-1 ring-slate-100">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-sky-50 text-xs font-black text-slate-600">
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
                    className={`cursor-pointer border-t border-slate-100 font-bold ${isSelected ? "bg-sky-50" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex size-5 items-center justify-center rounded-full ring-1 ${isSelected ? "bg-sky-500 text-white ring-sky-500" : "bg-white ring-slate-300"}`}
                      >
                        {isSelected && <Check className="size-3.5" />}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sky-700">
                      <Highlight text={template.code} keyword={keyword} />
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      <Highlight text={template.name} keyword={keyword} />
                    </td>
                    <td className="px-3 py-2 text-slate-500">{template.revision_date}</td>
                    <td className="px-3 py-2 text-slate-500">{templateTypeLabel(template.template_type, template.layout_key)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs font-bold text-slate-400">
                    {candidates.length === 0 ? "추가할 수 있는 양식이 없습니다. 문서양식등록에서 양식을 먼저 등록하세요." : "검색 결과가 없습니다."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="truncate text-xs font-bold text-slate-500">
            {selected ? `선택: ${selected.code} · ${selected.name} (개정 ${selected.revision_date})` : "목록에서 양식을 선택하세요."}
          </p>
          <div className="flex shrink-0 gap-2">
            <CloudButton type="button" tone="soft" onClick={onClose}>
              취소
            </CloudButton>
            <CloudButton type="button" disabled={!selected || isBusy} onClick={() => selected && onSubmit(selected)}>
              등록
            </CloudButton>
          </div>
        </div>
      </div>
    </div>
  );
}
