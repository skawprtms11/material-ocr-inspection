import type { LayoutKey, TemplateType } from "@/lib/types/document-template";

// 분류(template_type)별 라벨·문서코드 접두어. 접두어 + 4자리 일련번호가 부서 단위로 이어진다.
export const TEMPLATE_TYPE_META: Record<TemplateType, { label: string; codePrefix: string; ready: boolean }> = {
  layout: { label: "기본형", codePrefix: "WO-B-", ready: true },
  editor: { label: "양식제작", codePrefix: "WO-E-", ready: false },
  file: { label: "화주양식", codePrefix: "WO-S-", ready: false }
};

export const TEMPLATE_TYPES: TemplateType[] = ["layout", "editor", "file"];

export const CODE_SEQ_DIGITS = 4;
export const MAX_CODE_SEQ = 10 ** CODE_SEQ_DIGITS - 1;

export const LAYOUT_SHORT_LABEL: Record<LayoutKey, string> = {
  standard: "표준",
  "bom-detail": "BOM 상세",
  "lot-split": "LOT 분할"
};

export function formatTemplateCode(templateType: TemplateType, seq: number) {
  return `${TEMPLATE_TYPE_META[templateType].codePrefix}${String(seq).padStart(CODE_SEQ_DIGITS, "0")}`;
}

// 접두어 패턴에 맞는 코드만 대상으로 최대 번호+1을 구한다(다른 형식 코드는 무시).
export function nextTemplateCode(templateType: TemplateType, existingCodes: string[]) {
  const prefix = TEMPLATE_TYPE_META[templateType].codePrefix;
  const pattern = new RegExp(`^${prefix}(\\d{${CODE_SEQ_DIGITS}})$`);
  let max = 0;
  for (const code of existingCodes) {
    const match = pattern.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return { code: formatTemplateCode(templateType, max + 1), seq: max + 1 };
}

export function templateTypeLabel(templateType: TemplateType, layoutKey: LayoutKey | null) {
  const base = TEMPLATE_TYPE_META[templateType]?.label ?? templateType;
  return templateType === "layout" && layoutKey ? `${base}·${LAYOUT_SHORT_LABEL[layoutKey] ?? layoutKey}` : base;
}
