"use client";

import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { getDefaultSettings, resolveSettings } from "@/lib/documents/layout-meta";
import type { DocumentLayoutSettings, DocumentTemplate, LayoutKey, LayoutMetaDto } from "@/lib/types/document-template";
import { TemplatePreview, buildSampleData } from "./TemplatePreviewModal";

export type TemplateFormMode = "create" | "edit" | "revise";

export type TemplateFormValues = {
  code: string;
  name: string;
  revisionDate: string;
  layoutKey: LayoutKey;
  settings: DocumentLayoutSettings;
  isActive: boolean;
  inheritMappings: boolean;
  deactivatePrevious: boolean;
};

type TemplateFormModalProps = {
  mode: TemplateFormMode;
  source: DocumentTemplate | null;
  layouts: LayoutMetaDto[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: TemplateFormValues) => void;
};

const MODE_TITLE: Record<TemplateFormMode, string> = { create: "양식 등록", edit: "양식 수정", revise: "개정 등록" };
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-sky-300 disabled:bg-slate-50 disabled:text-slate-400";
const SECTION_LABELS = [
  ["products", "제품 표"],
  ["materials", "부자재 표"],
  ["memo", "비고란"],
  ["signature", "서명란"]
] as const;

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ring-1 transition ${
        checked ? "bg-sky-500 text-white ring-sky-500" : "bg-white text-slate-500 ring-slate-200 hover:bg-sky-50"
      }`}
    >
      {checked && <Check className="size-3.5" />}
      {label}
    </button>
  );
}

export function TemplateFormModal({ mode, source, layouts, isSaving, onClose, onSubmit }: TemplateFormModalProps) {
  const initialKey: LayoutKey = source?.layout_key ?? layouts[0]?.key ?? "standard";
  const [code, setCode] = useState(source?.code ?? "");
  const [name, setName] = useState(source?.name ?? "");
  const [revisionDate, setRevisionDate] = useState(mode === "edit" && source ? source.revision_date : todayString());
  const [layoutKey, setLayoutKey] = useState<LayoutKey>(initialKey);
  const [settings, setSettings] = useState<DocumentLayoutSettings>(() =>
    source ? resolveSettings(initialKey, source.settings) : getDefaultSettings(initialKey)
  );
  const [isActive, setIsActive] = useState(source?.is_active ?? true);
  const [inheritMappings, setInheritMappings] = useState(true);
  const [deactivatePrevious, setDeactivatePrevious] = useState(true);
  const [error, setError] = useState("");

  const patchSettings = (patch: Partial<DocumentLayoutSettings>) => setSettings((current) => ({ ...current, ...patch }) as DocumentLayoutSettings);
  const changeLayout = (key: LayoutKey) => {
    setLayoutKey(key);
    setSettings((current) => resolveSettings(key, current));
  };

  const approvalLines = settings.approvalLines;
  const previewData = useMemo(() => buildSampleData(code.trim() || "코드", name.trim() || "문서명", revisionDate), [code, name, revisionDate]);

  const submit = () => {
    const cleanLines = approvalLines.map((line) => ({ label: line.label.trim() })).filter((line) => line.label);
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) return setError("문서코드와 문서명을 입력해 주세요.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revisionDate)) return setError("개정일자를 선택해 주세요.");
    if (!settings.headerTitle.trim()) return setError("머리글 제목을 입력해 주세요.");
    setError("");
    onSubmit({
      code: trimmedCode,
      name: trimmedName,
      revisionDate,
      layoutKey,
      settings: { ...settings, headerTitle: settings.headerTitle.trim(), approvalLines: cleanLines },
      isActive,
      inheritMappings,
      deactivatePrevious
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/35 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-6xl rounded-[1.5rem] border border-white/80 bg-[#f8fbff] p-5 shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black text-violet-600">문서양식등록</p>
            <h2 className="mt-1 text-2xl font-black text-slate-800">{MODE_TITLE[mode]}</h2>
            {mode === "revise" && source && (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {source.code} 양식의 새 개정을 등록합니다. 개정일자(코드 동일)가 달라야 합니다.
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

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-black text-slate-500">레이아웃</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {layouts.map((layout) => (
                  <button
                    key={layout.key}
                    type="button"
                    onClick={() => changeLayout(layout.key)}
                    aria-pressed={layoutKey === layout.key}
                    className={`rounded-2xl p-3 text-left ring-1 transition ${
                      layoutKey === layout.key ? "bg-sky-50 ring-2 ring-sky-400" : "bg-white ring-slate-200 hover:bg-sky-50/50"
                    }`}
                  >
                    <span className="block text-sm font-black text-slate-800">{layout.label}</span>
                    <span className="mt-1 block text-xs font-semibold text-slate-500">{layout.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="문서코드 *">
                <input className={inputClass} value={code} maxLength={40} disabled={mode === "revise"} onChange={(event) => setCode(event.target.value)} />
              </Field>
              <Field label="문서명 *">
                <input className={inputClass} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
              </Field>
              <Field label="개정일자 *">
                <input type="date" className={inputClass} value={revisionDate} onChange={(event) => setRevisionDate(event.target.value)} />
              </Field>
              <Field label="머리글 제목 *">
                <input className={inputClass} value={settings.headerTitle} maxLength={60} onChange={(event) => patchSettings({ headerTitle: event.target.value })} />
              </Field>
              <Field label="머리글 부제">
                <input className={inputClass} value={settings.headerSubtitle ?? ""} maxLength={100} onChange={(event) => patchSettings({ headerSubtitle: event.target.value })} />
              </Field>
              <Field label="회사명">
                <input className={inputClass} value={settings.companyName ?? ""} maxLength={60} onChange={(event) => patchSettings({ companyName: event.target.value })} />
              </Field>
            </div>

            <Field label="비고(하단 고정 문구)">
              <textarea
                className={`${inputClass} min-h-16`}
                value={settings.footerNote ?? ""}
                maxLength={500}
                onChange={(event) => patchSettings({ footerNote: event.target.value })}
              />
            </Field>

            <div>
              <p className="mb-2 text-xs font-black text-slate-500">결재란 (최대 5칸)</p>
              <div className="flex flex-wrap items-center gap-2">
                {approvalLines.map((line, index) => (
                  <span key={index} className="inline-flex items-center gap-1 rounded-full bg-white py-1 pl-3 pr-1 ring-1 ring-slate-200">
                    <input
                      aria-label={`결재란 ${index + 1}`}
                      className="w-16 bg-transparent text-xs font-black text-slate-700 outline-none"
                      value={line.label}
                      maxLength={10}
                      onChange={(event) =>
                        patchSettings({ approvalLines: approvalLines.map((item, i) => (i === index ? { label: event.target.value } : item)) })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`결재란 ${index + 1} 삭제`}
                      onClick={() => patchSettings({ approvalLines: approvalLines.filter((_, i) => i !== index) })}
                      className="inline-flex size-6 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                {approvalLines.length < 5 && (
                  <button
                    type="button"
                    onClick={() => patchSettings({ approvalLines: [...approvalLines, { label: "" }] })}
                    className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-black text-sky-700 ring-1 ring-sky-100 hover:bg-sky-100"
                  >
                    <Plus className="size-3.5" />칸 추가
                  </button>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="코드 표시">
                <select
                  className={inputClass}
                  value={settings.code.type}
                  onChange={(event) => patchSettings({ code: { ...settings.code, type: event.target.value as DocumentLayoutSettings["code"]["type"] } })}
                >
                  <option value="qr">QR</option>
                  <option value="none">표시 안 함</option>
                  {settings.code.type === "code128" && <option value="code128">Code128 (미지원)</option>}
                </select>
              </Field>
              <Field label="코드 위치">
                <select
                  className={inputClass}
                  value={settings.code.position}
                  disabled={settings.code.type === "none"}
                  onChange={(event) => patchSettings({ code: { ...settings.code, position: event.target.value as DocumentLayoutSettings["code"]["position"] } })}
                >
                  <option value="header-right">머리글 우측</option>
                  <option value="footer">하단</option>
                </select>
              </Field>
              <Field label="수기 빈 행 (0~10)">
                <input
                  type="number"
                  min={0}
                  max={10}
                  className={inputClass}
                  value={settings.blankRows ?? 0}
                  onChange={(event) => patchSettings({ blankRows: Math.min(10, Math.max(0, Math.trunc(Number(event.target.value) || 0))) })}
                />
              </Field>
            </div>

            <div>
              <p className="mb-2 text-xs font-black text-slate-500">표시 섹션</p>
              <div className="flex flex-wrap gap-2">
                {SECTION_LABELS.map(([key, label]) => (
                  <Toggle key={key} label={label} checked={settings.sections[key]} onChange={(checked) => patchSettings({ sections: { ...settings.sections, [key]: checked } })} />
                ))}
                {layoutKey === "bom-detail" && (
                  <Toggle
                    label="검수방식 표시"
                    checked={"showInspectionMethod" in settings && settings.showInspectionMethod}
                    onChange={(checked) => patchSettings({ showInspectionMethod: checked } as Partial<DocumentLayoutSettings>)}
                  />
                )}
                {layoutKey === "lot-split" && (
                  <Toggle
                    label="LOT 체크칸"
                    checked={"showLotCheckbox" in settings && settings.showLotCheckbox}
                    onChange={(checked) => patchSettings({ showLotCheckbox: checked } as Partial<DocumentLayoutSettings>)}
                  />
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Toggle label="사용" checked={isActive} onChange={setIsActive} />
              {mode === "revise" && (
                <>
                  <Toggle label="기존 개정의 화주 매핑 이어받기" checked={inheritMappings} onChange={setInheritMappings} />
                  <Toggle label="이전 개정 사용중지" checked={deactivatePrevious} onChange={setDeactivatePrevious} />
                </>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs font-black text-slate-500">실시간 미리보기 (샘플 데이터)</p>
            <div className="overflow-hidden rounded-xl bg-slate-100 p-2">
              <TemplatePreview template={{ templateType: "layout", layoutKey, settings }} data={previewData} scale={0.5} />
            </div>
          </div>
        </div>

        {error && <p className="mt-4 rounded-xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <CloudButton type="button" tone="soft" onClick={onClose}>
            취소
          </CloudButton>
          <CloudButton type="button" disabled={isSaving} onClick={submit}>
            <Check className="size-4" />
            {isSaving ? "저장 중..." : "저장"}
          </CloudButton>
        </div>
      </div>
    </div>
  );
}
