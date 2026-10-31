"use client";

import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { CloudButton } from "@/components/common/CloudButton";
import { getDefaultSettings, resolveSettings } from "@/lib/documents/layout-meta";
import { nextTemplateCode } from "@/lib/documents/template-code";
import type { DocumentLayoutSettings, DocumentTemplate, LayoutKey, LayoutMetaDto } from "@/lib/types/document-template";
import { Field, Toggle, inputClass, todayString } from "./FormParts";
import { TemplateLoader } from "./TemplateLoader";
import { TemplatePreview, buildSampleData } from "./TemplatePreviewModal";

export type TemplateFormMode = "create" | "edit" | "revise";
export type TemplateSaveMode = "new" | "revision";

export type TemplateFormValues = {
  saveMode: TemplateSaveMode;
  // 새 개정 저장 시 기준 문서(코드·매핑 승계·이전 개정 중지 대상). 새 문서 저장이면 null
  basis: DocumentTemplate | null;
  name: string;
  revisionDate: string;
  layoutKey: LayoutKey;
  settings: DocumentLayoutSettings;
  isActive: boolean;
  inheritMappings: boolean;
  deactivatePrevious: boolean;
};

type BasicLayoutPanelProps = {
  mode: TemplateFormMode;
  source: DocumentTemplate | null;
  templates: DocumentTemplate[];
  layouts: LayoutMetaDto[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (values: TemplateFormValues) => void;
};

const SECTION_LABELS = [
  ["products", "제품 표"],
  ["materials", "부자재 표"],
  ["memo", "비고란"],
  ["signature", "서명란"]
] as const;

// 기본형(template_type 'layout'): 표준/BOM 상세/LOT 분할 레이아웃 + 설정 + 실시간 미리보기.
export function BasicLayoutPanel({ mode, source, templates, layouts, isSaving, onClose, onSubmit }: BasicLayoutPanelProps) {
  const isEdit = mode === "edit";
  const initialKey: LayoutKey = source?.layout_key ?? layouts[0]?.key ?? "standard";
  const [basis, setBasis] = useState<DocumentTemplate | null>(source);
  const [saveMode, setSaveMode] = useState<TemplateSaveMode>(mode === "revise" ? "revision" : "new");
  const [name, setName] = useState(source?.name ?? "");
  const [revisionDate, setRevisionDate] = useState(isEdit && source ? source.revision_date : todayString());
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

  const loadTemplate = (template: DocumentTemplate) => {
    const key = template.layout_key ?? layouts[0]?.key ?? "standard";
    setBasis(template);
    setName(template.name);
    setLayoutKey(key);
    setSettings(resolveSettings(key, template.settings));
    setIsActive(true);
    setRevisionDate(todayString());
    setError("");
  };

  const isRevision = !isEdit && saveMode === "revision" && basis !== null;
  const expectedCode = useMemo(() => nextTemplateCode("layout", templates.map((template) => template.code)).code, [templates]);
  const codeText = isEdit ? (source?.code ?? "") : isRevision ? basis!.code : `${expectedCode} (자동채번)`;

  const approvalLines = settings.approvalLines;
  const previewCode = isEdit || isRevision ? codeText : "자동채번";
  const previewData = useMemo(() => buildSampleData(previewCode, name.trim() || "문서명", revisionDate), [previewCode, name, revisionDate]);

  const submit = () => {
    const cleanLines = approvalLines.map((line) => ({ label: line.label.trim() })).filter((line) => line.label);
    const trimmedName = name.trim();
    if (!trimmedName) return setError("문서명을 입력해 주세요.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revisionDate)) return setError("개정일자를 선택해 주세요.");
    if (!settings.headerTitle.trim()) return setError("머리글 제목을 입력해 주세요.");
    if (isRevision && templates.some((template) => template.code === basis!.code && template.revision_date === revisionDate)) {
      return setError(`${basis!.code}에 같은 개정일자(${revisionDate})의 개정이 이미 있습니다. 다른 개정일자를 입력해 주세요.`);
    }
    setError("");
    onSubmit({
      saveMode: isRevision ? "revision" : "new",
      basis: isRevision ? basis : null,
      name: trimmedName,
      revisionDate,
      layoutKey,
      settings: { ...settings, headerTitle: settings.headerTitle.trim(), approvalLines: cleanLines },
      isActive,
      inheritMappings,
      deactivatePrevious
    });
  };

  const radioClass = (active: boolean, disabled = false) =>
    `inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
      disabled ? "cursor-not-allowed bg-muted text-muted-foreground opacity-50 ring-border" : active ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-muted-foreground ring-input hover:bg-muted hover:text-foreground"
    }`;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-4">
          {!isEdit && (
            <>
              <TemplateLoader templates={templates} templateType="layout" selectedId={basis?.id ?? null} onSelect={loadTemplate} />
              {basis && (
                <p className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700">
                  불러옴: {basis.code} · {basis.name} ({basis.revision_date}) — 기존 문서는 덮어쓰지 않고 아래 저장 방식대로 새로 저장됩니다.
                </p>
              )}
            </>
          )}

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">기본형 레이아웃</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {layouts.map((layout) => (
                <button
                  key={layout.key}
                  type="button"
                  onClick={() => changeLayout(layout.key)}
                  aria-pressed={layoutKey === layout.key}
                  className={`rounded-md p-3 text-left ring-1 transition-colors ${
                    layoutKey === layout.key ? "bg-accent ring-2 ring-primary" : "bg-card ring-input hover:bg-muted/50"
                  }`}
                >
                  <span className="block text-sm font-medium text-foreground">{layout.label}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{layout.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="문서코드">
              <input className={inputClass} value={codeText} readOnly disabled />
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
            <p className="mb-2 text-xs font-medium text-muted-foreground">결재란 (최대 5칸)</p>
            <div className="flex flex-wrap items-center gap-2">
              {approvalLines.map((line, index) => (
                <span key={index} className="inline-flex items-center gap-1 rounded-md bg-card py-1 pl-3 pr-1 ring-1 ring-input">
                  <input
                    aria-label={`결재란 ${index + 1}`}
                    className="w-16 bg-transparent text-xs font-medium text-foreground outline-none"
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
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {approvalLines.length < 5 && (
                <button
                  type="button"
                  onClick={() => patchSettings({ approvalLines: [...approvalLines, { label: "" }] })}
                  className="inline-flex items-center gap-1 rounded-md bg-card px-3 py-1.5 text-xs font-medium text-foreground ring-1 ring-input hover:bg-accent hover:text-accent-foreground"
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
            <p className="mb-2 text-xs font-medium text-muted-foreground">표시 섹션</p>
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
          </div>

          {!isEdit && (
            <div className="rounded-md bg-card p-3 ring-1 ring-border">
              <p className="mb-2 text-xs font-medium text-muted-foreground">저장 방식</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={!isRevision} className={radioClass(!isRevision)} onClick={() => setSaveMode("new")}>
                  새 문서로 저장 (새 코드 자동채번)
                </button>
                <button
                  type="button"
                  aria-pressed={isRevision}
                  disabled={!basis}
                  className={radioClass(isRevision, !basis)}
                  onClick={() => setSaveMode("revision")}
                >
                  새 개정으로 저장 (같은 코드){!basis && " · 불러오기 후 선택"}
                </button>
              </div>
              {isRevision && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Toggle label="기존 개정의 화주 매핑 이어받기" checked={inheritMappings} onChange={setInheritMappings} />
                  <Toggle label="이전 개정 사용중지" checked={deactivatePrevious} onChange={setDeactivatePrevious} />
                </div>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {isRevision
                  ? `${basis!.code}의 새 개정으로 저장합니다. 개정일자가 기존 개정과 달라야 하며 기존 문서는 그대로 보존됩니다.`
                  : "새 문서로 저장하면 화주 매핑은 승계되지 않으며 기존 문서는 그대로 보존됩니다."}
              </p>
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-4 lg:self-start">
          <p className="mb-2 text-xs font-medium text-muted-foreground">실시간 미리보기 (샘플 데이터)</p>
          <div className="overflow-hidden rounded-md bg-slate-100 p-2">
            <TemplatePreview template={{ templateType: "layout", layoutKey, settings }} data={previewData} scale={0.5} />
          </div>
        </div>
      </div>

      {error && <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">{error}</p>}

      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <CloudButton type="button" tone="soft" className="min-w-24" onClick={onClose}>
          취소
        </CloudButton>
        <CloudButton type="button" className="min-w-24" disabled={isSaving} onClick={submit}>
          <Check className="size-4" />
          {isSaving ? "저장 중..." : isRevision ? "새 개정으로 저장" : isEdit ? "수정 저장" : "새 문서로 저장"}
        </CloudButton>
      </div>
    </>
  );
}
